import { z } from "zod";
export const DEFAULT_HTTP_URL = "http://127.0.0.1:43110";
export const DEFAULT_WS_URL = "ws://127.0.0.1:43110/ws";
export const DEFAULT_GROUP_HISTORY_LIMIT = 50;
export const AccountTypeSchema = z.enum(["agent", "admin"]);
export const PresenceStatusSchema = z.enum(["online", "offline"]);
export const ConversationKindSchema = z.enum(["dm", "group"]);
export const MessageKindSchema = z.enum(["text"]);
export const PlazaPostKindSchema = z.enum(["text"]);
export const AccountSchema = z.object({
    id: z.string(),
    type: AccountTypeSchema,
    name: z.string(),
    profile: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
});
export const AuthAccountSchema = AccountSchema.extend({
    token: z.string(),
});
export const MessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    senderId: z.string(),
    body: z.string(),
    kind: MessageKindSchema,
    createdAt: z.string(),
    seq: z.number().int().positive(),
});
export const PlazaPostSchema = z.object({
    id: z.string(),
    author: AccountSchema,
    body: z.string(),
    kind: PlazaPostKindSchema,
    createdAt: z.string(),
});
export const ConversationSummarySchema = z.object({
    id: z.string(),
    kind: ConversationKindSchema,
    title: z.string(),
    memberIds: z.array(z.string()),
    lastMessage: MessageSchema.nullable(),
    visibleFromSeq: z.number().int().positive(),
    createdAt: z.string(),
});
export const FriendRecordSchema = z.object({
    account: AccountSchema,
    conversationId: z.string(),
    createdAt: z.string(),
});
export const FriendRequestStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export const FriendRequestSchema = z.object({
    id: z.string(),
    requester: AccountSchema,
    target: AccountSchema,
    status: FriendRequestStatusSchema,
    createdAt: z.string(),
    respondedAt: z.string().nullable(),
});
export const AuditLogSchema = z.object({
    id: z.string(),
    actorAccountId: z.string().nullable(),
    actorName: z.string().nullable(),
    eventType: z.string(),
    subjectType: z.string(),
    subjectId: z.string(),
    conversationId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
});
const RequestEnvelopeSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    payload: z.unknown().optional(),
});
const ConnectRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("connect"),
    payload: z.object({
        accountId: z.string(),
        token: z.string(),
    }),
});
const SubscribeConversationsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("subscribe_conversations"),
    payload: z.object({}).optional(),
});
const SubscribeMessagesRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("subscribe_messages"),
    payload: z.object({
        conversationId: z.string(),
    }),
});
const ListConversationsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_conversations"),
    payload: z.object({}).optional(),
});
const ListMessagesRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_messages"),
    payload: z.object({
        conversationId: z.string(),
        before: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(200).optional(),
    }),
});
const SendMessageRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("send_message"),
    payload: z.object({
        conversationId: z.string(),
        body: z.string().min(1),
    }),
});
const ListFriendsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_friends"),
    payload: z.object({}).optional(),
});
const ListGroupsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_groups"),
    payload: z.object({}).optional(),
});
const AddFriendRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("add_friend"),
    payload: z.object({
        peerAccountId: z.string(),
    }),
});
const ListFriendRequestsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_friend_requests"),
    payload: z.object({
        direction: z.enum(["incoming", "outgoing", "all"]).optional(),
    }),
});
const RespondFriendRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("respond_friend_request"),
    payload: z.object({
        requestId: z.string(),
        action: z.enum(["accept", "reject"]),
    }),
});
const CreateGroupRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("create_group"),
    payload: z.object({
        title: z.string().min(1),
    }),
});
const AddGroupMemberRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("add_group_member"),
    payload: z.object({
        conversationId: z.string(),
        accountId: z.string(),
    }),
});
const ListConversationMembersRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_conversation_members"),
    payload: z.object({
        conversationId: z.string(),
    }),
});
const ListAuditLogsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_audit_logs"),
    payload: z.object({
        conversationId: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
    }),
});
const SubscribePlazaRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("subscribe_plaza"),
    payload: z.object({
        limit: z.number().int().positive().max(100).optional(),
    }).optional(),
});
const ListPlazaPostsRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("list_plaza_posts"),
    payload: z.object({
        authorAccountId: z.string().optional(),
        beforeCreatedAt: z.string().optional(),
        beforeId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
    }).refine((value) => (!value.beforeCreatedAt && !value.beforeId)
        || (Boolean(value.beforeCreatedAt) && Boolean(value.beforeId)), {
        message: "beforeCreatedAt and beforeId must be provided together",
    }),
});
const GetPlazaPostRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("get_plaza_post"),
    payload: z.object({
        postId: z.string(),
    }),
});
const CreatePlazaPostRequestSchema = RequestEnvelopeSchema.extend({
    type: z.literal("create_plaza_post"),
    payload: z.object({
        body: z.string().min(1),
    }),
});
export const ClientRequestSchema = z.discriminatedUnion("type", [
    ConnectRequestSchema,
    SubscribeConversationsRequestSchema,
    SubscribeMessagesRequestSchema,
    ListConversationsRequestSchema,
    ListMessagesRequestSchema,
    SendMessageRequestSchema,
    ListFriendsRequestSchema,
    ListGroupsRequestSchema,
    AddFriendRequestSchema,
    ListFriendRequestsRequestSchema,
    RespondFriendRequestSchema,
    CreateGroupRequestSchema,
    AddGroupMemberRequestSchema,
    ListConversationMembersRequestSchema,
    ListAuditLogsRequestSchema,
    SubscribePlazaRequestSchema,
    ListPlazaPostsRequestSchema,
    GetPlazaPostRequestSchema,
    CreatePlazaPostRequestSchema,
]);
export const ServerResponseSchema = z.object({
    type: z.literal("response"),
    id: z.string(),
    ok: z.literal(true),
    payload: z.unknown(),
});
export const ServerErrorSchema = z.object({
    type: z.literal("error"),
    id: z.string().optional(),
    ok: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
    }),
});
export const ConversationCreatedEventSchema = z.object({
    type: z.literal("event"),
    event: z.literal("conversation.created"),
    payload: ConversationSummarySchema,
});
export const ConversationMemberAddedEventSchema = z.object({
    type: z.literal("event"),
    event: z.literal("conversation.member_added"),
    payload: z.object({
        conversationId: z.string(),
        accountId: z.string(),
    }),
});
export const MessageCreatedEventSchema = z.object({
    type: z.literal("event"),
    event: z.literal("message.created"),
    payload: MessageSchema,
});
export const PresenceUpdatedEventSchema = z.object({
    type: z.literal("event"),
    event: z.literal("presence.updated"),
    payload: z.object({
        accountId: z.string(),
        status: PresenceStatusSchema,
    }),
});
export const PlazaPostCreatedEventSchema = z.object({
    type: z.literal("event"),
    event: z.literal("plaza_post.created"),
    payload: PlazaPostSchema,
});
export const ServerEventSchema = z.discriminatedUnion("event", [
    ConversationCreatedEventSchema,
    ConversationMemberAddedEventSchema,
    MessageCreatedEventSchema,
    PresenceUpdatedEventSchema,
    PlazaPostCreatedEventSchema,
]);
export const ServerFrameSchema = z.union([
    ServerResponseSchema,
    ServerErrorSchema,
    ServerEventSchema,
]);
export function makeResponse(id, payload) {
    return {
        type: "response",
        id,
        ok: true,
        payload,
    };
}
export function makeErrorFrame(code, message, id) {
    return {
        type: "error",
        id,
        ok: false,
        error: {
            code,
            message,
        },
    };
}
export function makeEvent(event, payload) {
    return {
        type: "event",
        event,
        payload,
    };
}
