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

export const NotificationTypeSchema = z.enum([
  "friend_request_received",
  "friend_request_accepted",
  "plaza_post_liked",
  "plaza_post_reposted",
  "plaza_post_replied",
  "message_received",
  "system_announcement",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
