import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AgentChatClient } from "@agentchatjs/sdk";
import { ServerFrameSchema } from "@agentchatjs/protocol";
import { AgentChatServer } from "@agentchat/server";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
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
async function expectEvent(client, eventName) {
    return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${eventName}`));
        }, 2_000);
        client.once(eventName, (payload) => {
            clearTimeout(timeout);
            resolve(payload);
        });
    });
}
describe("AgentChat MVP", () => {
    const resources = [];
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
        const alice = await server.createAccount({ name: "alice" });
        const bob = await server.createAccount({ name: "bob" });
        const charlie = await server.createAccount({ name: "charlie" });
        const first = await server.createFriendship(alice.id, bob.id);
        const second = await server.createFriendship(bob.id, alice.id);
        expect(second.conversationId).toBe(first.conversationId);
        await expect(server.sendAdminMessage({
            senderId: alice.id,
            recipientId: charlie.id,
            body: "hello",
        })).rejects.toThrow(/not friends/i);
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
        const payload = (await create.json());
        expect(payload.id).toMatch(/^acct_/);
        expect(payload.token).toBeTruthy();
    });
    it("serves a landing page and scopes app accounts to the logged-in Google user", async () => {
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
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
        const sessionId = "user-session-1";
        server.userSessions.set(sessionId, {
            createdAt: Date.now(),
            subject: "google-sub-1",
            email: "owner@example.com",
            name: "Owner",
            authProvider: "google",
        });
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
        const accounts = (await accountsResponse.json());
        expect(accounts).toHaveLength(1);
        expect(accounts[0]?.name).toBe("owner-bot");
        const resetAllowed = await fetch(`${server.httpUrl}/app/api/accounts/${owned.id}/reset-token`, {
            method: "POST",
            headers: {
                cookie: `agentchat_user_session=${sessionId}`,
            },
        });
        expect(resetAllowed.status).toBe(200);
    });
    it("lets a user read conversations for owned agents and blocks unrelated conversations", async () => {
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
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
        const sessionId = "user-session-2";
        server.userSessions.set(sessionId, {
            createdAt: Date.now(),
            subject: "owner-sub",
            email: "owner@example.com",
            name: "Owner",
            authProvider: "google",
        });
        const conversationsResponse = await fetch(`${server.httpUrl}/app/api/conversations`, {
            headers: {
                cookie: `agentchat_user_session=${sessionId}`,
            },
        });
        expect(conversationsResponse.status).toBe(200);
        const conversations = (await conversationsResponse.json());
        expect(conversations).toHaveLength(1);
        expect(conversations[0]?.id).toBe(dm.conversationId);
        expect(conversations[0]?.ownedAgents[0]?.name).toBe("owner-agent");
        const messagesResponse = await fetch(`${server.httpUrl}/app/api/conversations/${dm.conversationId}/messages?limit=20`, {
            headers: {
                cookie: `agentchat_user_session=${sessionId}`,
            },
        });
        expect(messagesResponse.status).toBe(200);
        const messages = (await messagesResponse.json());
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            body: "dm hello",
            senderName: "peer",
        });
        const forbidden = await fetch(`${server.httpUrl}/app/api/conversations/${outsiderDm.conversationId}/messages`, {
            headers: {
                cookie: `agentchat_user_session=${sessionId}`,
            },
        });
        expect(forbidden.status).toBe(403);
    });
    it("supports local user registration and login with a seeded test user", async () => {
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
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
        expect(await accounts.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "local-owner-bot" })]));
    });
    it("lets authenticated agents manage friends, groups, and messages without admin APIs", async () => {
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
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
        const friendship = await betaClient.respondFriendRequest(betaIncoming[0].id, "accept");
        expect("conversationId" in friendship && friendship.conversationId).toMatch(/^conv_/);
        const betaFriends = await betaClient.listFriends();
        expect(betaFriends.map((friend) => friend.account.name)).toContain("alpha");
        const group = await alphaClient.createGroup("alpha-squad");
        expect(group.memberIds).toContain(alpha.id);
        const updatedGroup = await alphaClient.addGroupMember(group.id, gamma.id);
        expect(updatedGroup.memberIds).toContain(gamma.id);
        await expect(intruderClient.addGroupMember(group.id, intruder.id)).rejects.toThrow(/not a member|forbidden/i);
        const members = await alphaClient.listConversationMembers(group.id);
        expect(members.map((member) => member.name).sort()).toEqual(["alpha", "gamma"]);
        await gammaClient.subscribeMessages(group.id);
        const eventPromise = expectEvent(gammaClient, "message.created");
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
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
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
        const betaRealtime = expectEvent(betaClient, "plaza_post.created");
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
            beforeCreatedAt: firstPage[1].createdAt,
            beforeId: firstPage[1].id,
        });
        expect(secondPage.map((post) => post.id)).toEqual([first.id]);
        await expect(moderatorClient.createPlazaPost("mod says hi")).rejects.toThrow(/only agent/i);
        const rawSocket = new WebSocket(server.wsUrl);
        await new Promise((resolve, reject) => {
            rawSocket.once("open", () => resolve());
            rawSocket.once("error", reject);
        });
        const unauthorizedFrame = await new Promise((resolve, reject) => {
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
        const resource = await createServer();
        resources.push(resource);
        const { server } = resource;
        const alice = await server.createAccount({ name: "alice" });
        const bob = await server.createAccount({ name: "bob" });
        const friendship = await server.createFriendship(alice.id, bob.id);
        const aliceClient = new AgentChatClient({ url: server.wsUrl });
        const bobClient = new AgentChatClient({ url: server.wsUrl });
        await aliceClient.connect(alice.id, alice.token);
        await bobClient.connect(bob.id, bob.token);
        const aliceConversations = await aliceClient.subscribeConversations();
        await bobClient.subscribeConversations();
        const dmConversation = aliceConversations.find((conversation) => conversation.id === friendship.conversationId);
        expect(dmConversation).toBeTruthy();
        await aliceClient.subscribeMessages(friendship.conversationId);
        await bobClient.subscribeMessages(friendship.conversationId);
        const messagePromise = expectEvent(bobClient, "message.created");
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
        const eventPromise = expectEvent(charlieClient, "message.created");
        await server.sendAdminMessage({
            senderId: bob.id,
            conversationId: group.id,
            body: "m61",
        });
        await expect(eventPromise).resolves.toMatchObject({ body: "m61" });
        charlieClient.close();
    });
});
