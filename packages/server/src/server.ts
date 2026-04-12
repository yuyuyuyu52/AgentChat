import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URLSearchParams } from "node:url";
import { parse as parseUrl } from "node:url";
import {
  ClientRequestSchema,
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  makeErrorFrame,
  makeEvent,
  makeResponse,
  type Account,
  type AuthAccount,
  type ConversationSummary,
  type Message,
  type ServerEvent,
} from "@agentchat/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { renderAdminPage, renderAppPage, renderAuthPage, renderLandingPage } from "./admin-ui.js";
import { AppError, asAppError } from "./errors.js";
import {
  AgentChatStore,
  type CreateAccountInput,
  type SendMessageInput,
} from "./store.js";

type ConnectionState = {
  socket: WebSocket;
  accountId?: string;
  subscribedConversationIds: Set<string>;
  subscribedConversationFeed: boolean;
  sessionId?: string;
};

export type AgentChatServerOptions = {
  host?: string | undefined;
  port?: number | undefined;
  databasePath?: string | undefined;
  databaseUrl?: string | undefined;
  storageDriver?: "sqlite" | "postgres" | undefined;
  adminPassword?: string | undefined;
  googleAuth?:
    | {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
      }
    | undefined;
};

type AdminSession = {
  createdAt: number;
};

type UserSession = {
  createdAt: number;
  subject: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: "google" | "local";
};

type OAuthState = {
  createdAt: number;
};

const CreateAccountBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["agent", "admin"]).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

const CreateFriendshipBodySchema = z.object({
  accountA: z.string(),
  accountB: z.string(),
});

const CreateGroupBodySchema = z.object({
  title: z.string().min(1),
});

const AddGroupMemberBodySchema = z.object({
  accountId: z.string(),
});

const SendMessageBodySchema = z.object({
  senderId: z.string(),
  conversationId: z.string().optional(),
  recipientId: z.string().optional(),
  body: z.string().min(1),
});

const LoginBodySchema = z.object({
  password: z.string().min(1),
});

const HumanLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const HumanRegisterBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
});

const GoogleUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().min(1),
  picture: z.string().optional(),
});

function normalizeUiLang(value: string | undefined): "en" | "zh-CN" {
  if (value === "zh" || value === "zh-CN") {
    return "zh-CN";
  }
  return "en";
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
}

function jsonResponse(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export class AgentChatServer {
  readonly host: string;
  readonly store: AgentChatStore;

  private readonly requestedPort: number;
  private readonly adminPassword: string | undefined;
  private readonly googleAuth:
    | {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
      }
    | undefined;
  private readonly httpServer;
  private readonly wsServer: WebSocketServer;
  private readonly connections = new Map<WebSocket, ConnectionState>();
  private readonly accountConnections = new Map<string, Set<ConnectionState>>();
  private readonly adminSessions = new Map<string, AdminSession>();
  private readonly userSessions = new Map<string, UserSession>();
  private readonly oauthStates = new Map<string, OAuthState>();
  private actualPort = 0;

  constructor(options: AgentChatServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 43110;
    this.adminPassword = options.adminPassword;
    this.googleAuth = options.googleAuth;
    this.store = new AgentChatStore({
      databasePath:
        options.databasePath ?? new URL("../../data/agentchat.sqlite", import.meta.url).pathname,
      ...(options.databaseUrl ? { databaseUrl: options.databaseUrl } : {}),
      ...(options.storageDriver ? { driver: options.storageDriver } : {}),
    });

    this.httpServer = createServer(this.handleHttpRequest.bind(this));
    this.wsServer = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (request, socket, head) => {
      const url = parseUrl(request.url ?? "", true);
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      this.wsServer.handleUpgrade(request, socket, head, (client) => {
        this.wsServer.emit("connection", client, request);
      });
    });

    this.wsServer.on("connection", (socket) => {
      const state: ConnectionState = {
        socket,
        subscribedConversationIds: new Set(),
        subscribedConversationFeed: false,
      };
      this.connections.set(socket, state);
      socket.on("message", (data) => {
        void this.handleSocketMessage(state, data.toString());
      });
      socket.on("close", () => {
        void this.handleSocketClose(state);
      });
    });
  }

  get httpUrl(): string {
    return `http://${this.host}:${this.actualPort}`;
  }

  get wsUrl(): string {
    return `ws://${this.host}:${this.actualPort}/ws`;
  }

  async start(): Promise<void> {
    if (this.actualPort !== 0) {
      return;
    }

    await this.store.initialize();

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(this.requestedPort, this.host, () => {
        this.httpServer.off("error", reject);
        const address = this.httpServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to determine bound address"));
          return;
        }
        this.actualPort = address.port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const connection of this.connections.values()) {
      connection.socket.close();
    }

    await new Promise<void>((resolve, reject) => {
      this.wsServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await this.store.close();
  }

  async createAccount(input: CreateAccountInput): Promise<AuthAccount> {
    return this.store.createAccount(input);
  }

  async listAccounts(ownerSubject?: string): Promise<Account[]> {
    return this.store.listAccounts(ownerSubject);
  }

  async resetToken(
    accountId: string,
    ownerSubject?: string,
  ): Promise<{ accountId: string; token: string }> {
    return this.store.resetToken(accountId, ownerSubject);
  }

  async createFriendship(accountA: string, accountB: string): Promise<{
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  }> {
    const result = await this.store.createFriendship(accountA, accountB);
    await this.broadcastConversationCreated(accountA, result.conversationId);
    await this.broadcastConversationCreated(accountB, result.conversationId);
    return result;
  }

  async addFriendAs(actorId: string, peerAccountId: string): Promise<{
    requestId: string;
    createdAt: string;
  }> {
    return this.store.addFriendAs(actorId, peerAccountId);
  }

  async listFriendRequests(
    accountId: string,
    direction: "incoming" | "outgoing" | "all" = "all",
  ) {
    return this.store.listFriendRequests(accountId, direction);
  }

  async respondFriendRequestAs(
    actorId: string,
    requestId: string,
    action: "accept" | "reject",
  ) {
    const result = await this.store.respondFriendRequestAs(actorId, requestId, action);
    if ("conversationId" in result) {
      const request = (await this.store.listFriendRequests(actorId, "incoming"))
        .concat(await this.store.listFriendRequests(actorId, "outgoing"))
        .find((item) => item.id === requestId);
      if (request) {
        await this.broadcastConversationCreated(request.requester.id, result.conversationId);
        await this.broadcastConversationCreated(request.target.id, result.conversationId);
      }
    }
    return result;
  }

  async createGroup(title: string): Promise<ConversationSummary> {
    return this.store.createGroup(title);
  }

  async createGroupAs(actorId: string, title: string): Promise<ConversationSummary> {
    const summary = await this.store.createGroupAs(actorId, title);
    await this.broadcastConversationCreated(actorId, summary.id);
    return summary;
  }

  async addGroupMember(conversationId: string, accountId: string): Promise<ConversationSummary> {
    const summary = await this.store.addGroupMember(conversationId, accountId);
    await this.broadcastConversationCreated(accountId, conversationId);
    for (const memberId of summary.memberIds) {
      if (memberId !== accountId) {
        this.dispatchEventToAccount(
          memberId,
          makeEvent("conversation.member_added", {
            conversationId,
            accountId,
          }),
          (connection) => connection.subscribedConversationFeed,
        );
      }
    }
    return summary;
  }

  async addGroupMemberAs(
    actorId: string,
    conversationId: string,
    accountId: string,
  ): Promise<ConversationSummary> {
    const summary = await this.store.addGroupMemberAs(actorId, conversationId, accountId);
    await this.broadcastConversationCreated(accountId, conversationId);
    for (const memberId of summary.memberIds) {
      if (memberId !== accountId) {
        this.dispatchEventToAccount(
          memberId,
          makeEvent("conversation.member_added", {
            conversationId,
            accountId,
          }),
          (connection) => connection.subscribedConversationFeed,
        );
      }
    }
    return summary;
  }

  async sendAdminMessage(input: SendMessageInput): Promise<{
    conversation: ConversationSummary;
    message: Message;
  }> {
    const result = await this.store.sendMessage(input);
    await this.broadcastMessage(result.message);
    return result;
  }

  async listConversations(accountId: string): Promise<ConversationSummary[]> {
    return this.store.listConversations(accountId);
  }

  async listOwnedConversations(ownerSubject: string) {
    return this.store.listOwnedConversations(ownerSubject);
  }

  async listConversationMessages(
    accountId: string,
    conversationId: string,
    before?: number,
    limit?: number,
  ): Promise<Message[]> {
    return this.store.listMessages(accountId, conversationId, before, limit);
  }

  async listOwnedConversationMessages(
    ownerSubject: string,
    conversationId: string,
    before?: number,
    limit?: number,
  ) {
    return this.store.listOwnedConversationMessages(ownerSubject, conversationId, before, limit);
  }

  async listFriends(accountId: string) {
    return this.store.listFriends(accountId);
  }

  async listGroups(accountId: string) {
    return this.store.listGroups(accountId);
  }

  async listConversationMembers(accountId: string, conversationId: string) {
    return this.store.listConversationMembers(accountId, conversationId);
  }

  async listAuditLogsForAccount(
    accountId: string,
    options: {
      conversationId?: string;
      limit?: number;
    } = {},
  ) {
    return this.store.listAuditLogsForAccount(accountId, options);
  }

  async listOwnedAuditLogs(
    ownerSubject: string,
    options: {
      conversationId?: string;
      limit?: number;
    } = {},
  ) {
    return this.store.listOwnedAuditLogs(ownerSubject, options);
  }

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = parseUrl(request.url ?? "", true);
      const method = request.method ?? "GET";
      const isAdminAuthorized = this.isAdminAuthorized(request);
      const userSession = this.getUserSession(request);
      const lang = normalizeUiLang(typeof url.query.lang === "string" ? url.query.lang : undefined);

      if (method === "GET" && url.pathname === "/") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          renderLandingPage({
            isLoggedIn: Boolean(userSession),
            appPath: "/app",
            loginPath: "/auth/login",
            registerPath: "/auth/register",
            ...(this.googleAuth ? { googleLoginPath: "/auth/google/login" } : {}),
            lang,
          }),
        );
        return;
      }

      if (method === "GET" && url.pathname === "/app") {
        if (!userSession) {
          redirect(response, "/auth/login");
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          renderAppPage({
            userName: userSession.name,
            userEmail: userSession.email,
            logoutPath: "/auth/logout",
          }),
        );
        return;
      }

      if (method === "GET" && url.pathname === "/auth/login") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          renderAuthPage({
            mode: "login",
            submitPath: "/auth/login",
            switchPath: "/auth/register",
            demoUser: {
              email: "test@example.com",
              password: "test123456",
            },
            ...(this.googleAuth ? { googleLoginPath: "/auth/google/login" } : {}),
          }),
        );
        return;
      }

      if (method === "GET" && url.pathname === "/auth/register") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(
          renderAuthPage({
            mode: "register",
            submitPath: "/auth/register",
            switchPath: "/auth/login",
            demoUser: {
              email: "test@example.com",
              password: "test123456",
            },
            ...(this.googleAuth ? { googleLoginPath: "/auth/google/login" } : {}),
          }),
        );
        return;
      }

      if (method === "POST" && url.pathname === "/auth/login") {
        const isForm = request.headers["content-type"]?.includes("application/x-www-form-urlencoded");
        const body = isForm
          ? HumanLoginBodySchema.parse(await this.readForm(request))
          : HumanLoginBodySchema.parse(await readJson(request));
        const user = await this.store.authenticateHumanUser(body.email, body.password);
        this.startUserSession(response, {
          createdAt: Date.now(),
          subject: `local:${user.id}`,
          email: user.email,
          name: user.name,
          authProvider: "local",
        });
        if (isForm) {
          redirect(response, "/app");
          return;
        }
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && url.pathname === "/auth/register") {
        const isForm = request.headers["content-type"]?.includes("application/x-www-form-urlencoded");
        const body = isForm
          ? HumanRegisterBodySchema.parse(await this.readForm(request))
          : HumanRegisterBodySchema.parse(await readJson(request));
        const user = await this.store.createHumanUser(body);
        this.startUserSession(response, {
          createdAt: Date.now(),
          subject: `local:${user.id}`,
          email: user.email,
          name: user.name,
          authProvider: "local",
        });
        if (isForm) {
          redirect(response, "/app");
          return;
        }
        jsonResponse(response, 201, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/auth/google/login") {
        this.ensureGoogleAuthConfigured();
        const state = randomUUID();
        this.oauthStates.set(state, {
          createdAt: Date.now(),
        });
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", this.googleAuth!.clientId);
        authUrl.searchParams.set("redirect_uri", this.googleAuth!.redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", "openid email profile");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("prompt", "select_account");
        redirect(response, authUrl.toString());
        return;
      }

      if (method === "GET" && url.pathname === "/auth/google/callback") {
        this.ensureGoogleAuthConfigured();
        const code = typeof url.query.code === "string" ? url.query.code : undefined;
        const state = typeof url.query.state === "string" ? url.query.state : undefined;
        if (!code || !state || !this.oauthStates.has(state)) {
          throw new AppError("UNAUTHORIZED", "Invalid Google OAuth callback", 401);
        }
        this.oauthStates.delete(state);
        const profile = await this.exchangeGoogleCodeForProfile(code);
        this.startUserSession(
          response,
          profile.picture
            ? {
                createdAt: Date.now(),
                subject: profile.sub,
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
                authProvider: "google",
              }
            : {
                createdAt: Date.now(),
                subject: profile.sub,
                email: profile.email,
                name: profile.name,
                authProvider: "google",
              },
        );
        redirect(response, "/app");
        return;
      }

      if (method === "GET" && url.pathname === "/auth/logout") {
        const sessionId = this.getCookie(request, "agentchat_user_session");
        if (sessionId) {
          this.userSessions.delete(sessionId);
        }
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_user_session", "", { maxAge: 0 }),
        );
        redirect(response, "/");
        return;
      }

      if (method === "GET" && url.pathname === "/admin/ui") {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(renderAdminPage(isAdminAuthorized));
        return;
      }

      if (method === "GET" && url.pathname === "/admin/health") {
        jsonResponse(response, 200, {
          ok: true,
          httpUrl: this.httpUrl || DEFAULT_HTTP_URL,
          wsUrl: this.wsUrl || DEFAULT_WS_URL,
          databasePath: this.store.databasePath,
          adminAuthEnabled: Boolean(this.adminPassword),
          googleAuthEnabled: Boolean(this.googleAuth),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/admin/login") {
        const body = request.headers["content-type"]?.includes("application/x-www-form-urlencoded")
          ? LoginBodySchema.parse(await this.readForm(request))
          : LoginBodySchema.parse(await readJson(request));
        this.assertAdminPassword(body.password);
        const sessionId = randomUUID();
        this.adminSessions.set(sessionId, {
          createdAt: Date.now(),
        });
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_admin_session", sessionId, {
            maxAge: 60 * 60 * 8,
          }),
        );
        if (request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
          redirect(response, "/admin/ui");
          return;
        }
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && url.pathname === "/admin/logout") {
        const sessionId = this.getAdminSessionId(request);
        if (sessionId) {
          this.adminSessions.delete(sessionId);
        }
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_admin_session", "", { maxAge: 0 }),
        );
        if (request.headers.accept?.includes("text/html")) {
          redirect(response, "/admin/ui");
          return;
        }
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/accounts") {
        const session = this.requireUserSession(request);
        jsonResponse(response, 200, await this.listAccounts(session.subject));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/conversations") {
        const session = this.requireUserSession(request);
        jsonResponse(response, 200, await this.listOwnedConversations(session.subject));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/audit-logs") {
        const session = this.requireUserSession(request);
        const conversationId =
          typeof url.query.conversationId === "string" ? url.query.conversationId : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        jsonResponse(
          response,
          200,
          await this.listOwnedAuditLogs(session.subject, {
            ...(conversationId ? { conversationId } : {}),
            ...(limit ? { limit } : {}),
          }),
        );
        return;
      }

      const appConversationMessagesMatch =
        url.pathname?.match(/^\/app\/api\/conversations\/([^/]+)\/messages$/);
      if (method === "GET" && appConversationMessagesMatch) {
        const session = this.requireUserSession(request);
        const before = typeof url.query.before === "string" ? Number(url.query.before) : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        jsonResponse(
          response,
          200,
          await this.listOwnedConversationMessages(
            session.subject,
            appConversationMessagesMatch[1]!,
            before,
            limit,
          ),
        );
        return;
      }

      if (method === "POST" && url.pathname === "/app/api/accounts") {
        const session = this.requireUserSession(request);
        const body = CreateAccountBodySchema.parse(await readJson(request));
        jsonResponse(
          response,
          201,
          await this.createAccount({
            ...body,
            owner: {
              subject: session.subject,
              email: session.email,
              name: session.name,
            },
          }),
        );
        return;
      }

      const appAccountTokenMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)\/reset-token$/);
      if (method === "POST" && appAccountTokenMatch) {
        const session = this.requireUserSession(request);
        jsonResponse(response, 200, await this.resetToken(appAccountTokenMatch[1]!, session.subject));
        return;
      }

      this.requireAdminAuthorization(request);

      if (method === "POST" && url.pathname === "/admin/init") {
        jsonResponse(response, 200, {
          ok: true,
          databasePath: this.store.databasePath,
          httpUrl: this.httpUrl,
          wsUrl: this.wsUrl,
        });
        return;
      }

      if (method === "GET" && url.pathname === "/admin/accounts") {
        jsonResponse(response, 200, await this.listAccounts());
        return;
      }

      if (method === "POST" && url.pathname === "/admin/accounts") {
        const body = CreateAccountBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, await this.createAccount(body));
        return;
      }

      const accountTokenMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/reset-token$/);
      if (method === "POST" && accountTokenMatch) {
        jsonResponse(response, 200, await this.resetToken(accountTokenMatch[1]!));
        return;
      }

      const friendsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/friends$/);
      if (method === "GET" && friendsMatch) {
        jsonResponse(response, 200, await this.listFriends(friendsMatch[1]!));
        return;
      }

      const groupsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/groups$/);
      if (method === "GET" && groupsMatch) {
        jsonResponse(response, 200, await this.listGroups(groupsMatch[1]!));
        return;
      }

      const conversationsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/conversations$/);
      if (method === "GET" && conversationsMatch) {
        jsonResponse(response, 200, await this.listConversations(conversationsMatch[1]!));
        return;
      }

      if (method === "POST" && url.pathname === "/admin/friendships") {
        const body = CreateFriendshipBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, await this.createFriendship(body.accountA, body.accountB));
        return;
      }

      if (method === "POST" && url.pathname === "/admin/groups") {
        const body = CreateGroupBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, await this.createGroup(body.title));
        return;
      }

      const groupMemberMatch = url.pathname?.match(/^\/admin\/groups\/([^/]+)\/members$/);
      if (method === "POST" && groupMemberMatch) {
        const body = AddGroupMemberBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, await this.addGroupMember(groupMemberMatch[1]!, body.accountId));
        return;
      }

      if (method === "POST" && url.pathname === "/admin/messages") {
        const body = SendMessageBodySchema.parse(await readJson(request));
        if (!body.conversationId && !body.recipientId) {
          throw new AppError(
            "INVALID_ARGUMENT",
            "Either conversationId or recipientId is required",
          );
        }
        jsonResponse(response, 201, await this.sendAdminMessage(body as SendMessageInput));
        return;
      }

      const messageMatch = url.pathname?.match(/^\/admin\/conversations\/([^/]+)\/messages$/);
      if (method === "GET" && messageMatch) {
        const accountId = url.query.accountId;
        if (typeof accountId !== "string" || !accountId) {
          throw new AppError("INVALID_ARGUMENT", "accountId is required");
        }
        const before = typeof url.query.before === "string" ? Number(url.query.before) : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        jsonResponse(
          response,
          200,
          await this.listConversationMessages(accountId, messageMatch[1]!, before, limit),
        );
        return;
      }

      throw new AppError("NOT_FOUND", "Route not found", 404);
    } catch (error) {
      const appError = error instanceof z.ZodError
        ? new AppError("INVALID_ARGUMENT", error.message)
        : asAppError(error);
      jsonResponse(response, appError.statusCode, {
        ok: false,
        code: appError.code,
        message: appError.message,
      });
    }
  }

  private async handleSocketMessage(connection: ConnectionState, rawMessage: string) {
    let requestId: string | undefined;

    try {
      const request = ClientRequestSchema.parse(JSON.parse(rawMessage));
      requestId = request.id;

      switch (request.type) {
        case "connect": {
          const account = await this.store.authenticateAccount(
            request.payload.accountId,
            request.payload.token,
          );
          connection.accountId = account.id;
          connection.sessionId = randomUUID();
          await this.registerConnection(connection);
          this.sendResponse(connection, request.id, {
            account,
          });
          return;
        }
        case "subscribe_conversations": {
          const accountId = this.requireAuthenticated(connection);
          connection.subscribedConversationFeed = true;
          this.sendResponse(connection, request.id, await this.store.listConversations(accountId));
          return;
        }
        case "subscribe_messages": {
          const accountId = this.requireAuthenticated(connection);
          await this.store.listMessages(accountId, request.payload.conversationId, undefined, 1);
          connection.subscribedConversationIds.add(request.payload.conversationId);
          this.sendResponse(connection, request.id, {
            conversationId: request.payload.conversationId,
          });
          return;
        }
        case "list_conversations": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.store.listConversations(accountId));
          return;
        }
        case "list_messages": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.store.listMessages(
              accountId,
              request.payload.conversationId,
              request.payload.before,
              request.payload.limit,
            ),
          );
          return;
        }
        case "send_message": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.store.sendMessage({
            senderId: accountId,
            conversationId: request.payload.conversationId,
            body: request.payload.body,
          });
          await this.broadcastMessage(result.message);
          this.sendResponse(connection, request.id, result.message);
          return;
        }
        case "list_friends": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.store.listFriends(accountId));
          return;
        }
        case "list_groups": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.store.listGroups(accountId));
          return;
        }
        case "add_friend": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.addFriendAs(accountId, request.payload.peerAccountId);
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "list_friend_requests": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.listFriendRequests(
            accountId,
            request.payload.direction ?? "all",
          );
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "respond_friend_request": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.respondFriendRequestAs(
            accountId,
            request.payload.requestId,
            request.payload.action,
          );
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "create_group": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.createGroupAs(accountId, request.payload.title);
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "add_group_member": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.addGroupMemberAs(
            accountId,
            request.payload.conversationId,
            request.payload.accountId,
          );
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "list_conversation_members": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.listConversationMembers(
            accountId,
            request.payload.conversationId,
          );
          this.sendResponse(connection, request.id, result);
          return;
        }
        case "list_audit_logs": {
          const accountId = this.requireAuthenticated(connection);
          const result = await this.listAuditLogsForAccount(accountId, {
            ...(request.payload.conversationId
              ? { conversationId: request.payload.conversationId }
              : {}),
            ...(request.payload.limit ? { limit: request.payload.limit } : {}),
          });
          this.sendResponse(connection, request.id, result);
          return;
        }
      }
    } catch (error) {
      const appError = error instanceof z.ZodError
        ? new AppError("INVALID_ARGUMENT", error.message)
        : asAppError(error);
      connection.socket.send(
        JSON.stringify(makeErrorFrame(appError.code, appError.message, requestId)),
      );
    }
  }

  private async handleSocketClose(connection: ConnectionState): Promise<void> {
    this.connections.delete(connection.socket);
    if (!connection.accountId || !connection.sessionId) {
      return;
    }

    await this.store.markSessionStatus(connection.sessionId, connection.accountId, "offline");
    const peers = this.accountConnections.get(connection.accountId);
    if (peers) {
      peers.delete(connection);
      if (peers.size === 0) {
        this.accountConnections.delete(connection.accountId);
        await this.broadcastPresence(connection.accountId, "offline");
      }
    }
  }

  private async registerConnection(connection: ConnectionState): Promise<void> {
    const accountId = connection.accountId;
    const sessionId = connection.sessionId;
    if (!accountId || !sessionId) {
      throw new AppError("UNAUTHORIZED", "Connection must authenticate first", 401);
    }

    let peers = this.accountConnections.get(accountId);
    const wasOffline = !peers || peers.size === 0;
    if (!peers) {
      peers = new Set();
      this.accountConnections.set(accountId, peers);
    }
    peers.add(connection);
    await this.store.markSessionStatus(sessionId, accountId, "online");
    if (wasOffline) {
      await this.broadcastPresence(accountId, "online");
    }
  }

  private async broadcastPresence(accountId: string, status: "online" | "offline"): Promise<void> {
    const watcherIds = await this.store.getConversationWatcherIds(accountId);
    const event = makeEvent("presence.updated", { accountId, status });
    for (const watcherId of watcherIds) {
      this.dispatchEventToAccount(
        watcherId,
        event,
        (connection) => connection.subscribedConversationFeed,
      );
    }
  }

  private async broadcastConversationCreated(accountId: string, conversationId: string): Promise<void> {
    const summary = await this.store.getConversationSummaryForAccount(accountId, conversationId);
    this.dispatchEventToAccount(
      accountId,
      makeEvent("conversation.created", summary),
      (connection) => connection.subscribedConversationFeed,
    );
  }

  private async broadcastMessage(message: Message): Promise<void> {
    const memberIds = await this.store.getConversationMemberIds(message.conversationId);
    const event = makeEvent("message.created", message);
    for (const memberId of memberIds) {
      this.dispatchEventToAccount(
        memberId,
        event,
        (connection) => connection.subscribedConversationIds.has(message.conversationId),
      );
    }
  }

  private dispatchEventToAccount(
    accountId: string,
    event: ServerEvent,
    predicate: (connection: ConnectionState) => boolean,
  ): void {
    const peers = this.accountConnections.get(accountId);
    if (!peers) {
      return;
    }
    for (const connection of peers) {
      if (predicate(connection)) {
        connection.socket.send(JSON.stringify(event));
      }
    }
  }

  private sendResponse(connection: ConnectionState, requestId: string, payload: unknown): void {
    connection.socket.send(JSON.stringify(makeResponse(requestId, payload)));
  }

  private requireAuthenticated(connection: ConnectionState): string {
    if (!connection.accountId) {
      throw new AppError("UNAUTHORIZED", "Must connect before calling this method", 401);
    }
    return connection.accountId;
  }

  private requireAdminAuthorization(request: IncomingMessage): void {
    if (!this.isAdminAuthorized(request)) {
      throw new AppError("UNAUTHORIZED", "Admin authorization required", 401);
    }
  }

  private requireUserSession(request: IncomingMessage): UserSession {
    const session = this.getUserSession(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", "Login required", 401);
    }
    return session;
  }

  private isAdminAuthorized(request: IncomingMessage): boolean {
    if (!this.adminPassword) {
      return true;
    }

    const headerPassword = request.headers["x-admin-password"];
    if (typeof headerPassword === "string" && this.passwordMatches(headerPassword)) {
      return true;
    }

    const sessionId = this.getAdminSessionId(request);
    if (!sessionId) {
      return false;
    }

    return this.adminSessions.has(sessionId);
  }

  private assertAdminPassword(password: string): void {
    if (!this.adminPassword) {
      return;
    }
    if (!this.passwordMatches(password)) {
      throw new AppError("UNAUTHORIZED", "Invalid admin password", 401);
    }
  }

  private passwordMatches(password: string): boolean {
    if (!this.adminPassword) {
      return true;
    }

    const left = Buffer.from(password);
    const right = Buffer.from(this.adminPassword);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  private getAdminSessionId(request: IncomingMessage): string | undefined {
    return this.getCookie(request, "agentchat_admin_session");
  }

  private getUserSession(request: IncomingMessage): UserSession | undefined {
    const sessionId = this.getCookie(request, "agentchat_user_session");
    if (!sessionId) {
      return undefined;
    }
    return this.userSessions.get(sessionId);
  }

  private startUserSession(response: ServerResponse, session: UserSession): void {
    const sessionId = randomUUID();
    this.userSessions.set(sessionId, session);
    response.setHeader(
      "set-cookie",
      this.makeSessionCookie("agentchat_user_session", sessionId, {
        maxAge: 60 * 60 * 24 * 7,
      }),
    );
  }

  private getCookie(request: IncomingMessage, name: string): string | undefined {
    const header = request.headers.cookie;
    if (!header) {
      return undefined;
    }

    const cookies = header.split(";").map((part) => part.trim());
    for (const cookie of cookies) {
      const [cookieName, ...valueParts] = cookie.split("=");
      if (cookieName === name) {
        return valueParts.join("=") || undefined;
      }
    }
    return undefined;
  }

  private makeSessionCookie(
    name: string,
    value: string,
    options: { maxAge: number },
  ): string {
    return [
      `${name}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${options.maxAge}`,
    ].join("; ");
  }

  private ensureGoogleAuthConfigured(): void {
    if (!this.googleAuth) {
      throw new AppError("SERVICE_UNAVAILABLE", "Google OAuth is not configured", 503);
    }
  }

  private async exchangeGoogleCodeForProfile(
    code: string,
  ): Promise<z.infer<typeof GoogleUserInfoSchema>> {
    this.ensureGoogleAuthConfigured();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: this.googleAuth!.clientId,
        client_secret: this.googleAuth!.clientSecret,
        redirect_uri: this.googleAuth!.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new AppError("UNAUTHORIZED", "Google token exchange failed", 401);
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenPayload.access_token) {
      throw new AppError("UNAUTHORIZED", "Missing Google access token", 401);
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        authorization: `Bearer ${tokenPayload.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new AppError("UNAUTHORIZED", "Failed to fetch Google user profile", 401);
    }

    const profile = GoogleUserInfoSchema.parse(await profileResponse.json());
    if (!profile.email_verified) {
      throw new AppError("UNAUTHORIZED", "Google email must be verified", 401);
    }
    return profile;
  }

  private async readForm(request: IncomingMessage): Promise<Record<string, string>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    return Object.fromEntries(params.entries());
  }
}
