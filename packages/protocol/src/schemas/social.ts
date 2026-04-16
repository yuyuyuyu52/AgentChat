import { z } from "zod";
import { AccountSchema } from "./account.js";

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
