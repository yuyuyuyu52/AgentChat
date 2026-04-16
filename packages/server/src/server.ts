import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { URLSearchParams } from "node:url";
import { parse as parseUrl } from "node:url";
import {
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  makeEvent,
  makeResponse,
  type Account,
  type AgentCard,
  type AuthAccount,
  type ConversationSummary,
  type Message,
  type NotificationType,
  type PlazaPost,
  type ServerEvent,
} from "@agentchatjs/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { renderAdminPage } from "./admin-ui.js";
import { AppError, asAppError } from "./errors.js";
import {
  AgentChatStore,
  type CreateAccountInput,
  type SendMessageInput,
  type StoredUserSession,
} from "./store/index.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embedding.js";
import { computeAgentScore, computeActivityRecency, computeProfileCompleteness } from "./recommendation.js";
import type { RouteContext } from "./routes/types.js";
import { handle as handleAuth } from "./routes/auth.js";
import { handle as handleAdmin } from "./routes/admin.js";
import { handle as handleAppAgents } from "./routes/app-agents.js";
import { handle as handleAppAccounts } from "./routes/app-accounts.js";
import { handle as handleAppConversations } from "./routes/app-conversations.js";
import { handle as handleAppPlaza } from "./routes/app-plaza.js";
import { handle as handleAppNotifications } from "./routes/app-notifications.js";
import { handleSocketMessage } from "./routes/websocket.js";

export type ConnectionState = {
  socket: WebSocket;
  clientAddress: string;
  accountId?: string;
  subscribedConversationIds: Set<string>;
  subscribedConversationFeed: boolean;
  subscribedPlazaFeed: boolean;
  subscribedNotifications: boolean;
  sessionId?: string;
};

export type AgentChatServerOptions = {
  host?: string | undefined;
  port?: number | undefined;
  databaseUrl: string;
  publicHttpUrl?: string | undefined;
  publicWsUrl?: string | undefined;
  adminPassword?: string | undefined;
  googleAuth?:
    | {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
      }
    | undefined;
};

type UserSession = StoredUserSession;

class FailedAttemptRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly scope: string,
  ) {}

  assertAllowed(key: string): void {
    const now = Date.now();
    const failures = this.prune(key, now);
    if (failures.length >= this.limit) {
      throw new AppError(
        "TOO_MANY_REQUESTS",
        `Too many ${this.scope} attempts. Try again later.`,
        429,
      );
    }
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const failures = this.prune(key, now);
    failures.push(now);
    this.failures.set(key, failures);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }

  private prune(key: string, now: number): number[] {
    const failures = (this.failures.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    if (failures.length === 0) {
      this.failures.delete(key);
      return [];
    }
    this.failures.set(key, failures);
    return failures;
  }
}

const GoogleUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().min(1),
  picture: z.string().optional(),
});

const CONTROL_PLANE_DIST_DIR = fileURLToPath(
  new URL("../../control-plane/dist/", import.meta.url),
);
const CONTROL_PLANE_ENTRY_FILE = resolve(CONTROL_PLANE_DIST_DIR, "index.html");

export function normalizeUiLang(value: string | undefined): "en" | "zh-CN" {
  if (value === "zh" || value === "zh-CN") {
    return "zh-CN";
  }
  return "en";
}

export function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
}

export function jsonResponse(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function buildAgentCard(account: Account, baseUrl: string): AgentCard {
  const profile = account.profile as Record<string, unknown>;
  return {
    name: (profile.displayName as string) || account.name,
    description: (profile.bio as string) || undefined,
    url: `${baseUrl}/agents/${account.id}/card.json`,
    capabilities: Array.isArray(profile.capabilities) ? profile.capabilities as string[] : undefined,
    skills: Array.isArray(profile.skills) ? profile.skills as AgentCard["skills"] : undefined,
    avatarUrl: (profile.avatarUrl as string) || undefined,
    bio: (profile.bio as string) || undefined,
    location: (profile.location as string) || undefined,
    website: (profile.website as string) || undefined,
  };
}

function contentTypeForFile(pathname: string): string {
  switch (extname(pathname)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

export function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value?.split(",")[0]?.trim() || undefined;
}

function isControlPlaneAssetPath(pathname: string | null | undefined): pathname is string {
  return Boolean(pathname?.startsWith("/assets/"));
}

function isControlPlaneAppPath(pathname: string | null | undefined): pathname is string {
  if (!pathname) {
    return false;
  }
  if (
    pathname === "/"
    || pathname === "/app"
    || pathname === "/admin/ui"
    || pathname === "/auth/login"
    || pathname === "/auth/register"
  ) {
    return true;
  }
  if (pathname.startsWith("/app/") && !pathname.startsWith("/app/api/")) {
    return true;
  }
  if (pathname.startsWith("/admin/ui/")) {
    return true;
  }
  return false;
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
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

  readonly adminLoginRateLimiter = new FailedAttemptRateLimiter(
    10,
    10 * 60 * 1_000,
    "admin login",
  );
  readonly userLoginRateLimiter = new FailedAttemptRateLimiter(
    10,
    10 * 60 * 1_000,
    "login",
  );
  readonly agentConnectRateLimiter = new FailedAttemptRateLimiter(
    15,
    10 * 60 * 1_000,
    "agent authentication",
  );

  private readonly requestedPort: number;
  private readonly adminPassword: string | undefined;
  private readonly publicHttpUrl: string | undefined;
  private readonly publicWsUrl: string | undefined;
  /** @internal Exposed for route handlers */
  readonly googleAuth:
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
  private actualPort = 0;
  private scoreRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private embeddingProvider: EmbeddingProvider;

  constructor(options: AgentChatServerOptions) {
    if (process.env.NODE_ENV === "production" && !options.adminPassword) {
      throw new Error("AGENTCHAT_ADMIN_PASSWORD is required in production");
    }

    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 43110;
    this.adminPassword = options.adminPassword;
    this.publicHttpUrl = options.publicHttpUrl;
    this.publicWsUrl = options.publicWsUrl;
    this.googleAuth = options.googleAuth;
    this.store = new AgentChatStore({
      databaseUrl: options.databaseUrl,
    });
    const openaiKey = process.env.AGENTCHAT_OPENAI_API_KEY;
    this.embeddingProvider = createEmbeddingProvider(
      openaiKey ? { apiKey: openaiKey } : {},
    );

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

    this.wsServer.on("connection", (socket, request) => {
      const state: ConnectionState = {
        socket,
        clientAddress: this.getClientAddress(request),
        subscribedConversationIds: new Set(),
        subscribedConversationFeed: false,
        subscribedPlazaFeed: false,
        subscribedNotifications: false,
      };
      this.connections.set(socket, state);
      socket.on("message", (data) => {
        void handleSocketMessage(this, state, data.toString());
      });
      socket.on("close", () => {
        void this.handleSocketClose(state);
      });
    });
  }

  get httpUrl(): string {
    if (this.publicHttpUrl) {
      return this.publicHttpUrl;
    }
    return `http://${this.host}:${this.actualPort}`;
  }

  get wsUrl(): string {
    if (this.publicWsUrl) {
      return this.publicWsUrl;
    }
    if (this.publicHttpUrl) {
      const publicUrl = new URL(this.publicHttpUrl);
      publicUrl.protocol = publicUrl.protocol === "https:" ? "wss:" : "ws:";
      publicUrl.pathname = "/ws";
      publicUrl.search = "";
      publicUrl.hash = "";
      return publicUrl.toString();
    }
    return `ws://${this.host}:${this.actualPort}/ws`;
  }

  get adminAuthEnabled(): boolean {
    return Boolean(this.adminPassword);
  }

  get googleAuthEnabled(): boolean {
    return Boolean(this.googleAuth);
  }

  getExternalHttpUrl(request?: IncomingMessage): string {
    if (this.publicHttpUrl) {
      return this.publicHttpUrl;
    }
    const host = firstHeaderValue(request?.headers.host);
    if (host) {
      const protocol = firstHeaderValue(request?.headers["x-forwarded-proto"]) ?? "http";
      return `${protocol}://${host}`;
    }
    return this.httpUrl || DEFAULT_HTTP_URL;
  }

  getExternalWsUrl(request?: IncomingMessage): string {
    if (this.publicWsUrl) {
      return this.publicWsUrl;
    }
    if (this.publicHttpUrl) {
      return this.wsUrl || DEFAULT_WS_URL;
    }
    const host = firstHeaderValue(request?.headers.host);
    if (host) {
      const protocol = firstHeaderValue(request?.headers["x-forwarded-proto"]) === "https"
        ? "wss"
        : "ws";
      return `${protocol}://${host}/ws`;
    }
    return this.wsUrl || DEFAULT_WS_URL;
  }

  async start(): Promise<void> {
    if (this.actualPort !== 0) {
      return;
    }

    await this.store.initialize();
    this.startScoreRefresh();

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

    if (this.scoreRefreshTimer) {
      clearInterval(this.scoreRefreshTimer);
      this.scoreRefreshTimer = null;
    }

    await this.store.close();
  }

  // ── Public domain methods (used by route handlers) ─────────────

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

  async deleteAccount(
    accountId: string,
    ownerSubject?: string,
  ): Promise<void> {
    await this.store.deleteAccount(accountId, ownerSubject);
    // Disconnect any active WebSocket connections for this account
    for (const connection of this.connections.values()) {
      if (connection.accountId === accountId) {
        connection.socket.close(1000, "Account deleted");
      }
    }
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
    const result = await this.store.addFriendAs(actorId, peerAccountId);
    this.createAndDispatchNotification({
      recipientAccountId: peerAccountId,
      type: "friend_request_received",
      actorAccountId: actorId,
      subjectType: "friend_request",
      subjectId: result.requestId,
    }).catch(() => {});
    return result;
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
        // Notify the requester that their request was accepted
        this.createAndDispatchNotification({
          recipientAccountId: request.requester.id,
          type: "friend_request_accepted",
          actorAccountId: actorId,
          subjectType: "friend_request",
          subjectId: requestId,
        }).catch(() => {});
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

  async listAuditLogs(
    options: {
      accountId?: string;
      conversationId?: string;
      limit?: number;
    } = {},
  ) {
    return this.store.listAuditLogs(options);
  }

  async createPlazaPost(
    authorAccountId: string,
    body: string,
    options?: { parentPostId?: string; quotedPostId?: string },
  ): Promise<PlazaPost> {
    const post = await this.store.createPlazaPost(authorAccountId, body, options);
    this.broadcastPlazaPostCreated(post);

    // Async: generate embedding for top-level posts (fire-and-forget)
    if (!options?.parentPostId) {
      this.generatePostEmbedding(post.id, post.body).catch((err) => {
        console.error(`Failed to generate embedding for post ${post.id}:`, err);
      });
    }

    // Notify parent post author when this is a reply
    if (options?.parentPostId) {
      this.store.getPlazaPostAuthorId(options.parentPostId).then((parentAuthorId) => {
        this.createAndDispatchNotification({
          recipientAccountId: parentAuthorId,
          type: "plaza_post_replied",
          actorAccountId: authorAccountId,
          subjectType: "plaza_post",
          subjectId: post.id,
          data: { postBody: post.body.slice(0, 100) },
        }).catch(() => {});
      }).catch(() => {});
    }

    return post;
  }

  async listPlazaPosts(options: {
    authorAccountId?: string;
    viewerAccountId?: string;
    beforeCreatedAt?: string;
    beforeId?: string;
    limit?: number;
  } = {}) {
    return this.store.listPlazaPosts(options);
  }

  async updateInterestVector(accountId: string): Promise<void> {
    const result = await this.store.buildInterestVector(accountId);
    if (result) {
      await this.store.upsertInterestVector(accountId, result.vector, result.interactionCount);
    }
  }

  async getPlazaPost(postId: string, viewerAccountId?: string): Promise<PlazaPost> {
    return this.store.getPlazaPost(postId, viewerAccountId);
  }

  // ── Connection management (used by websocket handler) ──────────

  async registerConnection(connection: ConnectionState): Promise<void> {
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

  requireAuthenticated(connection: ConnectionState): string {
    if (!connection.accountId) {
      throw new AppError("UNAUTHORIZED", "Must connect before calling this method", 401);
    }
    return connection.accountId;
  }

  sendResponse(connection: ConnectionState, requestId: string, payload: unknown): void {
    connection.socket.send(JSON.stringify(makeResponse(requestId, payload)));
  }

  // ── Broadcasting ───────────────────────────────────────────────

  async broadcastMessage(message: Message): Promise<void> {
    const memberIds = await this.store.getConversationMemberIds(message.conversationId);
    const event = makeEvent("message.created", message);
    for (const memberId of memberIds) {
      this.dispatchEventToAccount(
        memberId,
        event,
        (connection) => connection.subscribedConversationIds.has(message.conversationId),
      );
      // Notify offline members about new messages
      if (memberId !== message.senderId && !this.accountConnections.has(memberId)) {
        this.createAndDispatchNotification({
          recipientAccountId: memberId,
          type: "message_received",
          actorAccountId: message.senderId,
          subjectType: "message",
          subjectId: message.id,
          data: { conversationId: message.conversationId, messageBody: message.body.slice(0, 100) },
        }).catch(() => {});
      }
    }
  }

  createAndDispatchNotification(input: {
    recipientAccountId: string;
    type: NotificationType;
    actorAccountId?: string;
    subjectType: string;
    subjectId: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Don't notify yourself
    if (input.actorAccountId && input.actorAccountId === input.recipientAccountId) return Promise.resolve();

    return this.store.createNotification(input).then((notification) => {
      if (!notification) return; // dedup: already exists

      this.dispatchEventToAccount(
        input.recipientAccountId,
        makeEvent("notification.created", notification),
        (conn) => conn.subscribedNotifications,
      );
    });
  }

  // ── Auth helpers (used by route handlers) ──────────────────────

  async requireAdminAuthorization(request: IncomingMessage): Promise<void> {
    if (!(await this.isAdminAuthorized(request))) {
      throw new AppError("UNAUTHORIZED", "Admin authorization required", 401);
    }
  }

  async requireUserSession(request: IncomingMessage): Promise<UserSession> {
    const session = await this.getUserSession(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", "Login required", 401);
    }
    return session;
  }

  async isAdminAuthorized(request: IncomingMessage): Promise<boolean> {
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

    return this.store.hasAdminSession(sessionId);
  }

  assertAdminPassword(password: string): void {
    if (!this.adminPassword) {
      return;
    }
    if (!this.passwordMatches(password)) {
      throw new AppError("UNAUTHORIZED", "Invalid admin password", 401);
    }
  }

  async getUserSession(request: IncomingMessage): Promise<UserSession | undefined> {
    const sessionId = this.getCookie(request, "agentchat_user_session");
    if (!sessionId) {
      return undefined;
    }
    return this.store.getUserSession(sessionId);
  }

  async startUserSession(
    request: IncomingMessage,
    response: ServerResponse,
    session: UserSession,
  ): Promise<void> {
    const sessionId = await this.store.createUserSession(
      {
        subject: session.subject,
        email: session.email,
        name: session.name,
        ...(session.picture ? { picture: session.picture } : {}),
        authProvider: session.authProvider,
      },
      60 * 60 * 24 * 7,
    );
    response.setHeader(
      "set-cookie",
      this.makeSessionCookie("agentchat_user_session", sessionId, {
        maxAge: 60 * 60 * 24 * 7,
        secure: this.shouldUseSecureCookies(request),
      }),
    );
  }

  getCookie(request: IncomingMessage, name: string): string | undefined {
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

  makeSessionCookie(
    name: string,
    value: string,
    options: { maxAge: number; secure: boolean },
  ): string {
    const parts = [
      `${name}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${options.maxAge}`,
    ];
    if (options.secure) {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  shouldUseSecureCookies(request: IncomingMessage): boolean {
    if (this.publicHttpUrl) {
      return new URL(this.publicHttpUrl).protocol === "https:";
    }

    const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"]);
    if (forwardedProto) {
      return forwardedProto === "https";
    }

    return "encrypted" in request.socket && Boolean(request.socket.encrypted);
  }

  getClientAddress(request: IncomingMessage): string {
    const forwardedFor = firstHeaderValue(request.headers["x-forwarded-for"]);
    return forwardedFor ?? request.socket.remoteAddress ?? "unknown";
  }

  getAdminSessionId(request: IncomingMessage): string | undefined {
    return this.getCookie(request, "agentchat_admin_session");
  }

  ensureGoogleAuthConfigured(): void {
    if (!this.googleAuth) {
      throw new AppError("SERVICE_UNAVAILABLE", "Google OAuth is not configured", 503);
    }
  }

  async exchangeGoogleCodeForProfile(
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

  async readForm(request: IncomingMessage): Promise<Record<string, string>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    return Object.fromEntries(params.entries());
  }

  // ── Private internals ──────────────────────────────────────────

  private startScoreRefresh(): void {
    this.refreshAgentScores().catch((err) => {
      console.error("Failed initial agent score refresh:", err);
    });
    this.scoreRefreshTimer = setInterval(() => {
      this.refreshAgentScores().catch((err) => {
        console.error("Failed agent score refresh:", err);
      });
    }, 3600 * 1000);
  }

  private async refreshAgentScores(): Promise<void> {
    const agents = await this.store.listAccountsByType("agent");

    for (const agent of agents) {
      try {
        const postQualityAvg = await this.store.getAgentPostQualityAvg(agent.id);
        const engagementRate = await this.store.getAgentEngagementRate(agent.id);
        const lastPostAge = await this.store.getAgentLastPostAgeHours(agent.id);

        const activityRecency = computeActivityRecency(lastPostAge);
        const profileCompleteness = computeProfileCompleteness(agent.profile);
        const score = computeAgentScore({
          postQualityAvg,
          engagementRate,
          activityRecency,
          profileCompleteness,
        });

        await this.store.upsertAgentScore(agent.id, {
          score,
          engagementRate,
          postQualityAvg,
          activityRecency,
          profileCompleteness,
        });
      } catch (err) {
        console.error(`Failed to compute score for agent ${agent.id}:`, err);
      }
    }
  }

  private async generatePostEmbedding(postId: string, body: string): Promise<void> {
    const results = await this.embeddingProvider.embed([body]);
    const embedding = results[0];
    if (!embedding) return;
    await this.store.upsertPostEmbedding(postId, embedding, this.embeddingProvider.model);
  }

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = parseUrl(request.url ?? "", true);
      const method = request.method ?? "GET";
      const isAdminAuthorized = await this.isAdminAuthorized(request);
      const userSession = await this.getUserSession(request);

      // ── Static file serving ──────────────────────────────────
      if ((method === "GET" || method === "HEAD") && isControlPlaneAssetPath(url.pathname)) {
        const servedAsset = await this.tryServeControlPlaneAsset(url.pathname, response, method);
        if (servedAsset) {
          return;
        }
      }

      if ((method === "GET" || method === "HEAD") && isControlPlaneAppPath(url.pathname)) {
        if (url.pathname === "/admin/ui" || url.pathname.startsWith("/admin/ui/")) {
          if (!isAdminAuthorized) {
            response.statusCode = 200;
            response.setHeader("content-type", "text/html; charset=utf-8");
            if (method === "HEAD") {
              response.end();
            } else {
              response.end(renderAdminPage(false));
            }
            return;
          }
        }

        if (
          userSession
          && (url.pathname === "/auth/login" || url.pathname === "/auth/register")
        ) {
          redirect(response, "/app");
          return;
        }

        if ((url.pathname === "/app" || url.pathname.startsWith("/app/")) && !userSession) {
          redirect(response, "/auth/login");
          return;
        }

        await this.serveControlPlaneIndex(response, method);
        return;
      }

      // ── Route dispatch ───────────────────────────────────────
      const ctx: RouteContext = { server: this, request, response, url, method, userSession, isAdminAuthorized };

      if (await handleAuth(ctx)) return;
      if (await handleAdmin(ctx)) return;
      if (await handleAppAgents(ctx)) return;
      if (await handleAppAccounts(ctx)) return;
      if (await handleAppConversations(ctx)) return;
      if (await handleAppPlaza(ctx)) return;
      if (await handleAppNotifications(ctx)) return;

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

  private broadcastPlazaPostCreated(post: PlazaPost): void {
    const event = makeEvent("plaza_post.created", post);
    for (const connection of this.connections.values()) {
      if (connection.accountId && connection.subscribedPlazaFeed) {
        connection.socket.send(JSON.stringify(event));
      }
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

  private async serveControlPlaneIndex(
    response: ServerResponse,
    method: "GET" | "HEAD",
  ): Promise<void> {
    try {
      const html = await readFile(CONTROL_PLANE_ENTRY_FILE, "utf8");
      response.statusCode = 200;
      response.setHeader("content-type", "text/html; charset=utf-8");
      if (method === "HEAD") {
        response.end();
      } else {
        response.end(html);
      }
    } catch (error) {
      const appError = asAppError(error);
      response.statusCode = appError.statusCode === 500 ? 503 : appError.statusCode;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Control plane bundle is unavailable. Run `npm run build:control-plane`.");
    }
  }

  private async tryServeControlPlaneAsset(
    pathname: string,
    response: ServerResponse,
    method: "GET" | "HEAD",
  ): Promise<boolean> {
    if (!isControlPlaneAssetPath(pathname)) {
      return false;
    }

    const relativePath = pathname.replace(/^\//, "");
    if (!relativePath) {
      return false;
    }

    const filePath = resolve(CONTROL_PLANE_DIST_DIR, relativePath);
    const distPrefix = CONTROL_PLANE_DIST_DIR.endsWith(sep)
      ? CONTROL_PLANE_DIST_DIR
      : `${CONTROL_PLANE_DIST_DIR}${sep}`;
    if (filePath !== CONTROL_PLANE_ENTRY_FILE && !filePath.startsWith(distPrefix)) {
      throw new AppError("FORBIDDEN", "Invalid asset path", 403);
    }

    try {
      const file = await readFile(filePath);
      response.statusCode = 200;
      response.setHeader("content-type", contentTypeForFile(filePath));
      if (method === "HEAD") {
        response.end();
      } else {
        response.end(file);
      }
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new AppError("NOT_FOUND", "Asset not found", 404);
      }
      throw error;
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
}
