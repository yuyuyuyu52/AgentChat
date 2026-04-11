import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AgentChatClient } from "@agentchat/sdk";
import { AgentChatServer } from "@agentchat/server";
import { afterEach, describe, expect, it } from "vitest";

async function createServer() {
  const directory = await mkdtemp(join(tmpdir(), "agentchat-"));
  const server = new AgentChatServer({
    port: 0,
    databasePath: join(directory, "agentchat.sqlite"),
  });
  await server.start();
  return { server, directory };
}

async function createProtectedServer() {
  const directory = await mkdtemp(join(tmpdir(), "agentchat-auth-"));
  const server = new AgentChatServer({
    port: 0,
    databasePath: join(directory, "agentchat.sqlite"),
    adminPassword: "secret-pass",
  });
  await server.start();
  return { server, directory };
}

async function expectEvent<T>(
  client: AgentChatClient,
  eventName: "message.created" | "conversation.created" | "presence.updated",
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

describe("AgentChat MVP", () => {
  const resources: Array<{ server: AgentChatServer; directory: string }> = [];

  afterEach(async () => {
    while (resources.length > 0) {
      const resource = resources.pop();
      if (!resource) {
        continue;
      }
      await resource.server.stop();
      await rm(resource.directory, { recursive: true, force: true });
    }
  });

  it("creates a single DM conversation per friendship and rejects non-friend DMs", async () => {
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const alice = server.createAccount({ name: "alice" });
    const bob = server.createAccount({ name: "bob" });
    const charlie = server.createAccount({ name: "charlie" });

    const first = server.createFriendship(alice.id, bob.id);
    const second = server.createFriendship(bob.id, alice.id);

    expect(second.conversationId).toBe(first.conversationId);
    expect(() =>
      server.sendAdminMessage({
        senderId: alice.id,
        recipientId: charlie.id,
        body: "hello",
      })).toThrowError(/not friends/i);
  });

  it("requires admin authorization for browser and API management flows", async () => {
    const resource = await createProtectedServer();
    resources.push(resource);
    const { server } = resource;

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
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const landing = await fetch(`${server.httpUrl}/`);
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain("Sign in with Google");

    const appRedirect = await fetch(`${server.httpUrl}/app`, {
      redirect: "manual",
    });
    expect(appRedirect.status).toBe(302);
    expect(appRedirect.headers.get("location")).toBe("/auth/google/login");

    const sessionId = "user-session-1";
    (server as unknown as {
      userSessions: Map<string, { createdAt: number; subject: string; email: string; name: string }>;
    }).userSessions.set(sessionId, {
      createdAt: Date.now(),
      subject: "google-sub-1",
      email: "owner@example.com",
      name: "Owner",
    });

    const owned = server.createAccount({
      name: "owner-bot",
      owner: {
        subject: "google-sub-1",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    server.createAccount({
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
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const ownerAgent = server.createAccount({
      name: "owner-agent",
      owner: {
        subject: "owner-sub",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    const peer = server.createAccount({ name: "peer" });
    const outsiderA = server.createAccount({ name: "outsider-a" });
    const outsiderB = server.createAccount({ name: "outsider-b" });

    const dm = server.createFriendship(ownerAgent.id, peer.id);
    server.sendAdminMessage({
      senderId: peer.id,
      conversationId: dm.conversationId,
      body: "dm hello",
    });

    const outsiderDm = server.createFriendship(outsiderA.id, outsiderB.id);
    server.sendAdminMessage({
      senderId: outsiderA.id,
      conversationId: outsiderDm.conversationId,
      body: "private outsider message",
    });

    const sessionId = "user-session-2";
    (server as unknown as {
      userSessions: Map<string, { createdAt: number; subject: string; email: string; name: string }>;
    }).userSessions.set(sessionId, {
      createdAt: Date.now(),
      subject: "owner-sub",
      email: "owner@example.com",
      name: "Owner",
    });

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

  it("lets authenticated agents manage friends, groups, and messages without admin APIs", async () => {
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const alpha = server.createAccount({ name: "alpha" });
    const beta = server.createAccount({ name: "beta" });
    const gamma = server.createAccount({ name: "gamma" });
    const intruder = server.createAccount({ name: "intruder" });

    const alphaClient = new AgentChatClient({ url: server.wsUrl });
    const betaClient = new AgentChatClient({ url: server.wsUrl });
    const gammaClient = new AgentChatClient({ url: server.wsUrl });
    const intruderClient = new AgentChatClient({ url: server.wsUrl });

    await alphaClient.connect(alpha.id, alpha.token);
    await betaClient.connect(beta.id, beta.token);
    await gammaClient.connect(gamma.id, gamma.token);
    await intruderClient.connect(intruder.id, intruder.token);

    const friendship = await alphaClient.addFriend(beta.id);
    expect(friendship.conversationId).toMatch(/^conv_/);

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

    alphaClient.close();
    betaClient.close();
    gammaClient.close();
    intruderClient.close();
  });

  it("delivers DM messages in realtime and keeps history across reconnects", async () => {
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const alice = server.createAccount({ name: "alice" });
    const bob = server.createAccount({ name: "bob" });
    const friendship = server.createFriendship(alice.id, bob.id);

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
    const resource = await createServer();
    resources.push(resource);
    const { server } = resource;

    const alice = server.createAccount({ name: "alice" });
    const bob = server.createAccount({ name: "bob" });
    const charlie = server.createAccount({ name: "charlie" });

    const group = server.createGroup("core");
    server.addGroupMember(group.id, alice.id);
    server.addGroupMember(group.id, bob.id);

    for (let index = 1; index <= 60; index += 1) {
      server.sendAdminMessage({
        senderId: alice.id,
        conversationId: group.id,
        body: `m${index}`,
      });
    }

    const charlieClient = new AgentChatClient({ url: server.wsUrl });
    await charlieClient.connect(charlie.id, charlie.token);

    await expect(charlieClient.listMessages(group.id)).rejects.toThrow(/forbidden/i);

    server.addGroupMember(group.id, charlie.id);
    const groupList = await charlieClient.listGroups();
    expect(groupList.map((conversation) => conversation.id)).toContain(group.id);

    const history = await charlieClient.listMessages(group.id, { limit: 100 });
    expect(history).toHaveLength(50);
    expect(history[0]?.body).toBe("m11");
    expect(history.at(-1)?.body).toBe("m60");

    await charlieClient.subscribeMessages(group.id);
    const eventPromise = expectEvent<{ body: string }>(charlieClient, "message.created");
    server.sendAdminMessage({
      senderId: bob.id,
      conversationId: group.id,
      body: "m61",
    });

    await expect(eventPromise).resolves.toMatchObject({ body: "m61" });
    charlieClient.close();
  });
});
