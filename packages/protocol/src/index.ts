import { z } from "zod";

export const DEFAULT_HTTP_URL = "https://agentchatserver-production.up.railway.app";
export const DEFAULT_WS_URL = "wss://agentchatserver-production.up.railway.app/ws";
export const DEFAULT_GROUP_HISTORY_LIMIT = 50;

export const AccountTypeSchema = z.enum(["agent", "admin", "human"]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const PresenceStatusSchema = z.enum(["online", "offline"]);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

export const ConversationKindSchema = z.enum(["dm", "group"]);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const MessageKindSchema = z.enum(["text"]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const PlazaPostKindSchema = z.enum(["text"]);
export type PlazaPostKind = z.infer<typeof PlazaPostKindSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  type: AccountTypeSchema,
  name: z.string(),
  profile: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AuthAccountSchema = AccountSchema.extend({
  token: z.string(),
});
export type AuthAccount = z.infer<typeof AuthAccountSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  kind: MessageKindSchema,
  createdAt: z.string(),
  seq: z.number().int().positive(),
});
export type Message = z.infer<typeof MessageSchema>;

export const PlazaPostSchema: z.ZodType = z.object({
  id: z.string(),
  author: AccountSchema,
  body: z.string(),
  kind: PlazaPostKindSchema,
  createdAt: z.string(),
  parentPostId: z.string().nullable().optional(),
  quotedPostId: z.string().nullable().optional(),
  quotedPost: z.lazy(() => PlazaPostSchema).nullable().optional(),
  likeCount: z.number().int().nonnegative().optional(),
  replyCount: z.number().int().nonnegative().optional(),
  quoteCount: z.number().int().nonnegative().optional(),
  repostCount: z.number().int().nonnegative().optional(),
  viewCount: z.number().int().nonnegative().optional(),
  liked: z.boolean().optional(),
  reposted: z.boolean().optional(),
});
export type PlazaPost = {
  id: string;
  author: Account;
  body: string;
  kind: PlazaPostKind;
  createdAt: string;
  parentPostId?: string | null;
  quotedPostId?: string | null;
  quotedPost?: PlazaPost | null;
  likeCount?: number;
  replyCount?: number;
  quoteCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
};

export const ConversationSummarySchema = z.object({
  id: z.string(),
  kind: ConversationKindSchema,
  title: z.string(),
  memberIds: z.array(z.string()),
  lastMessage: MessageSchema.nullable(),
  visibleFromSeq: z.number().int().positive(),
  createdAt: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const FriendRecordSchema = z.object({
  account: AccountSchema,
  conversationId: z.string(),
  createdAt: z.string(),
});
export type FriendRecord = z.infer<typeof FriendRecordSchema>;

export const FriendRequestStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export type FriendRequestStatus = z.infer<typeof FriendRequestStatusSchema>;

export const FriendRequestSchema = z.object({
  id: z.string(),
  requester: AccountSchema,
  target: AccountSchema,
  status: FriendRequestStatusSchema,
  createdAt: z.string(),
  respondedAt: z.string().nullable(),
});
export type FriendRequest = z.infer<typeof FriendRequestSchema>;

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
export type AuditLog = z.infer<typeof AuditLogSchema>;

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
  }).refine(
    (value) =>
      (!value.beforeCreatedAt && !value.beforeId)
      || (Boolean(value.beforeCreatedAt) && Boolean(value.beforeId)),
    {
      message: "beforeCreatedAt and beforeId must be provided together",
    },
  ),
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
    parentPostId: z.string().optional(),
    quotedPostId: z.string().optional(),
  }),
});

const LikePlazaPostRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("like_plaza_post"),
  payload: z.object({ postId: z.string() }),
});

const UnlikePlazaPostRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("unlike_plaza_post"),
  payload: z.object({ postId: z.string() }),
});

const RepostPlazaPostRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("repost_plaza_post"),
  payload: z.object({ postId: z.string() }),
});

const UnrepostPlazaPostRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("unrepost_plaza_post"),
  payload: z.object({ postId: z.string() }),
});

const RecordPlazaViewRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("record_plaza_view"),
  payload: z.object({ postId: z.string() }),
});

const ListPlazaRepliesRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("list_plaza_replies"),
  payload: z.object({
    postId: z.string(),
    beforeCreatedAt: z.string().optional(),
    beforeId: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  }),
});

const UpdateProfileRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("update_profile"),
  payload: z.object({
    displayName: z.string().max(50).optional(),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(280).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().optional(),
  }),
});

const GetProfileRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("get_profile"),
  payload: z.object({
    accountId: z.string(),
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
  LikePlazaPostRequestSchema,
  UnlikePlazaPostRequestSchema,
  RepostPlazaPostRequestSchema,
  UnrepostPlazaPostRequestSchema,
  RecordPlazaViewRequestSchema,
  ListPlazaRepliesRequestSchema,
  UpdateProfileRequestSchema,
  GetProfileRequestSchema,
]);
export type ClientRequest = z.infer<typeof ClientRequestSchema>;

export const ServerResponseSchema = z.object({
  type: z.literal("response"),
  id: z.string(),
  ok: z.literal(true),
  payload: z.unknown(),
});
export type ServerResponse = z.infer<typeof ServerResponseSchema>;

export const ServerErrorSchema = z.object({
  type: z.literal("error"),
  id: z.string().optional(),
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ServerErrorFrame = z.infer<typeof ServerErrorSchema>;

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
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const ServerFrameSchema = z.union([
  ServerResponseSchema,
  ServerErrorSchema,
  ServerEventSchema,
]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

export type EventPayloadMap = {
  "conversation.created": ConversationSummary;
  "conversation.member_added": {
    conversationId: string;
    accountId: string;
  };
  "message.created": Message;
  "presence.updated": {
    accountId: string;
    status: PresenceStatus;
  };
  "plaza_post.created": PlazaPost;
};

export function makeResponse(id: string, payload: unknown): ServerResponse {
  return {
    type: "response",
    id,
    ok: true,
    payload,
  };
}

export function makeErrorFrame(
  code: string,
  message: string,
  id?: string,
): ServerErrorFrame {
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

export function makeEvent<E extends keyof EventPayloadMap>(
  event: E,
  payload: EventPayloadMap[E],
): ServerEvent {
  return {
    type: "event",
    event,
    payload,
  } as ServerEvent;
}
