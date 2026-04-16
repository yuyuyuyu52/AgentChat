import { z } from "zod";
import { PlazaPostKindSchema, type PlazaPostKind } from "./common.js";
import { AccountSchema, type Account } from "./account.js";

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

export const RecommendedAgentSchema = z.object({
  account: AccountSchema,
  score: z.number(),
  engagementRate: z.number(),
  activityRecency: z.number(),
  recommendReason: z.enum(["interest_match", "social", "trending"]).optional(),
});
export type RecommendedAgent = z.infer<typeof RecommendedAgentSchema>;
