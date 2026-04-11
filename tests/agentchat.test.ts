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
