import { z } from "zod";

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
