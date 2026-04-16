import { z } from "zod";
import { AccountTypeSchema } from "./common.js";

export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export const AgentCardSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

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
