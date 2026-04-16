# File Structure Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split monolithic files (server.ts 2315L, store.ts 3563L, i18n-provider.tsx 2467L, protocol/index.ts 580L) into focused modules, delete dead artifacts (.js files, SQLite), and keep all external import paths stable.

**Architecture:** Pure restructuring — no functional changes. Each large file gets broken into sub-modules by domain/resource. A barrel re-export file preserves all existing import paths. Verification after each task: `npm run build && npm run check`.

**Tech Stack:** TypeScript, Node.js, React, Vite, npm workspaces

---

### Task 1: Cleanup — Delete Dead Files

**Files:**
- Delete: `packages/server/src/admin-ui.js`
- Delete: `packages/server/src/db.js`
- Delete: `packages/server/src/errors.js`
- Delete: `packages/server/src/index.js`
- Delete: `packages/server/src/server.js`
- Delete: `packages/server/src/store.js`
- Delete: `packages/data/agentchat.sqlite`
- Delete: `packages/data/` (directory)

- [ ] **Step 1: Delete compiled .js files from server/src**

```bash
rm packages/server/src/admin-ui.js packages/server/src/db.js packages/server/src/errors.js packages/server/src/index.js packages/server/src/server.js packages/server/src/store.js
```

- [ ] **Step 2: Delete dead SQLite data directory**

```bash
rm -rf packages/data/
```

- [ ] **Step 3: Verify build still passes**

```bash
npm run build && npm run check
```

Expected: SUCCESS — these .js files were pre-compiled artifacts, not runtime dependencies. The build produces its own output in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove compiled .js artifacts and dead SQLite data"
```

---

### Task 2: Protocol — Split Schemas by Domain

**Files:**
- Create: `packages/protocol/src/schemas/common.ts`
- Create: `packages/protocol/src/schemas/account.ts`
- Create: `packages/protocol/src/schemas/message.ts`
- Create: `packages/protocol/src/schemas/plaza.ts`
- Create: `packages/protocol/src/schemas/social.ts`
- Create: `packages/protocol/src/schemas/notification.ts`
- Create: `packages/protocol/src/schemas/audit.ts`
- Create: `packages/protocol/src/schemas/ws-requests.ts`
- Create: `packages/protocol/src/schemas/ws-events.ts`
- Create: `packages/protocol/src/schemas/ws-frames.ts`
- Modify: `packages/protocol/src/index.ts` (replace with barrel re-exports)

The current `packages/protocol/src/index.ts` (580 lines) contains all Zod schemas, types, and helper functions. Split by domain while keeping the barrel `index.ts` so all consumers (`@agentchatjs/protocol`) see zero changes.

- [ ] **Step 1: Create `schemas/common.ts`**

Move from `index.ts` lines 1-16 (imports, constants, AccountType, PresenceStatus):

```ts
// packages/protocol/src/schemas/common.ts
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
```

- [ ] **Step 2: Create `schemas/account.ts`**

Move AgentSkill, AgentCard, Account, AuthAccount schemas:

```ts
// packages/protocol/src/schemas/account.ts
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
```

- [ ] **Step 3: Create `schemas/message.ts`**

Move Message, ConversationSummary schemas:

```ts
// packages/protocol/src/schemas/message.ts
import { z } from "zod";
import { ConversationKindSchema, MessageKindSchema } from "./common.js";
import { MessageSchema as _MessageSchema } from "./message.js"; // avoid, define here

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
```

- [ ] **Step 4: Create `schemas/plaza.ts`**

Move PlazaPost (including the manual type), RecommendedAgent:

```ts
// packages/protocol/src/schemas/plaza.ts
import { z } from "zod";
import { PlazaPostKindSchema } from "./common.js";
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
// Keep the manual PlazaPost type exactly as-is from original index.ts lines 95-111
export type PlazaPost = {
  id: string;
  author: Account;
  body: string;
  kind: "text";
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
```

- [ ] **Step 5: Create `schemas/social.ts`**

Move FriendRecord, FriendRequest schemas:

```ts
// packages/protocol/src/schemas/social.ts
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
```

- [ ] **Step 6: Create `schemas/notification.ts`**

```ts
// packages/protocol/src/schemas/notification.ts
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
```

- [ ] **Step 7: Create `schemas/audit.ts`**

```ts
// packages/protocol/src/schemas/audit.ts
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
```

- [ ] **Step 8: Create `schemas/ws-requests.ts`**

Move all ClientRequest sub-schemas (lines 180-451 of original index.ts). Copy the entire block of `*RequestSchema` definitions and the `ClientRequestSchema` discriminated union. Each sub-schema imports from sibling modules:

```ts
// packages/protocol/src/schemas/ws-requests.ts
import { z } from "zod";
import { AgentSkillSchema } from "./account.js";

const RequestEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown().optional(),
});

// ... copy all *RequestSchema definitions from original index.ts lines 186-449 ...

export const ClientRequestSchema = z.discriminatedUnion("type", [
  ConnectRequestSchema,
  SubscribeConversationsRequestSchema,
  // ... all request schemas ...
  MarkAllNotificationsReadRequestSchema,
]);
export type ClientRequest = z.infer<typeof ClientRequestSchema>;
```

Note: Copy the complete list of request schemas from the original file. Do not abbreviate.

- [ ] **Step 9: Create `schemas/ws-events.ts`**

Move all ServerEvent schemas (lines 472-522):

```ts
// packages/protocol/src/schemas/ws-events.ts
import { z } from "zod";
import { AccountSchema } from "./account.js";
import { ConversationSummarySchema } from "./message.js";
import { MessageSchema } from "./message.js";
import { PresenceStatusSchema } from "./common.js";
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
```

- [ ] **Step 10: Create `schemas/ws-frames.ts`**

Move ServerResponse, ServerError, helpers, EventPayloadMap (lines 453-580):

```ts
// packages/protocol/src/schemas/ws-frames.ts
import { z } from "zod";
import type { ConversationSummary } from "./message.js";
import type { Message } from "./message.js";
import type { PresenceStatus } from "./common.js";
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
  return { type: "response", id, ok: true, payload };
}

export function makeErrorFrame(
  code: string,
  message: string,
  id?: string,
): ServerErrorFrame {
  return { type: "error", id, ok: false, error: { code, message } };
}

export function makeEvent<E extends keyof EventPayloadMap>(
  event: E,
  payload: EventPayloadMap[E],
): ServerEvent {
  return { type: "event", event, payload } as ServerEvent;
}
```

- [ ] **Step 11: Replace `index.ts` with barrel re-exports**

```ts
// packages/protocol/src/index.ts
export * from "./schemas/common.js";
export * from "./schemas/account.js";
export * from "./schemas/message.js";
export * from "./schemas/plaza.js";
export * from "./schemas/social.js";
export * from "./schemas/notification.js";
export * from "./schemas/audit.js";
export * from "./schemas/ws-requests.js";
export * from "./schemas/ws-events.js";
export * from "./schemas/ws-frames.js";
```

- [ ] **Step 12: Verify build**

```bash
npm run build && npm run check
```

Expected: SUCCESS — all consumers import from `@agentchatjs/protocol` which re-exports everything.

- [ ] **Step 13: Commit**

```bash
git add packages/protocol/ && git commit -m "refactor(protocol): split schemas by domain into focused modules"
```

---

### Task 3: i18n — Extract Translation Data from Component

**Files:**
- Create: `packages/control-plane/src/i18n/locales/zh-CN.ts`
- Create: `packages/control-plane/src/i18n/locales/en.ts`
- Create: `packages/control-plane/src/i18n/locales/ja.ts`
- Create: `packages/control-plane/src/i18n/locales/ko.ts`
- Create: `packages/control-plane/src/i18n/locales/es.ts`
- Create: `packages/control-plane/src/i18n/provider.tsx`
- Create: `packages/control-plane/src/i18n/index.ts`
- Delete: `packages/control-plane/src/components/i18n-provider.tsx`
- Modify: 28 files that import from `@/components/i18n-provider` → `@/i18n`

The current `i18n-provider.tsx` has this structure:
- Lines 1-23: types, LANGUAGE_OPTIONS, STORAGE_KEY
- Lines 24-25: `const messages = {`
- Lines 25-506: zh-CN translations
- Lines 507-988: en translations
- Lines 989-1427: ja translations
- Lines 1428-1866: ko translations
- Lines 1867-2306: es translations
- Lines 2307-2467: I18nContext, provider component, hooks

- [ ] **Step 1: Create locale files**

For each locale, create a file that exports a `Messages` object. Example for `zh-CN.ts`:

```ts
// packages/control-plane/src/i18n/locales/zh-CN.ts
import type { Messages } from "../provider.js";

const zhCN: Messages = {
  // Copy the entire zh-CN object from i18n-provider.tsx lines 25-506
  common: {
    cancel: "取消",
    // ... rest of zh-CN translations ...
  },
  // ...
};

export default zhCN;
```

Repeat for `en.ts` (lines 507-988), `ja.ts` (lines 989-1427), `ko.ts` (lines 1428-1866), `es.ts` (lines 1867-2306). Each file exports `default` as the translation object.

- [ ] **Step 2: Create `i18n/provider.tsx`**

Move the component logic (lines 1-23 types + lines 2307-2467 component) into the provider. Import locale data:

```tsx
// packages/control-plane/src/i18n/provider.tsx
import React from "react";
import zhCN from "./locales/zh-CN.js";
import en from "./locales/en.js";
import ja from "./locales/ja.js";
import ko from "./locales/ko.js";
import es from "./locales/es.js";

export type SupportedLocale = "zh-CN" | "en" | "ja" | "ko" | "es";

export interface Messages {
  [key: string]: string | Messages;
}
type TranslationParams = Record<string, string | number>;

export const LANGUAGE_OPTIONS: Array<{
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
}> = [
  { code: "zh-CN", label: "Chinese (Simplified)", nativeLabel: "简体中文" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
];

const STORAGE_KEY = "agentchat-locale";

const messages: Partial<Record<SupportedLocale, Messages>> = {
  "zh-CN": zhCN,
  en,
  ja,
  ko,
  es,
};

// Copy the remaining component code from lines 2308-2467:
// I18nContextValue interface, I18nContext, resolveSupportedLocale,
// resolveInitialLocale, getMessage, interpolate, getDate,
// I18nProvider component, useI18n hook
// ... (copy exactly as-is from original) ...
```

- [ ] **Step 3: Create `i18n/index.ts`**

```ts
// packages/control-plane/src/i18n/index.ts
export { I18nProvider, useI18n, LANGUAGE_OPTIONS } from "./provider.js";
export type { SupportedLocale, Messages } from "./provider.js";
```

- [ ] **Step 4: Update all import paths**

Replace `from "@/components/i18n-provider"` with `from "@/i18n"` in all 26 page/component files. Replace `from "./i18n-provider"` with `from "@/i18n"` in the 2 sibling component files.

Files to update (28 total):
- `App.tsx` — `import { I18nProvider } from "./components/i18n-provider"` → `import { I18nProvider } from "./i18n"`
- `components/theme-toggle.tsx` — `from "./i18n-provider"` → `from "@/i18n"`
- `components/language-switcher.tsx` — `from "./i18n-provider"` → `from "@/i18n"`
- All files in `pages/` and `components/layout/` and `components/ui/search-command.tsx` — `from "@/components/i18n-provider"` → `from "@/i18n"`

- [ ] **Step 5: Delete old `i18n-provider.tsx`**

```bash
rm packages/control-plane/src/components/i18n-provider.tsx
```

- [ ] **Step 6: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/ && git commit -m "refactor(control-plane): extract i18n translations into separate locale files"
```

---

### Task 4: Store — Split into Sub-Modules

**Files:**
- Create: `packages/server/src/store/types.ts`
- Create: `packages/server/src/store/helpers.ts`
- Create: `packages/server/src/store/schema.ts`
- Create: `packages/server/src/store/accounts.ts`
- Create: `packages/server/src/store/sessions.ts`
- Create: `packages/server/src/store/friends.ts`
- Create: `packages/server/src/store/conversations.ts`
- Create: `packages/server/src/store/plaza.ts`
- Create: `packages/server/src/store/notifications.ts`
- Create: `packages/server/src/store/audit-logs.ts`
- Create: `packages/server/src/store/recommendation.ts`
- Create: `packages/server/src/store/index.ts`
- Delete: `packages/server/src/store.ts`

**Pattern:** Each sub-module exports standalone async functions that take the `DatabaseAdapter` (or `Queryable`) as their first argument. `store/index.ts` defines the `AgentChatStore` class which delegates to these functions, passing `this.db`. This keeps the class as a thin facade while isolating logic into testable units.

**Method → file mapping:**

| File | Methods (from store.ts) |
|------|------------------------|
| `accounts.ts` | createAccount, getOrCreateHumanAccount, getAccountById, updateProfile, listAccounts, listAgentAccounts, authenticateAccount, resetToken, deleteAccount, createHumanUser, authenticateHumanUser, getHumanUserByEmail, listAccountsByType, seedDefaultHumanUser, ensureAccountOwnerColumns |
| `sessions.ts` | createAdminSession, hasAdminSession, deleteAdminSession, createUserSession, getUserSession, deleteUserSession, createOAuthState, consumeOAuthState |
| `friends.ts` | createFriendship, listFriends, addFriendAs, listFriendRequests, respondFriendRequestAs, getFriendRequestById, getFriendRequestWatcherIds, normalizeFriendshipPair (helper) |
| `conversations.ts` | createGroup, createGroupAs, addGroupMember, addGroupMemberAs, listGroups, listConversationMembers, listConversations, listOwnedConversations, listOwnedConversationMessages, listMessages, sendMessage, getConversationSummaryForAccount, getConversationSummaryForSystem, getConversationMemberIds, getConversationWatcherIds, markSessionStatus, getOwnedConversationSummary, getLastMessage, getConversationMaxSeq, getMembership |
| `plaza.ts` | createPlazaPost, listPlazaPosts, listTrendingPosts, getPlazaPost, likePlazaPost, unlikePlazaPost, repostPlazaPost, unrepostPlazaPost, recordPlazaView, recordPlazaViewBatch, listPlazaReplies, upsertPostEmbedding, getPostEmbedding, upsertInterestVector, getInterestVector, findSimilarPosts, upsertAgentScore, getPlazaPostAuthorId, ensurePlazaPostColumns |
| `notifications.ts` | createNotification, listNotifications, listNotificationsForOwner, getUnreadNotificationCount, getUnreadNotificationCountForOwner, markNotificationRead, markNotificationReadForOwner, markAllNotificationsRead, markAllNotificationsReadForOwner |
| `audit-logs.ts` | insertAuditLog, listAuditLogsForAccount, listAuditLogs, listOwnedAuditLogs |
| `recommendation.ts` | listTopAgents, buildInterestVector, listRecommendedPosts, getAgentPostQualityAvg, getAgentEngagementRate, getAgentLastPostAgeHours, getFriendInteractedPostIds, getInteractedPostIds, getFriendCount |

- [ ] **Step 1: Create `store/types.ts`**

Move all row types (lines 28-153), exported types (lines 613-673):

```ts
// packages/server/src/store/types.ts
import type {
  AccountType,
  ConversationKind,
  ConversationSummary,
  FriendRequestStatus,
  Message,
} from "@agentchatjs/protocol";

// Row types
export type AccountRow = { id: string; type: AccountType; name: string; profile_json: string; auth_token: string; owner_subject: string | null; owner_email: string | null; owner_name: string | null; created_at: string; };
export type ConversationRow = { id: string; kind: ConversationKind; title: string | null; created_at: string; };
export type MessageRow = { id: string; conversation_id: string; sender_id: string; body: string; kind: "text"; created_at: string; seq: number; };
export type PlazaPostRow = { id: string; author_account_id: string; body: string; kind: "text"; created_at: string; parent_post_id: string | null; quoted_post_id: string | null; };
export type MembershipRow = { conversation_id: string; account_id: string; role: string; joined_at: string; history_start_seq: number; };
export type FriendshipRow = { id: string; account_a: string; account_b: string; status: string; dm_conversation_id: string; created_at: string; };
export type FriendRequestRow = { id: string; requester_id: string; target_id: string; status: FriendRequestStatus; created_at: string; responded_at: string | null; };
export type AuditLogRow = { id: string; actor_account_id: string | null; event_type: string; subject_type: string; subject_id: string; conversation_id: string | null; metadata_json: string; created_at: string; };
export type NotificationRow = { id: string; recipient_account_id: string; type: string; actor_account_id: string | null; subject_type: string; subject_id: string; data_json: string; is_read: boolean; created_at: string; };
export type HumanUserRow = { id: string; email: string; name: string; password_hash: string; created_at: string; };
export type AdminAuthSessionRow = { id: string; created_at: string; expires_at: string; };
export type UserAuthSessionRow = { id: string; subject: string; email: string; name: string; picture: string | null; auth_provider: "google" | "local"; created_at: string; expires_at: string; };
export type OAuthStateRow = { id: string; created_at: string; expires_at: string; };
export type OwnedConversationRow = { id: string; kind: ConversationKind; title: string | null; created_at: string; };

// Public types
export type CreateAccountInput = {
  name: string;
  type?: AccountType | undefined;
  profile?: Record<string, unknown> | undefined;
  owner?: { subject: string; email: string; name: string; } | undefined;
};

export type SendMessageInput =
  | { senderId: string; conversationId: string; body: string; recipientId?: never; }
  | { senderId: string; recipientId: string; body: string; conversationId?: never; };

export type OwnedConversationSummary = ConversationSummary & {
  ownedAgents: Array<{ id: string; name: string; }>;
};

export type OwnedConversationMessage = Message & { senderName: string; };

export type HumanUser = { id: string; email: string; name: string; createdAt: string; };

export type StoredUserSession = {
  createdAt: number;
  subject: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: "google" | "local";
};

export type ListPlazaPostsOptions = {
  authorAccountId?: string;
  viewerAccountId?: string;
  parentPostId?: string;
  beforeCreatedAt?: string;
  beforeId?: string;
  limit?: number;
};

export type AgentChatStoreOptions = { databaseUrl: string; };
```

- [ ] **Step 2: Create `store/helpers.ts`**

Move helper functions (lines 154-314):

```ts
// packages/server/src/store/helpers.ts
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Account, AuditLog, Message, Notification, NotificationType, PlazaPost } from "@agentchatjs/protocol";
import type { StorageDriver } from "../db.js";
import type { AccountRow, AuditLogRow, HumanUserRow, MessageRow, NotificationRow, PlazaPostRow } from "./types.js";

export function nowIso(): string { return new Date().toISOString(); }
export function addSeconds(isoTimestamp: string, seconds: number): string { return new Date(Date.parse(isoTimestamp) + seconds * 1_000).toISOString(); }
export function parseRecord(value: string): Record<string, unknown> { return JSON.parse(value) as Record<string, unknown>; }
export function createId(prefix: string): string { return `${prefix}_${randomUUID()}`; }
export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

export function accountFromRow(row: AccountRow): Account {
  return { id: row.id, type: row.type, name: row.name, profile: parseRecord(row.profile_json), createdAt: row.created_at };
}

export function messageFromRow(row: MessageRow): Message {
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, kind: row.kind, createdAt: row.created_at, seq: Number(row.seq) };
}

// Copy plazaPostFromRow, auditLogFromRow, notificationFromRow,
// normalizeFriendshipPair, parseVectorString, hashPassword, verifyPassword,
// humanUserFromRow, uniqueViolation exactly as in original store.ts
// ... (full implementations from lines 188-314) ...
```

- [ ] **Step 3: Create `store/schema.ts`**

Move the `BASE_SCHEMA` array (lines 316-611):

```ts
// packages/server/src/store/schema.ts
export const BASE_SCHEMA = [
  // Copy entire BASE_SCHEMA array from original store.ts lines 316-611
];
```

- [ ] **Step 4: Create each sub-module**

For each sub-module (`accounts.ts`, `sessions.ts`, `friends.ts`, `conversations.ts`, `plaza.ts`, `notifications.ts`, `audit-logs.ts`, `recommendation.ts`), export standalone functions. Example pattern:

```ts
// packages/server/src/store/accounts.ts
import { randomUUID } from "node:crypto";
import type { Account, AuthAccount } from "@agentchatjs/protocol";
import type { DatabaseAdapter, Queryable } from "../db.js";
import type { AccountRow, CreateAccountInput } from "./types.js";
import { accountFromRow, createId, nowIso, hashPassword, verifyPassword, normalizeEmail, uniqueViolation, humanUserFromRow } from "./helpers.js";
import { AppError } from "../errors.js";

export async function createAccount(db: DatabaseAdapter, input: CreateAccountInput): Promise<AuthAccount> {
  // Copy body from original store.ts createAccount method
}

export async function getAccountById(db: DatabaseAdapter, accountId: string): Promise<Account> {
  // Copy body from original store.ts getAccountById method
}

// ... repeat for all account methods ...
```

Each method that was `this.store.someMethod(...)` or `this.someMethod(...)` in the class now takes `db: DatabaseAdapter` as the first argument. Internal `this.db` references become `db`.

- [ ] **Step 5: Create `store/index.ts` — the facade class**

```ts
// packages/server/src/store/index.ts
import { createDatabaseAdapter, type DatabaseAdapter } from "../db.js";
import { BASE_SCHEMA } from "./schema.js";
import type { AgentChatStoreOptions } from "./types.js";

// Re-export public types so external imports from "./store.js" still work
export type { CreateAccountInput, SendMessageInput, StoredUserSession, OwnedConversationSummary, OwnedConversationMessage, HumanUser, ListPlazaPostsOptions, AgentChatStoreOptions } from "./types.js";
export type { StorageDriver } from "../db.js";

// Import all sub-module functions
import * as accountFns from "./accounts.js";
import * as sessionFns from "./sessions.js";
import * as friendFns from "./friends.js";
import * as conversationFns from "./conversations.js";
import * as plazaFns from "./plaza.js";
import * as notificationFns from "./notifications.js";
import * as auditLogFns from "./audit-logs.js";
import * as recommendationFns from "./recommendation.js";

export class AgentChatStore {
  readonly databasePath: string;
  readonly driver = "postgres" as const;
  private readonly db: DatabaseAdapter;
  private initialized = false;

  constructor(options: AgentChatStoreOptions) {
    this.db = createDatabaseAdapter(options);
    this.databasePath = this.db.descriptor;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    for (const statement of BASE_SCHEMA) { await this.db.exec(statement); }
    await accountFns.ensureAccountOwnerColumns(this.db);
    await plazaFns.ensurePlazaPostColumns(this.db);
    await accountFns.seedDefaultHumanUser(this.db);
    this.initialized = true;
  }

  async close() { await this.db.close(); }

  // Delegate every public method to its sub-module function, passing this.db
  createAccount = (input: Parameters<typeof accountFns.createAccount>[1]) => accountFns.createAccount(this.db, input);
  getAccountById = (id: string) => accountFns.getAccountById(this.db, id);
  // ... repeat for every public method ...
}
```

The key constraint: every public method signature must remain identical to what `server.ts` and `index.ts` currently call. The only change is internal — the implementation lives in sub-module files.

- [ ] **Step 6: Delete old `store.ts`, move `store/` into position**

The old `packages/server/src/store.ts` gets deleted. The new `packages/server/src/store/index.ts` is what `./store.js` resolves to.

- [ ] **Step 7: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 8: Commit**

```bash
git add packages/server/ && git commit -m "refactor(server): split store into domain sub-modules"
```

---

### Task 5: Server — Split Routes by Resource

**Files:**
- Create: `packages/server/src/router.ts`
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/routes/admin.ts`
- Create: `packages/server/src/routes/accounts.ts`
- Create: `packages/server/src/routes/conversations.ts`
- Create: `packages/server/src/routes/plaza.ts`
- Create: `packages/server/src/routes/notifications.ts`
- Create: `packages/server/src/routes/agents.ts`
- Create: `packages/server/src/routes/websocket.ts`
- Modify: `packages/server/src/server.ts` (slim down to ~300-400 lines)

**Route → file mapping (from server.ts `handleHttpRequest`):**

| File | Routes (method + path) |
|------|----------------------|
| `auth.ts` | POST /auth/login, POST /auth/register, GET /auth/google/login, GET /auth/google/callback, GET /auth/logout |
| `admin.ts` | POST /admin/login, POST /admin/logout, GET /admin/health, POST /admin/init, GET /admin/accounts, GET /admin/audit-logs, POST /admin/accounts, POST /admin/accounts/:id/reset-token, GET /admin/accounts/:id/friends, GET /admin/accounts/:id/groups, GET /admin/accounts/:id/conversations, POST /admin/friendships, POST /admin/groups, POST /admin/groups/:id/members, POST /admin/messages, GET /admin/conversations/:id/messages |
| `accounts.ts` | GET /app/api/accounts, GET /app/api/session, POST /app/api/accounts, POST /app/api/accounts/:id/reset-token, PATCH /app/api/accounts/:id/profile, GET /app/api/accounts/:id, DELETE /app/api/accounts/:id |
| `conversations.ts` | GET /app/api/conversations, GET /app/api/audit-logs, GET /app/api/conversations/:id/messages |
| `plaza.ts` | GET /app/api/plaza, GET /app/api/plaza/trending, GET /app/api/plaza/:id, POST /app/api/plaza/:id/reply, POST /app/api/plaza/:id/view, POST /app/api/plaza/views, POST /app/api/plaza/:id/like, DELETE /app/api/plaza/:id/like, POST /app/api/plaza/:id/repost, DELETE /app/api/plaza/:id/repost, GET /app/api/plaza/:id/replies |
| `notifications.ts` | GET /app/api/notifications, GET /app/api/notifications/unread-count, POST /app/api/notifications/:id/read, POST /app/api/notifications/read-all |
| `agents.ts` | GET /agents/:id/card.json, GET /.well-known/agent.json, GET /app/api/agents/recommended |
| `websocket.ts` | All `handleSocketMessage` switch cases |

- [ ] **Step 1: Create `router.ts`**

A lightweight router that maps (method, pathPattern) → handler:

```ts
// packages/server/src/router.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { UrlWithParsedQuery } from "node:url";
import type { AgentChatServer } from "./server.js";

export type RouteContext = {
  server: AgentChatServer;
  request: IncomingMessage;
  response: ServerResponse;
  url: UrlWithParsedQuery;
  method: string;
  params: Record<string, string>;
};

export type RouteHandler = (ctx: RouteContext) => Promise<void>;

type Route = {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
};

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
  }

  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;
      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]!] = match[i + 1]!;
      }
      return { handler: route.handler, params };
    }
    return null;
  }
}
```

- [ ] **Step 2: Create each route file**

Each route file exports a `register(router: Router, server: AgentChatServer)` function. Example:

```ts
// packages/server/src/routes/auth.ts
import type { Router } from "../router.js";
import type { AgentChatServer } from "../server.js";
import { /* schemas, helpers */ } from "...";

export function register(router: Router, server: AgentChatServer): void {
  router.add("POST", "/auth/login", async (ctx) => {
    // Move auth login handler from server.ts lines 841-877
  });

  router.add("POST", "/auth/register", async (ctx) => {
    // Move register handler from server.ts lines 879-902
  });

  // ... etc for all auth routes
}
```

Repeat for each route file. Each handler body is a direct copy from `server.ts` `handleHttpRequest`, replacing `this.` with `ctx.server.` and `response`/`request` with `ctx.response`/`ctx.request`.

- [ ] **Step 3: Create `routes/websocket.ts`**

Move `handleSocketMessage` switch body (lines 1588-1914):

```ts
// packages/server/src/routes/websocket.ts
import type { AgentChatServer, ConnectionState } from "../server.js";

export async function handleSocketMessage(
  server: AgentChatServer,
  connection: ConnectionState,
  rawMessage: string,
): Promise<void> {
  // Copy switch-case body from server.ts handleSocketMessage
}
```

- [ ] **Step 4: Slim down `server.ts`**

What stays in `server.ts`:
- Imports
- `ConnectionState` type (exported for routes/websocket.ts)
- `FailedAttemptRateLimiter` class
- `AgentChatServerOptions` type
- Utility functions: `readJson`, `jsonResponse`, `redirect`, `buildAgentCard`, `contentTypeForFile`, `firstHeaderValue`, `isControlPlaneAssetPath`, `isControlPlaneAppPath`, `normalizeUiLang`, request body schemas (move to respective route files)
- `AgentChatServer` class with:
  - Constructor (creates HTTP server, WS server, registers routes)
  - `start()`, `stop()`, `createAccount()`
  - All the public wrapper methods that `routes/` call through `ctx.server.*`
  - Connection management: `registerConnection`, `handleSocketClose`
  - Broadcasting: `broadcastPresence`, `broadcastConversationCreated`, `broadcastMessage`, `broadcastPlazaPostCreated`, `dispatchEventToAccount`, `sendResponse`
  - Auth helpers: `isAdminAuthorized`, `requireAdminAuthorization`, `requireUserSession`, `getUserSession`, `startUserSession`, cookie methods
  - `handleHttpRequest` becomes thin: static file serving + router dispatch + error handler

- [ ] **Step 5: Verify build**

```bash
npm run build && npm run check
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/ && git commit -m "refactor(server): split routes by resource into focused modules"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full build and type-check**

```bash
npm run build && npm run check
```

- [ ] **Step 2: Run tests (if test DB available)**

```bash
npm test
```

- [ ] **Step 3: Verify no file exceeds ~600 lines**

```bash
find packages -name '*.ts' -o -name '*.tsx' | grep -v node_modules | grep -v dist | xargs wc -l | sort -rn | head -20
```

Expected: no file over ~600 lines.

- [ ] **Step 4: Verify no .js files in source directories**

```bash
find packages -name '*.js' -not -path '*/node_modules/*' -not -path '*/dist/*'
```

Expected: empty output.

- [ ] **Step 5: Final commit (if any adjustments needed)**

```bash
git add -A && git commit -m "refactor: file structure optimization complete"
```
