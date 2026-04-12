import { Pool } from "pg";
import { AgentChatServer } from "@agentchat/server";
import { afterEach, describe, expect, it } from "vitest";

const POSTGRES_URL = process.env.AGENTCHAT_TEST_POSTGRES_URL;
const shouldRun = Boolean(POSTGRES_URL);

async function resetDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      TRUNCATE TABLE
        audit_logs,
        sessions,
        messages,
        conversation_members,
        friend_requests,
        friendships,
        conversations,
        human_users,
        accounts
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await pool.end();
  }
}

async function createPostgresServer() {
  if (!POSTGRES_URL) {
    throw new Error("AGENTCHAT_TEST_POSTGRES_URL is required");
  }
  const server = new AgentChatServer({
    port: 0,
    storageDriver: "postgres",
    databaseUrl: POSTGRES_URL,
  });
  await server.start();
  return server;
}

describe.runIf(shouldRun)("Postgres storage", () => {
  const resources: AgentChatServer[] = [];

  afterEach(async () => {
    while (resources.length > 0) {
      const server = resources.pop();
      if (!server) {
        continue;
      }
      await server.stop();
    }
    if (POSTGRES_URL) {
      await resetDatabase(POSTGRES_URL);
    }
  });

  it("boots against an empty database and can restart idempotently", async () => {
    const server = await createPostgresServer();
    resources.push(server);

    const alice = await server.createAccount({ name: "alice-pg" });
    expect(alice.id).toMatch(/^acct_/);

    await server.stop();
    resources.pop();

    const restarted = await createPostgresServer();
    resources.push(restarted);
    const health = await fetch(`${restarted.httpUrl}/admin/health`);
    expect(health.status).toBe(200);
    expect((await health.json()) as { databasePath: string }).toMatchObject({
      databasePath: expect.stringContaining("postgres"),
    });
  });

  it("supports the core persistence flows on postgres", async () => {
    const server = await createPostgresServer();
    resources.push(server);

    const owner = await server.createAccount({
      name: "owner-pg",
      owner: {
        subject: "owner-subject",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    const peer = await server.createAccount({ name: "peer-pg" });
    const gamma = await server.createAccount({ name: "gamma-pg" });

    const friendship = await server.createFriendship(owner.id, peer.id);
    const requestsBefore = await server.listFriendRequests(owner.id, "all");
    expect(requestsBefore).toHaveLength(0);

    const request = await server.addFriendAs(owner.id, gamma.id);
    const gammaIncoming = await server.listFriendRequests(gamma.id, "incoming");
    expect(gammaIncoming.map((item) => item.id)).toContain(request.requestId);

    const accepted = await server.respondFriendRequestAs(gamma.id, request.requestId, "accept");
    expect("conversationId" in accepted && accepted.conversationId).toBeTruthy();

    const group = await server.createGroupAs(owner.id, "ops-pg");
    await server.addGroupMemberAs(owner.id, group.id, gamma.id);

    await server.sendAdminMessage({
      senderId: owner.id,
      conversationId: friendship.conversationId,
      body: "hello from postgres",
    });
    await server.sendAdminMessage({
      senderId: owner.id,
      conversationId: group.id,
      body: "group hello from postgres",
    });

    const ownerConversations = await server.listConversations(owner.id);
    expect(ownerConversations.map((conversation) => conversation.id)).toEqual(
      expect.arrayContaining([friendship.conversationId, group.id]),
    );

    const ownedConversations = await server.listOwnedConversations("owner-subject");
    expect(ownedConversations.map((conversation) => conversation.id)).toContain(group.id);

    const groupMessages = await server.listConversationMessages(owner.id, group.id, undefined, 20);
    expect(groupMessages.at(-1)?.body).toBe("group hello from postgres");

    const audit = await server.listAuditLogsForAccount(owner.id, { limit: 20 });
    expect(audit.some((entry) => entry.eventType === "message.sent")).toBe(true);
    expect(audit.some((entry) => entry.eventType === "group.member_added")).toBe(true);
  });

  it("allocates monotonic per-conversation message seq values under concurrency", async () => {
    const server = await createPostgresServer();
    resources.push(server);

    const alice = await server.createAccount({ name: "seq-alice" });
    const bob = await server.createAccount({ name: "seq-bob" });
    const friendship = await server.createFriendship(alice.id, bob.id);

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        server.sendAdminMessage({
          senderId: index % 2 === 0 ? alice.id : bob.id,
          conversationId: friendship.conversationId,
          body: `msg-${index + 1}`,
        })),
    );

    const messages = await server.listConversationMessages(alice.id, friendship.conversationId, undefined, 50);
    expect(messages).toHaveLength(20);
    expect(messages.map((message) => message.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
});
