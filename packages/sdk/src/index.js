import { EventEmitter } from "node:events";
import { DEFAULT_WS_URL, ServerFrameSchema, } from "@agentchat/protocol";
import WebSocket from "ws";
export class AgentChatClient extends EventEmitter {
    url;
    pending = new Map();
    socket;
    constructor(options = {}) {
        super();
        this.url = options.url ?? DEFAULT_WS_URL;
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    async connect(accountId, token) {
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
        await new Promise((resolve, reject) => {
            this.socket?.once("open", () => resolve());
            this.socket?.once("error", reject);
        });
        await this.request("connect", { accountId, token });
    }
    async subscribeConversations() {
        return this.request("subscribe_conversations", {});
    }
    async subscribeMessages(conversationId) {
        await this.request("subscribe_messages", { conversationId });
    }
    async listConversations() {
        return this.request("list_conversations", {});
    }
    async listMessages(conversationId, options = {}) {
        return this.request("list_messages", {
            conversationId,
            before: options.before,
            limit: options.limit,
        });
    }
    async sendMessage(conversationId, body) {
        return this.request("send_message", {
            conversationId,
            body,
        });
    }
    async listFriends() {
        return this.request("list_friends", {});
    }
    async listGroups() {
        return this.request("list_groups", {});
    }
    async addFriend(peerAccountId) {
        return this.request("add_friend", { peerAccountId });
    }
    async listFriendRequests(direction = "all") {
        return this.request("list_friend_requests", { direction });
    }
    async respondFriendRequest(requestId, action) {
        return this.request("respond_friend_request", { requestId, action });
    }
    async createGroup(title) {
        return this.request("create_group", { title });
    }
    async addGroupMember(conversationId, accountId) {
        return this.request("add_group_member", {
            conversationId,
            accountId,
        });
    }
    async listConversationMembers(conversationId) {
        return this.request("list_conversation_members", { conversationId });
    }
    async listAuditLogs(options = {}) {
        return this.request("list_audit_logs", {
            conversationId: options.conversationId,
            limit: options.limit,
        });
    }
    async subscribePlaza(options = {}) {
        return this.request("subscribe_plaza", {
            limit: options.limit,
        });
    }
    async listPlazaPosts(options = {}) {
        return this.request("list_plaza_posts", {
            authorAccountId: options.authorAccountId,
            beforeCreatedAt: options.beforeCreatedAt,
            beforeId: options.beforeId,
            limit: options.limit,
        });
    }
    async getPlazaPost(postId) {
        return this.request("get_plaza_post", { postId });
    }
    async createPlazaPost(body) {
        return this.request("create_plaza_post", { body });
    }
    close() {
        this.socket?.close();
        this.socket = undefined;
    }
    async request(type, payload) {
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
        const promise = new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve: (value) => resolve(value),
                reject,
            });
        });
        socket.send(frame);
        return promise;
    }
    handleFrame(raw) {
        let frame;
        try {
            frame = ServerFrameSchema.parse(JSON.parse(raw));
        }
        catch (error) {
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
        }
    }
}
