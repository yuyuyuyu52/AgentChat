import { z } from "zod";
import type { PresenceStatus } from "./common.js";
import type { ConversationSummary, Message } from "./message.js";
import type { PlazaPost } from "./plaza.js";
import type { Notification } from "./notification.js";
import { ServerEventSchema, type ServerEvent } from "./ws-events.js";

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
  "notification.created": Notification;
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
