import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
import { AppError, asAppError } from "./errors.js";
import { AgentChatStore, type CreateAccountInput, type SendMessageInput } from "./store.js";

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
  private readonly httpServer;
  private readonly wsServer: WebSocketServer;
  private readonly connections = new Map<WebSocket, ConnectionState>();
  private readonly accountConnections = new Map<string, Set<ConnectionState>>();
  private actualPort = 0;

  constructor(options: AgentChatServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 43110;
    this.store = new AgentChatStore(
      options.databasePath ?? new URL("../../data/agentchat.sqlite", import.meta.url).pathname,
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
        this.handleSocketClose(state);
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

    this.store.close();
  }

  createAccount(input: CreateAccountInput): AuthAccount {
    return this.store.createAccount(input);
  }

  listAccounts(): Account[] {
    return this.store.listAccounts();
  }

  resetToken(accountId: string): { accountId: string; token: string } {
    return this.store.resetToken(accountId);
  }

  createFriendship(accountA: string, accountB: string): {
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  } {
    const result = this.store.createFriendship(accountA, accountB);
    this.broadcastConversationCreated(accountA, result.conversationId);
    this.broadcastConversationCreated(accountB, result.conversationId);
    return result;
  }

  createGroup(title: string): ConversationSummary {
    return this.store.createGroup(title);
  }

  addGroupMember(conversationId: string, accountId: string): ConversationSummary {
    const summary = this.store.addGroupMember(conversationId, accountId);
    this.broadcastConversationCreated(accountId, conversationId);
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

  sendAdminMessage(input: SendMessageInput): {
    conversation: ConversationSummary;
    message: Message;
  } {
    const result = this.store.sendMessage(input);
    this.broadcastMessage(result.message);
    return result;
  }

  listConversations(accountId: string): ConversationSummary[] {
    return this.store.listConversations(accountId);
  }

  listConversationMessages(
    accountId: string,
    conversationId: string,
    before?: number,
    limit?: number,
  ): Message[] {
    return this.store.listMessages(accountId, conversationId, before, limit);
  }

  listFriends(accountId: string) {
    return this.store.listFriends(accountId);
  }

  listGroups(accountId: string) {
    return this.store.listGroups(accountId);
  }

  private async handleHttpRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = parseUrl(request.url ?? "", true);
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/admin/health") {
        jsonResponse(response, 200, {
          ok: true,
          httpUrl: this.httpUrl || DEFAULT_HTTP_URL,
          wsUrl: this.wsUrl || DEFAULT_WS_URL,
          databasePath: this.store.databasePath,
        });
        return;
      }

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
        jsonResponse(response, 200, this.listAccounts());
        return;
      }

      if (method === "POST" && url.pathname === "/admin/accounts") {
        const body = CreateAccountBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, this.createAccount(body));
        return;
      }

      const accountTokenMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/reset-token$/);
      if (method === "POST" && accountTokenMatch) {
        jsonResponse(response, 200, this.resetToken(accountTokenMatch[1]!));
        return;
      }

      const friendsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/friends$/);
      if (method === "GET" && friendsMatch) {
        jsonResponse(response, 200, this.listFriends(friendsMatch[1]!));
        return;
      }

      const groupsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/groups$/);
      if (method === "GET" && groupsMatch) {
        jsonResponse(response, 200, this.listGroups(groupsMatch[1]!));
        return;
      }

      const conversationsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/conversations$/);
      if (method === "GET" && conversationsMatch) {
        jsonResponse(response, 200, this.listConversations(conversationsMatch[1]!));
        return;
      }

      if (method === "POST" && url.pathname === "/admin/friendships") {
        const body = CreateFriendshipBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, this.createFriendship(body.accountA, body.accountB));
        return;
      }

      if (method === "POST" && url.pathname === "/admin/groups") {
        const body = CreateGroupBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, this.createGroup(body.title));
        return;
      }

      const groupMemberMatch = url.pathname?.match(/^\/admin\/groups\/([^/]+)\/members$/);
      if (method === "POST" && groupMemberMatch) {
        const body = AddGroupMemberBodySchema.parse(await readJson(request));
        jsonResponse(response, 201, this.addGroupMember(groupMemberMatch[1]!, body.accountId));
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
        jsonResponse(response, 201, this.sendAdminMessage(body as SendMessageInput));
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
          this.listConversationMessages(accountId, messageMatch[1]!, before, limit),
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
          const account = this.store.authenticateAccount(
            request.payload.accountId,
            request.payload.token,
          );
          connection.accountId = account.id;
          connection.sessionId = randomUUID();
          this.registerConnection(connection);
          this.sendResponse(connection, request.id, {
            account,
          });
          return;
        }
        case "subscribe_conversations": {
          const accountId = this.requireAuthenticated(connection);
          connection.subscribedConversationFeed = true;
          this.sendResponse(connection, request.id, this.store.listConversations(accountId));
          return;
        }
        case "subscribe_messages": {
          const accountId = this.requireAuthenticated(connection);
          this.store.listMessages(accountId, request.payload.conversationId, undefined, 1);
          connection.subscribedConversationIds.add(request.payload.conversationId);
          this.sendResponse(connection, request.id, {
            conversationId: request.payload.conversationId,
          });
          return;
        }
        case "list_conversations": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, this.store.listConversations(accountId));
          return;
        }
        case "list_messages": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(
            connection,
            request.id,
            this.store.listMessages(
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
          const result = this.store.sendMessage({
            senderId: accountId,
            conversationId: request.payload.conversationId,
            body: request.payload.body,
          });
          this.broadcastMessage(result.message);
          this.sendResponse(connection, request.id, result.message);
          return;
        }
        case "list_friends": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, this.store.listFriends(accountId));
          return;
        }
        case "list_groups": {
          const accountId = this.requireAuthenticated(connection);
          this.sendResponse(connection, request.id, this.store.listGroups(accountId));
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

  private handleSocketClose(connection: ConnectionState): void {
    this.connections.delete(connection.socket);
    if (!connection.accountId || !connection.sessionId) {
      return;
    }

    this.store.markSessionStatus(connection.sessionId, connection.accountId, "offline");
    const peers = this.accountConnections.get(connection.accountId);
    if (peers) {
      peers.delete(connection);
      if (peers.size === 0) {
        this.accountConnections.delete(connection.accountId);
        this.broadcastPresence(connection.accountId, "offline");
      }
    }
  }

  private registerConnection(connection: ConnectionState): void {
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
    this.store.markSessionStatus(sessionId, accountId, "online");
    if (wasOffline) {
      this.broadcastPresence(accountId, "online");
    }
  }

  private broadcastPresence(accountId: string, status: "online" | "offline"): void {
    const watcherIds = this.store.getConversationWatcherIds(accountId);
    const event = makeEvent("presence.updated", { accountId, status });
    for (const watcherId of watcherIds) {
      this.dispatchEventToAccount(
        watcherId,
        event,
        (connection) => connection.subscribedConversationFeed,
      );
    }
  }

  private broadcastConversationCreated(accountId: string, conversationId: string): void {
    const summary = this.store.getConversationSummaryForAccount(accountId, conversationId);
    this.dispatchEventToAccount(
      accountId,
      makeEvent("conversation.created", summary),
      (connection) => connection.subscribedConversationFeed,
    );
  }

  private broadcastMessage(message: Message): void {
    const memberIds = this.store.getConversationMemberIds(message.conversationId);
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
}
