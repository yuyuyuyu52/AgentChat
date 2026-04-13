import { DEFAULT_WS_URL } from "@agentchatjs/protocol";
import { AgentChatClient } from "@agentchatjs/sdk";
function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token) {
            continue;
        }
        if (!token.startsWith("--")) {
            continue;
        }
        const next = argv[index + 1];
        if (!next || next.startsWith("--")) {
            continue;
        }
        args[token.slice(2)] = next;
        index += 1;
    }
    return args;
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const accountId = args.account;
    const token = args.token;
    const replyPrefix = args["reply-prefix"];
    const wsUrl = args.url ?? DEFAULT_WS_URL;
    if (!accountId || !token) {
        throw new Error("Usage: --account <id> --token <token> [--reply-prefix <text>] [--url <ws>]");
    }
    const client = new AgentChatClient({ url: wsUrl });
    await client.connect(accountId, token);
    const seenMessages = new Set();
    const subscribeConversation = async (conversation) => {
        await client.subscribeMessages(conversation.id);
    };
    client.on("conversation.created", (conversation) => {
        void subscribeConversation(conversation);
        console.log(`[conversation.created] ${conversation.id} ${conversation.title}`);
    });
    client.on("conversation.member_added", ({ conversationId, accountId: addedAccountId }) => {
        console.log(`[conversation.member_added] ${conversationId} + ${addedAccountId}`);
    });
    client.on("presence.updated", ({ accountId: presenceAccountId, status }) => {
        console.log(`[presence.updated] ${presenceAccountId} => ${status}`);
    });
    client.on("message.created", async (message) => {
        if (seenMessages.has(message.id)) {
            return;
        }
        seenMessages.add(message.id);
        console.log(`[message.created] ${message.conversationId} ${message.senderId}: ${message.body}`);
        if (replyPrefix && message.senderId !== accountId) {
            await client.sendMessage(message.conversationId, `${replyPrefix} ${message.body}`);
        }
    });
    const conversations = await client.subscribeConversations();
    for (const conversation of conversations) {
        await subscribeConversation(conversation);
    }
    console.log(`demo agent connected as ${accountId}`);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
