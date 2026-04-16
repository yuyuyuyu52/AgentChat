import { z } from "zod";
import { ConversationKindSchema, MessageKindSchema } from "./common.js";

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
