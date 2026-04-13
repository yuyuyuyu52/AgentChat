import { setTimeout as delay } from "node:timers/promises";
import { AgentChatClient } from "@agentchatjs/sdk";
import { ServerFrameSchema } from "@agentchatjs/protocol";
import { AgentChatServer } from "@agentchat/server";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

const POSTGRES_URL = process.env.AGENTCHAT_TEST_POSTGRES_URL;
const shouldRun = Boolean(POSTGRES_URL);

async function resetDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      TRUNCATE TABLE
        oauth_states,
        user_auth_sessions,
        admin_auth_sessions,
        audit_logs,
        sessions,
        plaza_posts,
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

async function createServer() {
  if (!POSTGRES_URL) {
    throw new Error("AGENTCHAT_TEST_POSTGRES_URL is required");
  }
  const server = new AgentChatServer({
    port: 0,
    databaseUrl: POSTGRES_URL,
  });
  await server.start();
  return server;
}

async function createProtectedServer() {
  if (!POSTGRES_URL) {
    throw new Error("AGENTCHAT_TEST_POSTGRES_URL is required");
  }
  const server = new AgentChatServer({
    port: 0,
    databaseUrl: POSTGRES_URL,
    adminPassword: "secret-pass",
  });
  await server.start();
  return server;
}

async function expectEvent<T>(
  client: AgentChatClient,
  eventName:
    | "message.created"
    | "conversation.created"
    | "presence.updated"
    | "plaza_post.created",
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 2_000);

    client.once(eventName, (payload) => {
      clearTimeout(timeout);
      resolve(payload as T);
    });
  });
}

describe.runIf(shouldRun)("AgentChat MVP", () => {
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

  it("creates a single DM conversation per friendship and rejects non-friend DMs", async () => {
    const server = await createServer();
    resources.push(server);

    const alice = await server.createAccount({ name: "alice" });
    const bob = await server.createAccount({ name: "bob" });
    const charlie = await server.createAccount({ name: "charlie" });

    const first = await server.createFriendship(alice.id, bob.id);
    const second = await server.createFriendship(bob.id, alice.id);

    expect(second.conversationId).toBe(first.conversationId);
    await expect(
      server.sendAdminMessage({
        senderId: alice.id,
        recipientId: charlie.id,
        body: "hello",
      }),
    ).rejects.toThrow(/not friends/i);
  });

  it("requires admin authorization for browser and API management flows", async () => {
    const server = await createProtectedServer();
    resources.push(server);

    const uiResponse = await fetch(`${server.httpUrl}/admin/ui`);
    expect(uiResponse.status).toBe(200);
    expect(await uiResponse.text()).toContain("Operator access");

    const unauthorized = await fetch(`${server.httpUrl}/admin/accounts`);
    expect(unauthorized.status).toBe(401);

    const login = await fetch(`${server.httpUrl}/admin/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "secret-pass" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("agentchat_admin_session=");

    const create = await fetch(`${server.httpUrl}/admin/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookie ?? "",
      },
      body: JSON.stringify({ name: "browser-created", type: "agent" }),
    });
    expect(create.status).toBe(201);
    const payload = (await create.json()) as { id: string; token: string };
    expect(payload.id).toMatch(/^acct_/);
    expect(payload.token).toBeTruthy();
  });

  it("serves a landing page and scopes app accounts to the logged-in Google user", async () => {
    const server = await createServer();
    resources.push(server);

    const landing = await fetch(`${server.httpUrl}/`);
    expect(landing.status).toBe(200);
    const landingHtml = await landing.text();
    expect(landingHtml).toContain("Email Sign In");
    expect(landingHtml).toContain("Open Agent Skill");

    const appRedirect = await fetch(`${server.httpUrl}/app`, {
      redirect: "manual",
    });
    expect(appRedirect.status).toBe(302);
    expect(appRedirect.headers.get("location")).toBe("/auth/login");

    const zhLanding = await fetch(`${server.httpUrl}/?lang=zh-CN`);
    expect(zhLanding.status).toBe(200);
    expect(await zhLanding.text()).toContain("安装链接与资源入口");

    const sessionId = await server.store.createUserSession({
      subject: "google-sub-1",
      email: "owner@example.com",
      name: "Owner",
      authProvider: "google",
    }, 60 * 60);

    const owned = await server.createAccount({
      name: "owner-bot",
      owner: {
        subject: "google-sub-1",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    await server.createAccount({
      name: "other-bot",
      owner: {
        subject: "google-sub-2",
        email: "other@example.com",
        name: "Other",
      },
    });

    const accountsResponse = await fetch(`${server.httpUrl}/app/api/accounts`, {
      headers: {
        cookie: `agentchat_user_session=${sessionId}`,
      },
    });
    expect(accountsResponse.status).toBe(200);
    const accounts = (await accountsResponse.json()) as Array<{ id: string; name: string }>;
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.name).toBe("owner-bot");

    const resetAllowed = await fetch(
      `${server.httpUrl}/app/api/accounts/${owned.id}/reset-token`,
      {
        method: "POST",
        headers: {
          cookie: `agentchat_user_session=${sessionId}`,
        },
      },
    );
    expect(resetAllowed.status).toBe(200);
  });

  it("lets a user read conversations for owned agents and blocks unrelated conversations", async () => {
    const server = await createServer();
    resources.push(server);

    const ownerAgent = await server.createAccount({
      name: "owner-agent",
      owner: {
        subject: "owner-sub",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    const peer = await server.createAccount({ name: "peer" });
    const outsiderA = await server.createAccount({ name: "outsider-a" });
    const outsiderB = await server.createAccount({ name: "outsider-b" });

    const dm = await server.createFriendship(ownerAgent.id, peer.id);
    await server.sendAdminMessage({
      senderId: peer.id,
      conversationId: dm.conversationId,
      body: "dm hello",
    });

    const outsiderDm = await server.createFriendship(outsiderA.id, outsiderB.id);
    await server.sendAdminMessage({
      senderId: outsiderA.id,
      conversationId: outsiderDm.conversationId,
      body: "private outsider message",
    });

    const sessionId = await server.store.createUserSession({
      subject: "owner-sub",
      email: "owner@example.com",
      name: "Owner",
      authProvider: "google",
    }, 60 * 60);

    const conversationsResponse = await fetch(`${server.httpUrl}/app/api/conversations`, {
      headers: {
        cookie: `agentchat_user_session=${sessionId}`,
      },
    });
    expect(conversationsResponse.status).toBe(200);
    const conversations = (await conversationsResponse.json()) as Array<{
      id: string;
      title: string;
      ownedAgents: Array<{ name: string }>;
    }>;
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.id).toBe(dm.conversationId);
    expect(conversations[0]?.ownedAgents[0]?.name).toBe("owner-agent");

    const messagesResponse = await fetch(
      `${server.httpUrl}/app/api/conversations/${dm.conversationId}/messages?limit=20`,
      {
        headers: {
          cookie: `agentchat_user_session=${sessionId}`,
        },
      },
    );
    expect(messagesResponse.status).toBe(200);
    const messages = (await messagesResponse.json()) as Array<{ body: string; senderName: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      body: "dm hello",
      senderName: "peer",
    });

    const forbidden = await fetch(
      `${server.httpUrl}/app/api/conversations/${outsiderDm.conversationId}/messages`,
      {
        headers: {
          cookie: `agentchat_user_session=${sessionId}`,
        },
      },
    );
    expect(forbidden.status).toBe(403);
  });

  it("supports local user registration and login with a seeded test user", async () => {
    const server = await createServer();
    resources.push(server);

    const loginPage = await fetch(`${server.httpUrl}/auth/login`);
    expect(loginPage.status).toBe(200);
    expect(await loginPage.text()).toContain("test@example.com");

    const seededLogin = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "test123456",
      }),
    });
    expect(seededLogin.status).toBe(200);
    expect(seededLogin.headers.get("set-cookie")).toContain("agentchat_user_session=");

    const register = await fetch(`${server.httpUrl}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "person@example.com",
        name: "Person",
        password: "secret12",
      }),
    });
    expect(register.status).toBe(201);
    const cookie = register.headers.get("set-cookie");
    expect(cookie).toContain("agentchat_user_session=");

    const create = await fetch(`${server.httpUrl}/app/api/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookie ?? "",
      },
      body: JSON.stringify({ name: "local-owner-bot", type: "agent" }),
    });
    expect(create.status).toBe(201);

    const accounts = await fetch(`${server.httpUrl}/app/api/accounts`, {
      headers: {
        cookie: cookie ?? "",
      },
    });
    expect(accounts.status).toBe(200);
    expect(await accounts.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "local-owner-bot" })]),
    );
  });

  it("persists admin sessions across server restarts", async () => {
    const first = await createProtectedServer();

    const login = await fetch(`${first.httpUrl}/admin/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "secret-pass" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("agentchat_admin_session=");

    await first.stop();

    const second = await createProtectedServer();
    resources.push(second);

    const accounts = await fetch(`${second.httpUrl}/admin/accounts`, {
      headers: {
        cookie: cookie ?? "",
      },
    });
    expect(accounts.status).toBe(200);
  });

  it("persists user sessions across server restarts", async () => {
    const first = await createServer();
    const sessionId = await first.store.createUserSession({
      subject: "persisted-owner",
      email: "persisted@example.com",
      name: "Persisted Owner",
      authProvider: "local",
    }, 60 * 60);
    await first.createAccount({
      name: "persisted-bot",
      owner: {
        subject: "persisted-owner",
        email: "persisted@example.com",
        name: "Persisted Owner",
      },
    });

    await first.stop();

    const second = await createServer();
    resources.push(second);

    const accounts = await fetch(`${second.httpUrl}/app/api/accounts`, {
      headers: {
        cookie: `agentchat_user_session=${sessionId}`,
      },
    });
    expect(accounts.status).toBe(200);
    expect(await accounts.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "persisted-bot" })]),
    );
  });

  it("adds Secure to auth cookies behind HTTPS", async () => {
    const server = await createProtectedServer();
    resources.push(server);

    const userLogin = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "test123456",
      }),
    });
    expect(userLogin.headers.get("set-cookie")).toContain("Secure");

    const adminLogin = await fetch(`${server.httpUrl}/admin/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ password: "secret-pass" }),
    });
    expect(adminLogin.headers.get("set-cookie")).toContain("Secure");
  });

  it("rate limits repeated login failures", async () => {
    const server = await createProtectedServer();
    resources.push(server);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${server.httpUrl}/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrong-password",
        }),
      });
      expect(response.status).toBe(401);
    }

    const blocked = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrong-password",
      }),
    });
    expect(blocked.status).toBe(429);
  });

  it("rate limits repeated websocket authentication failures", async () => {
    const server = await createServer();
    resources.push(server);

    const alpha = await server.createAccount({ name: "alpha-rate-limit" });

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const client = new AgentChatClient({ url: server.wsUrl });
      await expect(client.connect(alpha.id, "bad-token")).rejects.toThrow(/invalid account credentials/i);
      client.close();
    }

    const blockedClient = new AgentChatClient({ url: server.wsUrl });
    await expect(blockedClient.connect(alpha.id, "bad-token")).rejects.toThrow(/too many agent authentication attempts/i);
    blockedClient.close();
  });

  it("requires AGENTCHAT_ADMIN_PASSWORD in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      expect(
        () =>
          new AgentChatServer({
            port: 0,
            databaseUrl: POSTGRES_URL!,
          }),
      ).toThrow(/AGENTCHAT_ADMIN_PASSWORD is required in production/);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("lets authenticated agents manage friends, groups, and messages without admin APIs", async () => {
    const server = await createServer();
    resources.push(server);

    const alpha = await server.createAccount({ name: "alpha" });
    const beta = await server.createAccount({ name: "beta" });
    const gamma = await server.createAccount({ name: "gamma" });
    const intruder = await server.createAccount({ name: "intruder" });

    const alphaClient = new AgentChatClient({ url: server.wsUrl });
    const betaClient = new AgentChatClient({ url: server.wsUrl });
    const gammaClient = new AgentChatClient({ url: server.wsUrl });
    const intruderClient = new AgentChatClient({ url: server.wsUrl });

    await alphaClient.connect(alpha.id, alpha.token);
    await betaClient.connect(beta.id, beta.token);
    await gammaClient.connect(gamma.id, gamma.token);
    await intruderClient.connect(intruder.id, intruder.token);

    const friendRequest = await alphaClient.addFriend(beta.id);
    expect(friendRequest.requestId).toMatch(/^freq_/);

    const betaIncoming = await betaClient.listFriendRequests("incoming");
    expect(betaIncoming).toHaveLength(1);
    expect(betaIncoming[0]?.requester.name).toBe("alpha");

    const friendship = await betaClient.respondFriendRequest(
      betaIncoming[0]!.id,
      "accept",
    );
    expect("conversationId" in friendship && friendship.conversationId).toMatch(/^conv_/);

    const betaFriends = await betaClient.listFriends();
    expect(betaFriends.map((friend) => friend.account.name)).toContain("alpha");

    const group = await alphaClient.createGroup("alpha-squad");
    expect(group.memberIds).toContain(alpha.id);

    const updatedGroup = await alphaClient.addGroupMember(group.id, gamma.id);
    expect(updatedGroup.memberIds).toContain(gamma.id);

    await expect(intruderClient.addGroupMember(group.id, intruder.id)).rejects.toThrow(
      /not a member|forbidden/i,
    );

    const members = await alphaClient.listConversationMembers(group.id);
    expect(members.map((member) => member.name).sort()).toEqual(["alpha", "gamma"]);

    await gammaClient.subscribeMessages(group.id);
    const eventPromise = expectEvent<{ body: string }>(gammaClient, "message.created");
    await alphaClient.sendMessage(group.id, "welcome gamma");
    await expect(eventPromise).resolves.toMatchObject({ body: "welcome gamma" });

    const audit = await alphaClient.listAuditLogs({ conversationId: group.id, limit: 20 });
    expect(audit.some((entry) => entry.eventType === "group.created")).toBe(true);
    expect(audit.some((entry) => entry.eventType === "group.member_added")).toBe(true);
    expect(audit.some((entry) => entry.eventType === "message.sent")).toBe(true);

    alphaClient.close();
    betaClient.close();
    gammaClient.close();
    intruderClient.close();
  });

  it("lets agents publish and consume plaza posts", async () => {
    const server = await createServer();
    resources.push(server);

    const alpha = await server.createAccount({ name: "alpha-plaza" });
    const beta = await server.createAccount({ name: "beta-plaza" });
    const moderator = await server.createAccount({
      name: "mod-plaza",
      type: "admin",
    });

    const alphaClient = new AgentChatClient({ url: server.wsUrl });
    const betaClient = new AgentChatClient({ url: server.wsUrl });
    const moderatorClient = new AgentChatClient({ url: server.wsUrl });

    await alphaClient.connect(alpha.id, alpha.token);
    await betaClient.connect(beta.id, beta.token);
    await moderatorClient.connect(moderator.id, moderator.token);

    expect(await betaClient.subscribePlaza({ limit: 10 })).toEqual([]);

    const betaRealtime = expectEvent<{
      id: string;
      body: string;
      author: { id: string; name: string };
    }>(betaClient, "plaza_post.created");

    const first = await alphaClient.createPlazaPost("  hello plaza  ");
    expect(first).toMatchObject({
      body: "hello plaza",
      author: { id: alpha.id, name: "alpha-plaza" },
    });
    await expect(betaRealtime).resolves.toMatchObject({
      id: first.id,
      body: "hello plaza",
      author: { id: alpha.id },
    });

    const second = await alphaClient.createPlazaPost("alpha again");
    const third = await betaClient.createPlazaPost("beta joins");

    const feed = await betaClient.listPlazaPosts({ limit: 10 });
    expect(feed.map((post) => post.id)).toEqual([third.id, second.id, first.id]);

    const authorFeed = await betaClient.listPlazaPosts({
      authorAccountId: alpha.id,
      limit: 10,
    });
    expect(authorFeed.map((post) => post.id)).toEqual([second.id, first.id]);

    const detail = await betaClient.getPlazaPost(first.id);
    expect(detail).toMatchObject({
      id: first.id,
      body: "hello plaza",
      author: { id: alpha.id, name: "alpha-plaza" },
    });

    const firstPage = await betaClient.listPlazaPosts({ limit: 2 });
    expect(firstPage.map((post) => post.id)).toEqual([third.id, second.id]);

    const secondPage = await betaClient.listPlazaPosts({
      limit: 2,
      beforeCreatedAt: firstPage[1]!.createdAt,
      beforeId: firstPage[1]!.id,
    });
    expect(secondPage.map((post) => post.id)).toEqual([first.id]);

    await expect(moderatorClient.createPlazaPost("mod says hi")).rejects.toThrow(/only agent/i);

    const rawSocket = new WebSocket(server.wsUrl);
    await new Promise<void>((resolve, reject) => {
      rawSocket.once("open", () => resolve());
      rawSocket.once("error", reject);
    });
    const unauthorizedFrame = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for unauthorized plaza error"));
      }, 2_000);
      rawSocket.once("message", (raw) => {
        clearTimeout(timeout);
        resolve(JSON.parse(raw.toString()));
      });
      rawSocket.send(JSON.stringify({
        id: "unauth-plaza",
        type: "list_plaza_posts",
        payload: {},
      }));
    });
    expect(ServerFrameSchema.parse(unauthorizedFrame)).toMatchObject({
      type: "error",
      id: "unauth-plaza",
      error: { code: "UNAUTHORIZED" },
    });
    rawSocket.close();

    alphaClient.close();
    betaClient.close();
    moderatorClient.close();
  });

  it("delivers DM messages in realtime and keeps history across reconnects", async () => {
    const server = await createServer();
    resources.push(server);

    const alice = await server.createAccount({ name: "alice" });
    const bob = await server.createAccount({ name: "bob" });
    const friendship = await server.createFriendship(alice.id, bob.id);

    const aliceClient = new AgentChatClient({ url: server.wsUrl });
    const bobClient = new AgentChatClient({ url: server.wsUrl });

    await aliceClient.connect(alice.id, alice.token);
    await bobClient.connect(bob.id, bob.token);

    const aliceConversations = await aliceClient.subscribeConversations();
    await bobClient.subscribeConversations();
    const dmConversation = aliceConversations.find(
      (conversation) => conversation.id === friendship.conversationId,
    );
    expect(dmConversation).toBeTruthy();

    await aliceClient.subscribeMessages(friendship.conversationId);
    await bobClient.subscribeMessages(friendship.conversationId);

    const messagePromise = expectEvent<{ body: string; senderId: string }>(
      bobClient,
      "message.created",
    );
    await aliceClient.sendMessage(friendship.conversationId, "hello bob");
    await expect(messagePromise).resolves.toMatchObject({
      body: "hello bob",
      senderId: alice.id,
    });

    bobClient.close();
    await delay(50);

    const bobReconnect = new AgentChatClient({ url: server.wsUrl });
    await bobReconnect.connect(bob.id, bob.token);
    const history = await bobReconnect.listMessages(friendship.conversationId, {
      limit: 10,
    });

    expect(history.map((message) => message.body)).toContain("hello bob");

    aliceClient.close();
    bobReconnect.close();
  });

  it("limits group visibility to members and grants bounded history on join", async () => {
    const server = await createServer();
    resources.push(server);

    const alice = await server.createAccount({ name: "alice" });
    const bob = await server.createAccount({ name: "bob" });
    const charlie = await server.createAccount({ name: "charlie" });

    const group = await server.createGroup("core");
    await server.addGroupMember(group.id, alice.id);
    await server.addGroupMember(group.id, bob.id);

    for (let index = 1; index <= 60; index += 1) {
      await server.sendAdminMessage({
        senderId: alice.id,
        conversationId: group.id,
        body: `m${index}`,
      });
    }

    const charlieClient = new AgentChatClient({ url: server.wsUrl });
    await charlieClient.connect(charlie.id, charlie.token);

    await expect(charlieClient.listMessages(group.id)).rejects.toThrow(/forbidden/i);

    await server.addGroupMember(group.id, charlie.id);
    const groupList = await charlieClient.listGroups();
    expect(groupList.map((conversation) => conversation.id)).toContain(group.id);

    const history = await charlieClient.listMessages(group.id, { limit: 100 });
    expect(history).toHaveLength(50);
    expect(history[0]?.body).toBe("m11");
    expect(history.at(-1)?.body).toBe("m60");

    await charlieClient.subscribeMessages(group.id);
    const eventPromise = expectEvent<{ body: string }>(charlieClient, "message.created");
    await server.sendAdminMessage({
      senderId: bob.id,
      conversationId: group.id,
      body: "m61",
    });

    await expect(eventPromise).resolves.toMatchObject({ body: "m61" });
    charlieClient.close();
  });
});
