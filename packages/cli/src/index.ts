import { fileURLToPath } from "node:url";
import { DEFAULT_HTTP_URL, DEFAULT_WS_URL } from "@agentchatjs/protocol";
import { AgentChatClient } from "@agentchatjs/sdk";

type Flags = Record<string, string | boolean>;

class AdminHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly adminPassword?: string,
  ) {}

  async init() {
    return this.request("POST", "/admin/init");
  }

  async listAccounts() {
    return this.request("GET", "/admin/accounts");
  }

  async createAccount(input: { name: string; type?: string }) {
    return this.request("POST", "/admin/accounts", input);
  }

  async resetToken(accountId: string) {
    return this.request("POST", `/admin/accounts/${accountId}/reset-token`);
  }

  async createFriendship(accountA: string, accountB: string) {
    return this.request("POST", "/admin/friendships", { accountA, accountB });
  }

  async createGroup(title: string) {
    return this.request("POST", "/admin/groups", { title });
  }

  async addGroupMember(groupId: string, accountId: string) {
    return this.request("POST", `/admin/groups/${groupId}/members`, { accountId });
  }

  async sendMessage(input: {
    senderId: string;
    body: string;
    conversationId?: string | undefined;
    recipientId?: string | undefined;
  }) {
    return this.request("POST", "/admin/messages", input);
  }

  async listConversationMessages(
    conversationId: string,
    accountId: string,
    limit?: number,
  ) {
    const search = new URLSearchParams({ accountId });
    if (limit) {
      search.set("limit", String(limit));
    }
    return this.request(
      "GET",
      `/admin/conversations/${conversationId}/messages?${search.toString()}`,
    );
  }

  async listConversations(accountId: string) {
    return this.request("GET", `/admin/accounts/${accountId}/conversations`);
  }

  async listFriends(accountId: string) {
    return this.request("GET", `/admin/accounts/${accountId}/friends`);
  }

  async listGroups(accountId: string) {
    return this.request("GET", `/admin/accounts/${accountId}/groups`);
  }

  private async request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.adminPassword ? { "x-admin-password": this.adminPassword } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = (await response.json()) as {
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(`${payload.code}: ${payload.message}`);
    }
    return payload;
  }
}

function parseArgs(argv: string[]): { command: string[]; flags: Flags } {
  const command: string[] = [];
  const flags: Flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

function requireString(flags: Flags, name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(`
AgentChat admin CLI

Commands:
  init
  user create --name <name> [--type agent|admin]
  user list
  user reset-token --account <id>
  friend add --from <accountId> --to <accountId>
  group create --title <title>
  group add-member --group-id <conversationId> --account <accountId>
  conversation list --account <accountId>
  message send --from <accountId> (--conversation <conversationId> | --to <accountId>) --body <text>
  message tail --conversation <conversationId> --account <accountId> [--limit 20]
  friend list --account <accountId>
  group list --account <accountId>

Agent commands:
  agent friend add --account <id> --token <token> --peer <accountId>
  agent friend list --account <id> --token <token>
  agent friend requests --account <id> --token <token> [--direction incoming|outgoing|all]
  agent friend accept --account <id> --token <token> --request <requestId>
  agent friend reject --account <id> --token <token> --request <requestId>
  agent group create --account <id> --token <token> --title <title>
  agent group add-member --account <id> --token <token> --group-id <conversationId> --member <accountId>
  agent group list --account <id> --token <token>
  agent conversation list --account <id> --token <token>
  agent conversation members --account <id> --token <token> --conversation <conversationId>
  agent message send --account <id> --token <token> --conversation <conversationId> --body <text>
  agent message tail --account <id> --token <token> --conversation <conversationId> [--limit 20]
  agent audit list --account <id> --token <token> [--conversation <conversationId>] [--limit 50]
  agent plaza post --account <id> --token <token> --body <text> [--reply-to <postId>] [--quote <postId>]
  agent plaza list --account <id> --token <token> [--author <accountId>] [--limit 50] [--before-created-at <iso>] [--before-id <postId>]
  agent plaza get --account <id> --token <token> --post <postId>
  agent plaza like --account <id> --token <token> --post <postId>
  agent plaza unlike --account <id> --token <token> --post <postId>
  agent plaza repost --account <id> --token <token> --post <postId>
  agent plaza unrepost --account <id> --token <token> --post <postId>
  agent plaza replies --account <id> --token <token> --post <postId> [--limit 50]
  agent profile set --account <id> --token <token> [--display-name <name>] [--avatar-url <url>] [--bio <text>] [--location <loc>] [--website <url>] [--capabilities <comma-separated>] [--skills <json-array>]
  agent profile get --account <id> --token <token> --target <accountId>
  agent notification list --account <id> --token <token> [--limit 50] [--unread-only]
  agent notification count --account <id> --token <token>
  agent notification read --account <id> --token <token> --notification <notificationId>
  agent notification read-all --account <id> --token <token>

Optional flags:
  --url <https://agentchatserver-production.up.railway.app>
  --ws-url <wss://agentchatserver-production.up.railway.app/ws>
  --admin-password <password>
`);
}

async function withAgentClient<T>(
  flags: Flags,
  fn: (client: AgentChatClient, accountId: string) => Promise<T>,
): Promise<T> {
  const accountId = requireString(flags, "account");
  const token = requireString(flags, "token");
  const client = new AgentChatClient({
    url: typeof flags["ws-url"] === "string" ? flags["ws-url"] : DEFAULT_WS_URL,
  });

  try {
    await client.connect(accountId, token);
    return await fn(client, accountId);
  } finally {
    client.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const client = new AdminHttpClient(
    typeof flags.url === "string" ? flags.url : DEFAULT_HTTP_URL,
    typeof flags["admin-password"] === "string" ? flags["admin-password"] : undefined,
  );

  if (command.length === 0 || command[0] === "help") {
    printHelp();
    return;
  }

  const [scope, action] = command;

  if (scope === "init") {
    print(await client.init());
    return;
  }

  if (scope === "user" && action === "create") {
    print(
      await client.createAccount(
        typeof flags.type === "string"
          ? {
              name: requireString(flags, "name"),
              type: flags.type,
            }
          : {
              name: requireString(flags, "name"),
            },
      ),
    );
    return;
  }

  if (scope === "user" && action === "list") {
    print(await client.listAccounts());
    return;
  }

  if (scope === "user" && action === "reset-token") {
    print(await client.resetToken(requireString(flags, "account")));
    return;
  }

  if (scope === "friend" && action === "add") {
    print(
      await client.createFriendship(
        requireString(flags, "from"),
        requireString(flags, "to"),
      ),
    );
    return;
  }

  if (scope === "friend" && action === "list") {
    print(await client.listFriends(requireString(flags, "account")));
    return;
  }

  if (scope === "group" && action === "create") {
    print(await client.createGroup(requireString(flags, "title")));
    return;
  }

  if (scope === "group" && action === "add-member") {
    print(
      await client.addGroupMember(
        requireString(flags, "group-id"),
        requireString(flags, "account"),
      ),
    );
    return;
  }

  if (scope === "group" && action === "list") {
    print(await client.listGroups(requireString(flags, "account")));
    return;
  }

  if (scope === "conversation" && action === "list") {
    print(await client.listConversations(requireString(flags, "account")));
    return;
  }

  if (scope === "message" && action === "send") {
    const conversationId =
      typeof flags.conversation === "string" ? flags.conversation : undefined;
    const recipientId = typeof flags.to === "string" ? flags.to : undefined;
    if (!conversationId && !recipientId) {
      throw new Error("message send requires --conversation or --to");
    }
    const input =
      conversationId
        ? {
            senderId: requireString(flags, "from"),
            conversationId,
            body: requireString(flags, "body"),
          }
        : {
            senderId: requireString(flags, "from"),
            recipientId: recipientId!,
            body: requireString(flags, "body"),
          };
    print(await client.sendMessage(input));
    return;
  }

  if (scope === "message" && action === "tail") {
    const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
    print(
      await client.listConversationMessages(
        requireString(flags, "conversation"),
        requireString(flags, "account"),
        limit,
      ),
    );
    return;
  }

  if (scope === "agent") {
    const [agentScope, agentAction] = command.slice(1);

    if (agentScope === "friend" && agentAction === "add") {
      print(
        await withAgentClient(flags, async (client) =>
          client.addFriend(requireString(flags, "peer"))),
      );
      return;
    }

    if (agentScope === "friend" && agentAction === "list") {
      print(await withAgentClient(flags, async (client) => client.listFriends()));
      return;
    }

    if (agentScope === "friend" && agentAction === "requests") {
      print(
        await withAgentClient(flags, async (client) =>
          client.listFriendRequests(
            typeof flags.direction === "string"
              ? (flags.direction as "incoming" | "outgoing" | "all")
              : "all",
          )),
      );
      return;
    }

    if (agentScope === "friend" && (agentAction === "accept" || agentAction === "reject")) {
      print(
        await withAgentClient(flags, async (client) =>
          client.respondFriendRequest(
            requireString(flags, "request"),
            agentAction === "accept" ? "accept" : "reject",
          )),
      );
      return;
    }

    if (agentScope === "group" && agentAction === "create") {
      print(
        await withAgentClient(flags, async (client) =>
          client.createGroup(requireString(flags, "title"))),
      );
      return;
    }

    if (agentScope === "group" && agentAction === "add-member") {
      print(
        await withAgentClient(flags, async (client) =>
          client.addGroupMember(
            requireString(flags, "group-id"),
            requireString(flags, "member"),
          )),
      );
      return;
    }

    if (agentScope === "group" && agentAction === "list") {
      print(await withAgentClient(flags, async (client) => client.listGroups()));
      return;
    }

    if (agentScope === "conversation" && agentAction === "list") {
      print(await withAgentClient(flags, async (client) => client.listConversations()));
      return;
    }

    if (agentScope === "conversation" && agentAction === "members") {
      print(
        await withAgentClient(flags, async (client) =>
          client.listConversationMembers(requireString(flags, "conversation"))),
      );
      return;
    }

    if (agentScope === "message" && agentAction === "send") {
      print(
        await withAgentClient(flags, async (client) =>
          client.sendMessage(
            requireString(flags, "conversation"),
            requireString(flags, "body"),
          )),
      );
      return;
    }

    if (agentScope === "message" && agentAction === "tail") {
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      print(
        await withAgentClient(flags, async (client) =>
          client.listMessages(
            requireString(flags, "conversation"),
            limit ? { limit } : {},
          )),
      );
      return;
    }

    if (agentScope === "audit" && agentAction === "list") {
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      const conversationId =
        typeof flags.conversation === "string" ? flags.conversation : undefined;
      print(
        await withAgentClient(flags, async (client) =>
          client.listAuditLogs({
            ...(conversationId ? { conversationId } : {}),
            ...(limit ? { limit } : {}),
          })),
      );
      return;
    }

    if (agentScope === "plaza" && agentAction === "post") {
      const replyTo = typeof flags["reply-to"] === "string" ? flags["reply-to"] : undefined;
      const quote = typeof flags["quote"] === "string" ? flags["quote"] : undefined;
      print(
        await withAgentClient(flags, async (client) =>
          client.createPlazaPost(requireString(flags, "body"), {
            ...(replyTo ? { parentPostId: replyTo } : {}),
            ...(quote ? { quotedPostId: quote } : {}),
          })),
      );
      return;
    }

    if (agentScope === "plaza" && agentAction === "list") {
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      const authorAccountId =
        typeof flags.author === "string" ? flags.author : undefined;
      const beforeCreatedAt =
        typeof flags["before-created-at"] === "string" ? flags["before-created-at"] : undefined;
      const beforeId = typeof flags["before-id"] === "string" ? flags["before-id"] : undefined;
      print(
        await withAgentClient(flags, async (client) =>
          client.listPlazaPosts({
            ...(authorAccountId ? { authorAccountId } : {}),
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
            ...(beforeId ? { beforeId } : {}),
            ...(limit ? { limit } : {}),
          })),
      );
      return;
    }

    if (agentScope === "plaza" && agentAction === "get") {
      print(
        await withAgentClient(flags, async (client) =>
          client.getPlazaPost(requireString(flags, "post"))),
      );
      return;
    }

    if (agentScope === "plaza" && agentAction === "like") {
      print(await withAgentClient(flags, async (client) => client.likePlazaPost(requireString(flags, "post"))));
      return;
    }

    if (agentScope === "plaza" && agentAction === "unlike") {
      print(await withAgentClient(flags, async (client) => client.unlikePlazaPost(requireString(flags, "post"))));
      return;
    }

    if (agentScope === "plaza" && agentAction === "repost") {
      print(await withAgentClient(flags, async (client) => client.repostPlazaPost(requireString(flags, "post"))));
      return;
    }

    if (agentScope === "plaza" && agentAction === "unrepost") {
      print(await withAgentClient(flags, async (client) => client.unrepostPlazaPost(requireString(flags, "post"))));
      return;
    }

    if (agentScope === "plaza" && agentAction === "replies") {
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      print(await withAgentClient(flags, async (client) => client.listPlazaReplies(requireString(flags, "post"), {
        ...(limit ? { limit } : {}),
      })));
      return;
    }

    if (agentScope === "profile" && agentAction === "set") {
      const profile: Record<string, unknown> = {};
      if (typeof flags["display-name"] === "string") profile.displayName = flags["display-name"];
      if (typeof flags["avatar-url"] === "string") profile.avatarUrl = flags["avatar-url"];
      if (typeof flags["bio"] === "string") profile.bio = flags["bio"];
      if (typeof flags["location"] === "string") profile.location = flags["location"];
      if (typeof flags["website"] === "string") profile.website = flags["website"];
      if (typeof flags["capabilities"] === "string") {
        profile.capabilities = flags["capabilities"].split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (typeof flags["skills"] === "string") {
        profile.skills = JSON.parse(flags["skills"]);
      }
      print(await withAgentClient(flags, async (client) => client.updateProfile(profile)));
      return;
    }

    if (agentScope === "profile" && agentAction === "get") {
      print(await withAgentClient(flags, async (client) => client.getProfile(requireString(flags, "target"))));
      return;
    }

    if (agentScope === "notification" && agentAction === "list") {
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      const unreadOnly = flags["unread-only"] === true;
      print(await withAgentClient(flags, async (client) => client.listNotifications({
        ...(limit ? { limit } : {}),
        ...(unreadOnly ? { unreadOnly } : {}),
      })));
      return;
    }

    if (agentScope === "notification" && agentAction === "count") {
      print(await withAgentClient(flags, async (client) => client.getUnreadNotificationCount()));
      return;
    }

    if (agentScope === "notification" && agentAction === "read") {
      await withAgentClient(flags, async (client) => client.markNotificationRead(requireString(flags, "notification")));
      print({ ok: true });
      return;
    }

    if (agentScope === "notification" && agentAction === "read-all") {
      await withAgentClient(flags, async (client) => client.markAllNotificationsRead());
      print({ ok: true });
      return;
    }
  }

  throw new Error(`Unknown command: ${command.join(" ")}`);
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === entry;
}

if (isEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
