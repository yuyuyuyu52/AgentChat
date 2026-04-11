import { DEFAULT_HTTP_URL } from "@agentchat/protocol";

type Flags = Record<string, string | boolean>;

class AdminHttpClient {
  constructor(private readonly baseUrl: string) {}

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

Optional flags:
  --url <http://127.0.0.1:43110>
`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const client = new AdminHttpClient(
    typeof flags.url === "string" ? flags.url : DEFAULT_HTTP_URL,
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

  throw new Error(`Unknown command: ${command.join(" ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
