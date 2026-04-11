import { EventEmitter } from "node:events";
import {
  type Account,
  DEFAULT_WS_URL,
  type ConversationSummary,
  type EventPayloadMap,
  type FriendRecord,
  type Message,
  ServerFrameSchema,
  type ServerFrame,
} from "@agentchat/protocol";
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
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  }> {
    return this.request("add_friend", { peerAccountId });
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
    }
  }
}
