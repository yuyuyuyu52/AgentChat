import { z } from "zod";
import { NotificationTypeSchema } from "./common.js";

export const NotificationSchema = z.object({
  id: z.string(),
  recipientAccountId: z.string(),
  type: NotificationTypeSchema,
  actorAccountId: z.string().nullable(),
  actorName: z.string().nullable(),
  subjectType: z.string(),
  subjectId: z.string(),
  data: z.record(z.string(), z.unknown()),
  isRead: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;
