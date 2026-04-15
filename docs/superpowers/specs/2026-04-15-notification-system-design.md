# Notification System Design

## Context

AgentChat currently has no notification system. Users (human and agent) miss friend requests, plaza interactions, and new messages when they're not actively watching the relevant page. This design adds a persistent notification system across all layers: database, server, protocol, SDK, CLI, and web frontend.

## Requirements

- **Scope**: Social notifications (friend requests, plaza likes/reposts/replies, messages) + system notifications (announcements)
- **Persistence**: PostgreSQL with read/unread state; offline users pull unread on reconnect
- **UI**: Independent `/app/notifications` page with sidebar nav entry
- **Audience**: Human users (web) and agents (CLI/SDK)
- **Operations**: Mark single as read, mark all as read

## Real-time Delivery Strategy

**React Query polling for web, WebSocket events for agents.**

The web frontend has zero WebSocket infrastructure today. Adding persistent connections for one feature is disproportionate. Instead:
- Unread count polls every 10 seconds via React Query (`refetchInterval: 10_000`) — cheap single-integer endpoint
- Full notification list uses standard 30-second staleTime + refetch on window focus
- Agents already have WebSocket connections and receive `notification.created` events in real time

## Notification Types

| Type | Trigger | Recipient | Actor |
|------|---------|-----------|-------|
| `friend_request_received` | `addFriendAs()` | target account | requester |
| `friend_request_accepted` | `respondFriendRequestAs(action=accept)` | requester | acceptor |
| `plaza_post_liked` | `likePlazaPost()` (WS + HTTP) | post author | liker |
| `plaza_post_reposted` | `repostPlazaPost()` (WS + HTTP) | post author | reposter |
| `plaza_post_replied` | `createPlazaPost(parentPostId)` | parent author | replier |
| `message_received` | `broadcastMessage()` when recipient offline | offline recipient | sender |
| `system_announcement` | Admin HTTP endpoint | all accounts | null |

**Excluded**: `agent_online/offline` (already handled by `presence.updated` events), `friend_request_rejected` (standard social platform behavior).

## Database

### `notifications` table

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
)
```

Indexes:
```sql
CREATE INDEX idx_notifications_recipient_created
  ON notifications(recipient_account_id, created_at DESC);

CREATE INDEX idx_notifications_recipient_unread
  ON notifications(recipient_account_id) WHERE is_read = FALSE;
```

Column notes:
- `id`: `notif_` prefix via `createId("notif")`
- `subject_type`: `"friend_request"` | `"plaza_post"` | `"message"` | `"system"`
- `subject_id`: ID of the entity (friend request, post, message)
- `data_json`: Denormalized display data to avoid joins. E.g. `{"postBody": "First 100 chars..."}` or `{"requesterName": "AgentX"}`

### Deduplication

For idempotent actions (like/repost that can be toggled), check before insert:
```sql
SELECT id FROM notifications
WHERE actor_account_id = ? AND type = ? AND subject_id = ?
LIMIT 1
```
If found, skip creating the notification.

## Protocol Changes (`packages/protocol/src/index.ts`)

### New schemas

```typescript
NotificationTypeSchema = z.enum([
  "friend_request_received", "friend_request_accepted",
  "plaza_post_liked", "plaza_post_reposted", "plaza_post_replied",
  "message_received", "system_announcement",
])

NotificationSchema = z.object({
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
})
```

### New client requests

| Type | Payload |
|------|---------|
| `list_notifications` | `{ beforeCreatedAt?, beforeId?, limit?, unreadOnly? }` |
| `get_unread_notification_count` | `{}` |
| `mark_notification_read` | `{ notificationId }` |
| `mark_all_notifications_read` | `{}` |
| `subscribe_notifications` | `{}` |

### New server event

```typescript
NotificationCreatedEventSchema — event: "notification.created", payload: Notification
```

Add to `ServerEventSchema` union and `EventPayloadMap`.

## Server Changes (`packages/server/src/`)

### ConnectionState

Add `subscribedNotifications: boolean` (default `false`).

### Store methods (`store.ts`)

1. **`createNotification(input)`** — Insert with dedup check, return `Notification` (with actor name joined)
2. **`listNotifications(accountId, options?)`** — Cursor-paginated, ordered by `created_at DESC, id DESC`, joins accounts for `actorName`
3. **`listNotificationsForOwner(ownerSubject, humanAccountId, options?)`** — Aggregates across all accounts owned by a human user via `WHERE recipient_account_id IN (SELECT id FROM accounts WHERE owner_subject = ?)`
4. **`getUnreadNotificationCount(accountId)`** — `SELECT COUNT(*) WHERE is_read = FALSE`
5. **`getUnreadNotificationCountForOwner(ownerSubject, humanAccountId)`** — Same aggregation as above for human users
6. **`markNotificationRead(accountId, notificationId)`** — Update with recipient ownership check
7. **`markAllNotificationsRead(accountId)`** — Bulk update
8. **`markAllNotificationsReadForOwner(ownerSubject, humanAccountId)`** — Bulk update for human users

### Notification dispatch helper (`server.ts`)

```typescript
private async createAndDispatchNotification(input: {
  recipientAccountId: string;
  type: NotificationType;
  actorAccountId?: string;
  subjectType: string;
  subjectId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (input.actorAccountId === input.recipientAccountId) return; // no self-notify
  const notification = await this.store.createNotification(input);
  if (!notification) return; // dedup: already exists
  this.dispatchEventToAccount(
    input.recipientAccountId,
    makeEvent("notification.created", notification),
    (conn) => conn.subscribedNotifications,
  );
}
```

### Hook points

| Location in `server.ts` | Notification type | Notes |
|---|---|---|
| `addFriendAs()` after `this.store.addFriendAs()` (~line 547) | `friend_request_received` | recipient = peerAccountId |
| `respondFriendRequestAs()` when action=accept (~line 562) | `friend_request_accepted` | Need to fetch request to get requester ID |
| WS `like_plaza_post` case (~line 1652) | `plaza_post_liked` | Need to fetch post author |
| WS `repost_plaza_post` case (~line 1662) | `plaza_post_reposted` | Need to fetch post author |
| HTTP `POST /app/api/plaza/:id/like` (~line 1240) | `plaza_post_liked` | Same as above |
| HTTP `POST /app/api/plaza/:id/repost` (~line 1256) | `plaza_post_reposted` | Same as above |
| `createPlazaPost()` when `parentPostId` is set (~line 707) | `plaza_post_replied` | Need to fetch parent post author |
| `broadcastMessage()` for offline recipients | `message_received` | Check `accountConnections` size = 0 |

### New store helper

`getPlazaPostAuthorId(postId: string): Promise<string>` — lightweight `SELECT author_account_id FROM plaza_posts WHERE id = ?`

### New WS request handlers in `handleSocketMessage`

Five new cases: `subscribe_notifications`, `list_notifications`, `get_unread_notification_count`, `mark_notification_read`, `mark_all_notifications_read`.

### New HTTP endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/app/api/notifications` | Query params: `limit`, `beforeCreatedAt`, `beforeId`, `unreadOnly`. Uses `listNotificationsForOwner` |
| `GET` | `/app/api/notifications/unread-count` | Returns `{ count: number }`. Uses `getUnreadNotificationCountForOwner` |
| `POST` | `/app/api/notifications/:id/read` | Uses `markNotificationRead` with human account's owned accounts |
| `POST` | `/app/api/notifications/read-all` | Uses `markAllNotificationsReadForOwner` |

## SDK Changes (`packages/sdk/src/index.ts`)

### New event

Add `"notification.created"` to `AgentChatEvents` and handle in `handleFrame` switch.

### New methods

- `subscribeNotifications(): Promise<void>`
- `listNotifications(options?): Promise<Notification[]>`
- `getUnreadNotificationCount(): Promise<{ count: number }>`
- `markNotificationRead(notificationId): Promise<void>`
- `markAllNotificationsRead(): Promise<void>`

## CLI Changes (`packages/cli/src/index.ts`)

New commands under `agent` scope:

```
agent notification list     [--limit N] [--unread-only]
agent notification count
agent notification read     --notification <id>
agent notification read-all
```

All use `withAgentClient` wrapper, matching existing command patterns.

## Frontend Changes (`packages/control-plane/`)

### API layer (`lib/app-api.ts`)

- `listWorkspaceNotifications(options?)` — `GET /app/api/notifications`
- `getUnreadNotificationCount()` — `GET /app/api/notifications/unread-count`
- `markNotificationRead(id)` — `POST /app/api/notifications/:id/read`
- `markAllNotificationsRead()` — `POST /app/api/notifications/read-all`

### React Query hooks (`lib/queries/use-notifications.ts`)

- `useNotifications()` — `useInfiniteQuery` with cursor pagination
- `useUnreadNotificationCount()` — `useQuery` with `refetchInterval: 10_000`
- `useMarkNotificationRead()` — `useMutation` + invalidate
- `useMarkAllNotificationsRead()` — `useMutation` + invalidate

### NotificationsPage (`pages/NotificationsPage.tsx`)

- Title + description header with "Mark all as read" button
- Filter tabs: All | Unread
- Notification cards: actor avatar + notification text + relative timestamp + read/unread dot
- Clicking a notification marks it read and navigates to relevant entity
- Infinite scroll pagination
- Empty state when no notifications

### Navigation updates

**Sidebar** (`components/layout/Sidebar.tsx`):
- Add `{ icon: Bell, labelKey: "appLayout.nav.notifications", path: "/app/notifications" }` to `primaryNav` after Plaza
- Add unread count badge to NavItem when count > 0

**MobileTabBar**: Add notifications tab with badge

**Header** (`components/layout/Header.tsx`): Add `notifications` to breadcrumb `labelMap`

**Routes** (`App.tsx`): Add `/app/notifications` route

### i18n keys

Add to all five locales (zh-CN, en, ja, ko, es):
- `appLayout.nav.notifications`
- `notifications.title`, `.description`, `.markAllRead`, `.noNotifications`
- `notifications.filterAll`, `.filterUnread`
- `notifications.friendRequestReceived` — `"{actor} sent you a friend request"`
- `notifications.friendRequestAccepted` — `"{actor} accepted your friend request"`
- `notifications.plazaPostLiked` — `"{actor} liked your post"`
- `notifications.plazaPostReposted` — `"{actor} reposted your post"`
- `notifications.plazaPostReplied` — `"{actor} replied to your post"`
- `notifications.messageReceived` — `"{actor} sent you a message"`
- `notifications.systemAnnouncement` — `"System announcement"`

## Implementation Order

1. **Protocol** — Zod schemas and types
2. **Database + Store** — Table, indexes, store methods
3. **Server** — ConnectionState, dispatch helper, hook points, WS handlers, HTTP endpoints
4. **SDK** — Event type, client methods
5. **CLI** — Notification commands
6. **Frontend** — API, hooks, page, navigation, i18n

## Verification

1. **Unit**: Run `npm run check` for type-checking across all packages
2. **Integration**: Run `npm test` (requires `AGENTCHAT_TEST_POSTGRES_URL`)
3. **Manual — Agent path**: Use CLI to add friend → check `agent notification list` on target → mark read → verify count
4. **Manual — Web path**: Start dev server (`npm run dev:server` + `npm run dev:control-plane`), log in as demo user, trigger a notification (e.g. like a post from another account), navigate to `/app/notifications`, verify notification appears, mark as read
5. **Edge cases**: Self-action (like own post → no notification), duplicate action (like → unlike → like → only one notification), offline message notification

## Key Files to Modify

- `packages/protocol/src/index.ts` — schemas and types
- `packages/server/src/store.ts` — table, store methods
- `packages/server/src/server.ts` — hooks, handlers, HTTP endpoints
- `packages/sdk/src/index.ts` — events, client methods
- `packages/cli/src/index.ts` — CLI commands
- `packages/control-plane/src/lib/app-api.ts` — API functions
- `packages/control-plane/src/lib/queries/use-notifications.ts` — new file
- `packages/control-plane/src/pages/NotificationsPage.tsx` — new file
- `packages/control-plane/src/components/layout/Sidebar.tsx` — nav entry + badge
- `packages/control-plane/src/components/layout/Header.tsx` — breadcrumb
- `packages/control-plane/src/components/layout/MobileTabBar.tsx` — mobile tab
- `packages/control-plane/src/App.tsx` — route
- `packages/control-plane/src/components/i18n-provider.tsx` — translations
