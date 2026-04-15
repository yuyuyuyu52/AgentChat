import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { URLSearchParams } from "node:url";
import { parse as parseUrl } from "node:url";
import {
  AgentSkillSchema,
  ClientRequestSchema,
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  makeErrorFrame,
  makeEvent,
  makeResponse,
  type Account,
  type AgentCard,
  type AuthAccount,
  type ConversationSummary,
  type Message,
  type Notification,
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
} from "./store.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embedding.js";
import { computeAgentScore, computeActivityRecency, computeProfileCompleteness } from "./recommendation.js";

type ConnectionState = {
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

const CreateAccountBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["agent", "admin"]).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

const UpdateProfileBodySchema = z.object({
  displayName: z.string().max(50).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(280).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  website: z.string().url().optional().nullable(),
  capabilities: z.array(z.string().max(50)).max(20).optional().nullable(),
  skills: z.array(AgentSkillSchema).max(50).optional().nullable(),
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

const CONTROL_PLANE_DIST_DIR = fileURLToPath(
  new URL("../../control-plane/dist/", import.meta.url),
);
const CONTROL_PLANE_ENTRY_FILE = resolve(CONTROL_PLANE_DIST_DIR, "index.html");

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

function buildAgentCard(account: Account, baseUrl: string): AgentCard {
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

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
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
  private readonly publicHttpUrl: string | undefined;
  private readonly publicWsUrl: string | undefined;
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
  private readonly adminLoginRateLimiter = new FailedAttemptRateLimiter(
    10,
    10 * 60 * 1_000,
    "admin login",
  );
  private readonly userLoginRateLimiter = new FailedAttemptRateLimiter(
    10,
    10 * 60 * 1_000,
    "login",
  );
  private readonly agentConnectRateLimiter = new FailedAttemptRateLimiter(
    15,
    10 * 60 * 1_000,
    "agent authentication",
  );
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
        void this.handleSocketMessage(state, data.toString());
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

  private getExternalHttpUrl(request?: IncomingMessage): string {
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

  private getExternalWsUrl(request?: IncomingMessage): string {
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

  async createAccount(input: CreateAccountInput): Promise<AuthAccount> {
    return this.store.createAccount(input);
  }

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

  async refreshAgentScores(): Promise<void> {
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

  private async generatePostEmbedding(postId: string, body: string): Promise<void> {
    const results = await this.embeddingProvider.embed([body]);
    const embedding = results[0];
    if (!embedding) return;
    await this.store.upsertPostEmbedding(postId, embedding, this.embeddingProvider.model);
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

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = parseUrl(request.url ?? "", true);
      const method = request.method ?? "GET";
      const isAdminAuthorized = await this.isAdminAuthorized(request);
      const userSession = await this.getUserSession(request);
      const lang = normalizeUiLang(typeof url.query.lang === "string" ? url.query.lang : undefined);

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

      if (method === "POST" && url.pathname === "/auth/login") {
        const isForm = request.headers["content-type"]?.includes("application/x-www-form-urlencoded");
        const body = isForm
          ? HumanLoginBodySchema.parse(await this.readForm(request))
          : HumanLoginBodySchema.parse(await readJson(request));
        const rateLimitKey = `user-login:${this.getClientAddress(request)}`;
        this.userLoginRateLimiter.assertAllowed(rateLimitKey);
        try {
          const user = await this.store.authenticateHumanUser(body.email, body.password);
          this.userLoginRateLimiter.clear(rateLimitKey);
          await this.startUserSession(
            request,
            response,
            {
              createdAt: Date.now(),
              subject: `local:${user.id}`,
              email: user.email,
              name: user.name,
              authProvider: "local",
            },
          );
        } catch (error) {
          const appError = error instanceof z.ZodError
            ? new AppError("INVALID_ARGUMENT", error.message)
            : asAppError(error);
          if (appError.statusCode === 401) {
            this.userLoginRateLimiter.recordFailure(rateLimitKey);
          }
          throw error;
        }
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
        await this.startUserSession(
          request,
          response,
          {
            createdAt: Date.now(),
            subject: `local:${user.id}`,
            email: user.email,
            name: user.name,
            authProvider: "local",
          },
        );
        if (isForm) {
          redirect(response, "/app");
          return;
        }
        jsonResponse(response, 201, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/auth/google/login") {
        this.ensureGoogleAuthConfigured();
        const state = await this.store.createOAuthState(10 * 60);
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
        if (!code || !state || !(await this.store.consumeOAuthState(state))) {
          throw new AppError("UNAUTHORIZED", "Invalid Google OAuth callback", 401);
        }
        const profile = await this.exchangeGoogleCodeForProfile(code);
        await this.startUserSession(
          request,
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
          await this.store.deleteUserSession(sessionId);
        }
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_user_session", "", {
            maxAge: 0,
            secure: this.shouldUseSecureCookies(request),
          }),
        );
        redirect(response, "/");
        return;
      }

      if (method === "GET" && url.pathname === "/admin/health") {
        jsonResponse(response, 200, {
          ok: true,
          httpUrl: this.getExternalHttpUrl(request),
          wsUrl: this.getExternalWsUrl(request),
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
        const rateLimitKey = `admin-login:${this.getClientAddress(request)}`;
        this.adminLoginRateLimiter.assertAllowed(rateLimitKey);
        let sessionId: string;
        try {
          this.assertAdminPassword(body.password);
          this.adminLoginRateLimiter.clear(rateLimitKey);
          sessionId = await this.store.createAdminSession(60 * 60 * 8);
        } catch (error) {
          const appError = error instanceof z.ZodError
            ? new AppError("INVALID_ARGUMENT", error.message)
            : asAppError(error);
          if (appError.statusCode === 401) {
            this.adminLoginRateLimiter.recordFailure(rateLimitKey);
          }
          throw error;
        }
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_admin_session", sessionId, {
            maxAge: 60 * 60 * 8,
            secure: this.shouldUseSecureCookies(request),
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
          await this.store.deleteAdminSession(sessionId);
        }
        response.setHeader(
          "set-cookie",
          this.makeSessionCookie("agentchat_admin_session", "", {
            maxAge: 0,
            secure: this.shouldUseSecureCookies(request),
          }),
        );
        if (request.headers.accept?.includes("text/html")) {
          redirect(response, "/admin/ui");
          return;
        }
        jsonResponse(response, 200, { ok: true });
        return;
      }

      const agentCardMatch = url.pathname?.match(/^\/agents\/([^/]+)\/card\.json$/);
      if (method === "GET" && agentCardMatch) {
        const accountId = agentCardMatch[1]!;
        let account: Account;
        try {
          account = await this.store.getAccountById(accountId);
        } catch {
          jsonResponse(response, 404, { error: "Agent not found" });
          return;
        }
        if (account.type !== "agent") {
          jsonResponse(response, 404, { error: "Agent not found" });
          return;
        }
        response.setHeader("access-control-allow-origin", "*");
        jsonResponse(response, 200, buildAgentCard(account, this.httpUrl));
        return;
      }

      if (method === "GET" && url.pathname === "/.well-known/agent.json") {
        const agents = await this.store.listAgentAccounts();
        response.setHeader("access-control-allow-origin", "*");
        jsonResponse(response, 200, {
          name: "AgentChat",
          description: "IM infrastructure for autonomous agents",
          url: this.httpUrl,
          agents: agents.map((agent) => {
            const profile = agent.profile as Record<string, unknown>;
            return {
              id: agent.id,
              name: (profile.displayName as string) || agent.name,
              url: `/agents/${agent.id}/card.json`,
              capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : undefined,
            };
          }),
        });
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/accounts") {
        const session = await this.requireUserSession(request);
        jsonResponse(response, 200, await this.listAccounts(session.subject));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/session") {
        if (!userSession) {
          throw new AppError("UNAUTHORIZED", "Login required", 401);
        }
        jsonResponse(response, 200, {
          subject: userSession.subject,
          email: userSession.email,
          name: userSession.name,
          authProvider: userSession.authProvider,
        });
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/conversations") {
        const session = await this.requireUserSession(request);
        jsonResponse(response, 200, await this.listOwnedConversations(session.subject));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/audit-logs") {
        const session = await this.requireUserSession(request);
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
        const session = await this.requireUserSession(request);
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
        const session = await this.requireUserSession(request);
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
        const session = await this.requireUserSession(request);
        jsonResponse(response, 200, await this.resetToken(appAccountTokenMatch[1]!, session.subject));
        return;
      }

      const appAccountProfileMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)\/profile$/);
      if (method === "PATCH" && appAccountProfileMatch) {
        const session = await this.requireUserSession(request);
        const body = UpdateProfileBodySchema.parse(await readJson(request));
        jsonResponse(
          response,
          200,
          await this.store.updateProfile(appAccountProfileMatch[1]!, body, session.subject),
        );
        return;
      }

      const appAccountDetailMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)$/);
      if (method === "GET" && appAccountDetailMatch) {
        await this.requireUserSession(request);
        jsonResponse(response, 200, await this.store.getAccountById(appAccountDetailMatch[1]!));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/plaza") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const tab = typeof url.query.tab === "string" ? url.query.tab : "latest";

        if (tab === "recommended") {
          const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
          const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.trunc(rawLimit), 100)
            : undefined;
          const rawOffset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
          const offset = rawOffset !== undefined && Number.isFinite(rawOffset) && rawOffset >= 0
            ? Math.trunc(rawOffset)
            : undefined;
          jsonResponse(
            response,
            200,
            await this.store.listRecommendedPosts({
              viewerAccountId: humanAccount.id,
              ...(limit ? { limit } : {}),
              ...(offset ? { offset } : {}),
            }),
          );
          return;
        }

        const authorAccountId =
          typeof url.query.authorAccountId === "string" ? url.query.authorAccountId : undefined;
        const beforeCreatedAt =
          typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
        const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;

        if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId)) {
          throw new AppError(
            "INVALID_ARGUMENT",
            "beforeCreatedAt and beforeId must be provided together",
          );
        }

        jsonResponse(
          response,
          200,
          await this.listPlazaPosts({
            viewerAccountId: humanAccount.id,
            ...(authorAccountId ? { authorAccountId } : {}),
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
            ...(beforeId ? { beforeId } : {}),
            ...(limit ? { limit } : {}),
          }),
        );
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/plaza/trending") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(Math.trunc(rawLimit), 100)
          : undefined;
        const rawOffset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
        const offset = rawOffset !== undefined && Number.isFinite(rawOffset) && rawOffset >= 0
          ? Math.trunc(rawOffset)
          : undefined;
        jsonResponse(
          response,
          200,
          await this.store.listTrendingPosts({
            viewerAccountId: humanAccount.id,
            ...(limit ? { limit } : {}),
            ...(offset ? { offset } : {}),
          }),
        );
        return;
      }

      const appPlazaPostMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)$/);
      if (method === "GET" && appPlazaPostMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        jsonResponse(response, 200, await this.getPlazaPost(appPlazaPostMatch[1]!, humanAccount.id));
        return;
      }

      const appPlazaPostReplyMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/reply$/);
      if (method === "POST" && appPlazaPostReplyMatch) {
        const session = await this.requireUserSession(request);
        const body = await readJson(request) as { body?: string };
        if (!body.body || typeof body.body !== "string") {
          throw new AppError("INVALID_ARGUMENT", "Reply body is required");
        }
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const reply = await this.createPlazaPost(humanAccount.id, body.body, {
          parentPostId: appPlazaPostReplyMatch[1]!,
        });
        jsonResponse(response, 200, reply);
        this.updateInterestVector(humanAccount.id).catch(() => {});
        return;
      }

      const appPlazaPostViewMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/view$/);
      if (method === "POST" && appPlazaPostViewMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        await this.store.recordPlazaView(humanAccount.id, appPlazaPostViewMatch[1]!);
        jsonResponse(response, 200, { ok: true });
        this.updateInterestVector(humanAccount.id).catch(() => {});
        return;
      }

      if (method === "POST" && url.pathname === "/app/api/plaza/views") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const body = await readJson(request) as { postIds: string[] };
        if (!Array.isArray(body.postIds) || body.postIds.length === 0) {
          throw new AppError("INVALID_ARGUMENT", "postIds must be a non-empty array");
        }
        const postIds = body.postIds.slice(0, 100);
        await this.store.recordPlazaViewBatch(humanAccount.id, postIds);
        jsonResponse(response, 200, { ok: true });
        this.updateInterestVector(humanAccount.id).catch(() => {});
        return;
      }

      const appPlazaPostLikeMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/like$/);
      if (method === "POST" && appPlazaPostLikeMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const postId = appPlazaPostLikeMatch[1]!;
        jsonResponse(response, 200, await this.store.likePlazaPost(humanAccount.id, postId));
        this.updateInterestVector(humanAccount.id).catch(() => {});
        this.store.getPlazaPostAuthorId(postId).then((authorId) => {
          this.createAndDispatchNotification({
            recipientAccountId: authorId,
            type: "plaza_post_liked",
            actorAccountId: humanAccount.id,
            subjectType: "plaza_post",
            subjectId: postId,
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      if (method === "DELETE" && appPlazaPostLikeMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        jsonResponse(response, 200, await this.store.unlikePlazaPost(humanAccount.id, appPlazaPostLikeMatch[1]!));
        this.updateInterestVector(humanAccount.id).catch(() => {});
        return;
      }

      const appPlazaPostRepostMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/repost$/);
      if (method === "POST" && appPlazaPostRepostMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const postId = appPlazaPostRepostMatch[1]!;
        jsonResponse(response, 200, await this.store.repostPlazaPost(humanAccount.id, postId));
        this.updateInterestVector(humanAccount.id).catch(() => {});
        this.store.getPlazaPostAuthorId(postId).then((authorId) => {
          this.createAndDispatchNotification({
            recipientAccountId: authorId,
            type: "plaza_post_reposted",
            actorAccountId: humanAccount.id,
            subjectType: "plaza_post",
            subjectId: postId,
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      if (method === "DELETE" && appPlazaPostRepostMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        jsonResponse(response, 200, await this.store.unrepostPlazaPost(humanAccount.id, appPlazaPostRepostMatch[1]!));
        this.updateInterestVector(humanAccount.id).catch(() => {});
        return;
      }

      const appPlazaPostRepliesMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/replies$/);
      if (method === "GET" && appPlazaPostRepliesMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const beforeCreatedAt = typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
        const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        jsonResponse(
          response,
          200,
          await this.store.listPlazaReplies(appPlazaPostRepliesMatch[1]!, {
            viewerAccountId: humanAccount.id,
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
            ...(beforeId ? { beforeId } : {}),
            ...(limit ? { limit } : {}),
          }),
        );
        return;
      }

      // ── Notification HTTP endpoints ───────────────────────────
      if (method === "GET" && url.pathname === "/app/api/notifications") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const beforeCreatedAt = typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
        const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
        const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(Math.trunc(rawLimit), 100) : undefined;
        const unreadOnly = url.query.unreadOnly === "true";
        jsonResponse(response, 200, await this.store.listNotificationsForOwner(
          session.subject, humanAccount.id, {
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
            ...(beforeId ? { beforeId } : {}),
            ...(limit ? { limit } : {}),
            ...(unreadOnly ? { unreadOnly } : {}),
          },
        ));
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/notifications/unread-count") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        jsonResponse(response, 200, {
          count: await this.store.getUnreadNotificationCountForOwner(session.subject, humanAccount.id),
        });
        return;
      }

      const appNotificationReadMatch = url.pathname?.match(/^\/app\/api\/notifications\/([^/]+)\/read$/);
      if (method === "POST" && appNotificationReadMatch) {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        await this.store.markNotificationReadForOwner(session.subject, humanAccount.id, appNotificationReadMatch[1]!);
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && url.pathname === "/app/api/notifications/read-all") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        await this.store.markAllNotificationsReadForOwner(session.subject, humanAccount.id);
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/app/api/agents/recommended") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(Math.trunc(rawLimit), 50)
          : 8;

        const friends = await this.store.listFriends(humanAccount.id);
        const friendIds = friends.map((f) => f.account.id);

        const topAgents = await this.store.listTopAgents({
          limit,
          excludeAccountIds: [humanAccount.id, ...friendIds],
        });

        const enriched = await Promise.all(
          topAgents.map(async (agent) => {
            try {
              const account = await this.store.getAccountById(agent.accountId);
              return {
                account,
                score: agent.score,
                engagementRate: agent.engagementRate,
                activityRecency: agent.activityRecency,
              };
            } catch {
              return null;
            }
          }),
        );

        jsonResponse(response, 200, enriched.filter(Boolean));
        return;
      }

      await this.requireAdminAuthorization(request);

      if (method === "POST" && url.pathname === "/admin/init") {
        jsonResponse(response, 200, {
          ok: true,
          databasePath: this.store.databasePath,
          httpUrl: this.getExternalHttpUrl(request),
          wsUrl: this.getExternalWsUrl(request),
        });
        return;
      }

      if (method === "GET" && url.pathname === "/admin/accounts") {
        jsonResponse(response, 200, await this.listAccounts());
        return;
      }

      if (method === "GET" && url.pathname === "/admin/audit-logs") {
        const accountId =
          typeof url.query.accountId === "string" ? url.query.accountId : undefined;
        const conversationId =
          typeof url.query.conversationId === "string" ? url.query.conversationId : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        jsonResponse(
          response,
          200,
          await this.listAuditLogs({
            ...(accountId ? { accountId } : {}),
            ...(conversationId ? { conversationId } : {}),
            ...(limit ? { limit } : {}),
          }),
        );
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
          const rateLimitKey = `agent-connect:${connection.clientAddress}`;
          this.agentConnectRateLimiter.assertAllowed(rateLimitKey);
          try {
            const account = await this.store.authenticateAccount(
              request.payload.accountId,
              request.payload.token,
            );
            this.agentConnectRateLimiter.clear(rateLimitKey);
            connection.accountId = account.id;
            connection.sessionId = randomUUID();
            await this.registerConnection(connection);
            this.sendResponse(connection, request.id, {
              account,
            });
            return;
          } catch (error) {
            const appError = error instanceof z.ZodError
              ? new AppError("INVALID_ARGUMENT", error.message)
              : asAppError(error);
            if (appError.statusCode === 401) {
              this.agentConnectRateLimiter.recordFailure(rateLimitKey);
            }
            throw error;
          }
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
        case "subscribe_plaza": {
          const accountId = this.requireAuthenticated(connection);
          connection.subscribedPlazaFeed = true;
          this.sendResponse(
            connection,
            request.id,
            await this.listPlazaPosts({
              viewerAccountId: accountId,
              ...(request.payload?.limit ? { limit: request.payload.limit } : {}),
            }),
          );
          return;
        }
        case "list_plaza_posts": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.listPlazaPosts({
              viewerAccountId: accountId,
              ...(request.payload.authorAccountId
                ? { authorAccountId: request.payload.authorAccountId }
                : {}),
              ...(request.payload.beforeCreatedAt
                ? { beforeCreatedAt: request.payload.beforeCreatedAt }
                : {}),
              ...(request.payload.beforeId ? { beforeId: request.payload.beforeId } : {}),
              ...(request.payload.limit ? { limit: request.payload.limit } : {}),
            }),
          );
          return;
        }
        case "get_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.getPlazaPost(request.payload.postId, accountId));
          return;
        }
        case "create_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.createPlazaPost(accountId, request.payload.body, {
              ...(request.payload.parentPostId ? { parentPostId: request.payload.parentPostId } : {}),
              ...(request.payload.quotedPostId ? { quotedPostId: request.payload.quotedPostId } : {}),
            }),
          );
          return;
        }
        case "like_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          const likeResult = await this.store.likePlazaPost(accountId, request.payload.postId);
          this.sendResponse(connection, request.id, likeResult);
          this.store.getPlazaPostAuthorId(request.payload.postId).then((authorId) => {
            this.createAndDispatchNotification({
              recipientAccountId: authorId,
              type: "plaza_post_liked",
              actorAccountId: accountId,
              subjectType: "plaza_post",
              subjectId: request.payload.postId,
            }).catch(() => {});
          }).catch(() => {});
          return;
        }
        case "unlike_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.store.unlikePlazaPost(accountId, request.payload.postId));
          return;
        }
        case "repost_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          const repostResult = await this.store.repostPlazaPost(accountId, request.payload.postId);
          this.sendResponse(connection, request.id, repostResult);
          this.store.getPlazaPostAuthorId(request.payload.postId).then((authorId) => {
            this.createAndDispatchNotification({
              recipientAccountId: authorId,
              type: "plaza_post_reposted",
              actorAccountId: accountId,
              subjectType: "plaza_post",
              subjectId: request.payload.postId,
            }).catch(() => {});
          }).catch(() => {});
          return;
        }
        case "unrepost_plaza_post": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, await this.store.unrepostPlazaPost(accountId, request.payload.postId));
          return;
        }
        case "record_plaza_view": {
          const accountId = this.requireAuthenticated(connection);
          await this.store.recordPlazaView(accountId, request.payload.postId);
          this.sendResponse(connection, request.id, { ok: true });
          return;
        }
        case "list_plaza_replies": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.store.listPlazaReplies(request.payload.postId, {
              viewerAccountId: accountId,
              ...(request.payload.beforeCreatedAt ? { beforeCreatedAt: request.payload.beforeCreatedAt } : {}),
              ...(request.payload.beforeId ? { beforeId: request.payload.beforeId } : {}),
              ...(request.payload.limit ? { limit: request.payload.limit } : {}),
            }),
          );
          return;
        }
        case "update_profile": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.store.updateProfile(accountId, request.payload),
          );
          return;
        }
        case "get_profile": {
          this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            await this.store.getAccountById(request.payload.accountId),
          );
          return;
        }
        case "subscribe_notifications": {
          this.requireAuthenticated(connection);
          connection.subscribedNotifications = true;
          this.sendResponse(connection, request.id, {});
          return;
        }
        case "list_notifications": {
          const accountId = this.requireAuthenticated(connection);
          const payload = request.payload ?? {};
          this.sendResponse(
            connection,
            request.id,
            await this.store.listNotifications(accountId, {
              ...(payload.beforeCreatedAt ? { beforeCreatedAt: payload.beforeCreatedAt } : {}),
              ...(payload.beforeId ? { beforeId: payload.beforeId } : {}),
              ...(payload.limit ? { limit: payload.limit } : {}),
              ...(payload.unreadOnly ? { unreadOnly: payload.unreadOnly } : {}),
            }),
          );
          return;
        }
        case "get_unread_notification_count": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, {
            count: await this.store.getUnreadNotificationCount(accountId),
          });
          return;
        }
        case "mark_notification_read": {
          const accountId = this.requireAuthenticated(connection);
          await this.store.markNotificationRead(accountId, request.payload.notificationId);
          this.sendResponse(connection, request.id, {});
          return;
        }
        case "mark_all_notifications_read": {
          const accountId = this.requireAuthenticated(connection);
          await this.store.markAllNotificationsRead(accountId);
          this.sendResponse(connection, request.id, {});
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

  private sendResponse(connection: ConnectionState, requestId: string, payload: unknown): void {
    connection.socket.send(JSON.stringify(makeResponse(requestId, payload)));
  }

  private async createAndDispatchNotification(input: {
    recipientAccountId: string;
    type: NotificationType;
    actorAccountId?: string;
    subjectType: string;
    subjectId: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    // Don't notify yourself
    if (input.actorAccountId && input.actorAccountId === input.recipientAccountId) return;

    const notification = await this.store.createNotification(input);
    if (!notification) return; // dedup: already exists

    this.dispatchEventToAccount(
      input.recipientAccountId,
      makeEvent("notification.created", notification),
      (conn) => conn.subscribedNotifications,
    );
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

  private requireAuthenticated(connection: ConnectionState): string {
    if (!connection.accountId) {
      throw new AppError("UNAUTHORIZED", "Must connect before calling this method", 401);
    }
    return connection.accountId;
  }

  private async requireAdminAuthorization(request: IncomingMessage): Promise<void> {
    if (!(await this.isAdminAuthorized(request))) {
      throw new AppError("UNAUTHORIZED", "Admin authorization required", 401);
    }
  }

  private async requireUserSession(request: IncomingMessage): Promise<UserSession> {
    const session = await this.getUserSession(request);
    if (!session) {
      throw new AppError("UNAUTHORIZED", "Login required", 401);
    }
    return session;
  }

  private async isAdminAuthorized(request: IncomingMessage): Promise<boolean> {
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

  private async getUserSession(request: IncomingMessage): Promise<UserSession | undefined> {
    const sessionId = this.getCookie(request, "agentchat_user_session");
    if (!sessionId) {
      return undefined;
    }
    return this.store.getUserSession(sessionId);
  }

  private async startUserSession(
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

  private shouldUseSecureCookies(request: IncomingMessage): boolean {
    if (this.publicHttpUrl) {
      return new URL(this.publicHttpUrl).protocol === "https:";
    }

    const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"]);
    if (forwardedProto) {
      return forwardedProto === "https";
    }

    return "encrypted" in request.socket && Boolean(request.socket.encrypted);
  }

  private getClientAddress(request: IncomingMessage): string {
    const forwardedFor = firstHeaderValue(request.headers["x-forwarded-for"]);
    return forwardedFor ?? request.socket.remoteAddress ?? "unknown";
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
