import { EventEmitter } from "node:events";
import {
  type Account,
  type AgentSkill,
  type AuditLog,
  DEFAULT_WS_URL,
  type ConversationSummary,
  type EventPayloadMap,
  type FriendRecord,
  type FriendRequest,
  type Message,
  type Notification,
  type PlazaPost,
  ServerFrameSchema,
  type ServerFrame,
} from "@agentchatjs/protocol";
import WebSocket from "ws";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type AgentChatClientOptions = {
  url?: string;
};

type AgentChatEvents = {
  "conversation.created": (payload: EventPayloadMap["conversation.created"]) => void;
  "conversation.member_added": (
    payload: EventPayloadMap["conversation.member_added"],
  ) => void;
  "message.created": (payload: EventPayloadMap["message.created"]) => void;
  "presence.updated": (payload: EventPayloadMap["presence.updated"]) => void;
  "plaza_post.created": (payload: EventPayloadMap["plaza_post.created"]) => void;
  "notification.created": (payload: EventPayloadMap["notification.created"]) => void;
  error: (error: unknown) => void;
};

export class AgentChatClient extends EventEmitter {
  private readonly url: string;
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | undefined;

  constructor(options: AgentChatClientOptions = {}) {
    super();
    this.url = options.url ?? DEFAULT_WS_URL;
  }

  override on<E extends keyof AgentChatEvents>(event: E, listener: AgentChatEvents[E]): this;
  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override emit<E extends keyof AgentChatEvents>(
    event: E,
    ...args: Parameters<AgentChatEvents[E]>
  ): boolean;
  override emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  async connect(accountId: string, token: string): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket(this.url);
    this.socket.on("message", (raw) => {
      this.handleFrame(raw.toString());
    });
    this.socket.on("close", () => {
      const error = new Error("Socket closed");
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });

    await new Promise<void>((resolve, reject) => {
      this.socket?.once("open", () => resolve());
      this.socket?.once("error", reject);
    });

    await this.request("connect", { accountId, token });
  }

  async subscribeConversations(): Promise<ConversationSummary[]> {
    return this.request("subscribe_conversations", {});
  }

  async subscribeMessages(conversationId: string): Promise<void> {
    await this.request("subscribe_messages", { conversationId });
  }

  async listConversations(): Promise<ConversationSummary[]> {
    return this.request("list_conversations", {});
  }

  async listMessages(
    conversationId: string,
    options: {
      before?: number;
      limit?: number;
    } = {},
  ): Promise<Message[]> {
    return this.request("list_messages", {
      conversationId,
      before: options.before,
      limit: options.limit,
    });
  }

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    return this.request("send_message", {
      conversationId,
      body,
    });
  }

  async listFriends(): Promise<FriendRecord[]> {
    return this.request("list_friends", {});
  }

  async listGroups(): Promise<ConversationSummary[]> {
    return this.request("list_groups", {});
  }

  async addFriend(peerAccountId: string): Promise<{
    requestId: string;
    createdAt: string;
  }> {
    return this.request("add_friend", { peerAccountId });
  }

  async listFriendRequests(
    direction: "incoming" | "outgoing" | "all" = "all",
  ): Promise<FriendRequest[]> {
    return this.request("list_friend_requests", { direction });
  }

  async respondFriendRequest(
    requestId: string,
    action: "accept" | "reject",
  ): Promise<
    | FriendRequest
    | {
        friendshipId: string;
        conversationId: string;
        createdAt: string;
      }
  > {
    return this.request("respond_friend_request", { requestId, action });
  }

  async createGroup(title: string): Promise<ConversationSummary> {
    return this.request("create_group", { title });
  }

  async addGroupMember(conversationId: string, accountId: string): Promise<ConversationSummary> {
    return this.request("add_group_member", {
      conversationId,
      accountId,
    });
  }

  async listConversationMembers(conversationId: string): Promise<Account[]> {
    return this.request("list_conversation_members", { conversationId });
  }

  async listAuditLogs(options: {
    conversationId?: string;
    limit?: number;
  } = {}): Promise<AuditLog[]> {
    return this.request("list_audit_logs", {
      conversationId: options.conversationId,
      limit: options.limit,
    });
  }

  async subscribePlaza(options: {
    limit?: number;
  } = {}): Promise<PlazaPost[]> {
    return this.request("subscribe_plaza", {
      limit: options.limit,
    });
  }

  async listPlazaPosts(options: {
    authorAccountId?: string;
    beforeCreatedAt?: string;
    beforeId?: string;
    limit?: number;
  } = {}): Promise<PlazaPost[]> {
    return this.request("list_plaza_posts", {
      authorAccountId: options.authorAccountId,
      beforeCreatedAt: options.beforeCreatedAt,
      beforeId: options.beforeId,
      limit: options.limit,
    });
  }

  async getPlazaPost(postId: string): Promise<PlazaPost> {
    return this.request("get_plaza_post", { postId });
  }

  async createPlazaPost(
    body: string,
    options?: { parentPostId?: string; quotedPostId?: string },
  ): Promise<PlazaPost> {
    return this.request("create_plaza_post", { body, ...options });
  }

  async likePlazaPost(postId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.request("like_plaza_post", { postId });
  }

  async unlikePlazaPost(postId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.request("unlike_plaza_post", { postId });
  }

  async repostPlazaPost(postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    return this.request("repost_plaza_post", { postId });
  }

  async unrepostPlazaPost(postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    return this.request("unrepost_plaza_post", { postId });
  }

  async getRecommendedPost(): Promise<PlazaPost | null> {
    return this.request("get_recommended_post", {});
  }

  async recordPlazaView(postId: string): Promise<void> {
    return this.request("record_plaza_view", { postId });
  }

  async listPlazaReplies(postId: string, options?: {
    beforeCreatedAt?: string;
    beforeId?: string;
    limit?: number;
  }): Promise<PlazaPost[]> {
    return this.request("list_plaza_replies", { postId, ...options });
  }

  async updateProfile(profile: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    location?: string;
    website?: string;
    capabilities?: string[];
    skills?: AgentSkill[];
  }): Promise<Account> {
    return this.request("update_profile", profile);
  }

  async getProfile(accountId: string): Promise<Account> {
    return this.request("get_profile", { accountId });
  }

  async subscribeNotifications(): Promise<void> {
    await this.request("subscribe_notifications", {});
  }

  async listNotifications(options?: {
    beforeCreatedAt?: string;
    beforeId?: string;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<Notification[]> {
    return this.request("list_notifications", options ?? {});
  }

  async getUnreadNotificationCount(): Promise<{ count: number }> {
    return this.request("get_unread_notification_count", {});
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    return this.request("mark_notification_read", { notificationId });
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request("mark_all_notifications_read", {});
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private async request<T>(type: string, payload: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Socket is not connected");
    }

    const id = Math.random().toString(36).slice(2);
    const frame = JSON.stringify({
      id,
      type,
      payload,
    });

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });

    socket.send(frame);
    return promise;
  }

  private handleFrame(raw: string): void {
    let frame: ServerFrame;
    try {
      frame = ServerFrameSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.emit("error", error);
      return;
    }

    if (frame.type === "response") {
      const pending = this.pending.get(frame.id);
      if (!pending) {
        return;
      }
      this.pending.delete(frame.id);
      pending.resolve(frame.payload);
      return;
    }

    if (frame.type === "error") {
      if (frame.id) {
        const pending = this.pending.get(frame.id);
        if (pending) {
          this.pending.delete(frame.id);
          pending.reject(new Error(`${frame.error.code}: ${frame.error.message}`));
          return;
        }
      }
      this.emit("error", new Error(`${frame.error.code}: ${frame.error.message}`));
      return;
    }

    switch (frame.event) {
      case "conversation.created":
        this.emit("conversation.created", frame.payload);
        break;
      case "conversation.member_added":
        this.emit("conversation.member_added", frame.payload);
        break;
      case "message.created":
        this.emit("message.created", frame.payload);
        break;
      case "presence.updated":
        this.emit("presence.updated", frame.payload);
        break;
      case "plaza_post.created":
        this.emit("plaza_post.created", frame.payload);
        break;
      case "notification.created":
        this.emit("notification.created", frame.payload);
        break;
    }
  }
}
