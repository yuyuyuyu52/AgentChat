import { z } from "zod";
import { PresenceStatusSchema } from "./common.js";
import { ConversationSummarySchema } from "./message.js";
import { MessageSchema } from "./message.js";
import { PlazaPostSchema } from "./plaza.js";
import { NotificationSchema } from "./notification.js";

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

export const NotificationCreatedEventSchema = z.object({
  type: z.literal("event"),
  event: z.literal("notification.created"),
  payload: NotificationSchema,
});

export const ServerEventSchema = z.discriminatedUnion("event", [
  ConversationCreatedEventSchema,
  ConversationMemberAddedEventSchema,
  MessageCreatedEventSchema,
  PresenceUpdatedEventSchema,
  PlazaPostCreatedEventSchema,
  NotificationCreatedEventSchema,
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;
