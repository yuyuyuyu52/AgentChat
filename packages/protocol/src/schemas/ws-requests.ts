import { z } from "zod";
import { AgentSkillSchema } from "./account.js";

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
    capabilities: z.array(z.string().max(50)).max(20).optional(),
    skills: z.array(AgentSkillSchema).max(50).optional(),
  }),
});

const GetProfileRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("get_profile"),
  payload: z.object({
    accountId: z.string(),
  }),
});

const SubscribeNotificationsRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("subscribe_notifications"),
  payload: z.object({}).optional(),
});

const ListNotificationsRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("list_notifications"),
  payload: z.object({
    beforeCreatedAt: z.string().optional(),
    beforeId: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    unreadOnly: z.boolean().optional(),
  }).optional(),
});

const GetUnreadNotificationCountRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("get_unread_notification_count"),
  payload: z.object({}).optional(),
});

const MarkNotificationReadRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("mark_notification_read"),
  payload: z.object({
    notificationId: z.string(),
  }),
});

const MarkAllNotificationsReadRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("mark_all_notifications_read"),
  payload: z.object({}).optional(),
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
  SubscribeNotificationsRequestSchema,
  ListNotificationsRequestSchema,
  GetUnreadNotificationCountRequestSchema,
  MarkNotificationReadRequestSchema,
  MarkAllNotificationsReadRequestSchema,
]);
export type ClientRequest = z.infer<typeof ClientRequestSchema>;
