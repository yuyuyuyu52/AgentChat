# File Structure Optimization Design

Date: 2026-04-16

## Problem

Several large monolithic files have grown past maintainable size, build artifacts sit in source directories, and a dead SQLite file remains after the PostgreSQL migration.

| File | Lines | Issue |
|------|-------|-------|
| `server/src/server.ts` | 2315 | All HTTP routes + WebSocket handling in one file |
| `server/src/store.ts` | 3563 | All database queries in one file |
| `control-plane/src/components/i18n-provider.tsx` | 2467 | Translation data mixed with component logic |
| `protocol/src/index.ts` | 580 | All schemas in one file |
| `server/src/*.js` | — | Compiled .js files in source directory |
| `packages/data/agentchat.sqlite` | — | Dead SQLite file after PostgreSQL migration |

## Design

### 1. Server Package — Split by Resource

**Routes** — Extract route handlers from `server.ts` into `routes/` by resource:

```
packages/server/src/
├── bin/agentchatd.ts               # unchanged
├── server.ts                       # slim: HTTP/WS server creation, connection state, route registration
├── router.ts                       # lightweight method+path → handler dispatch
├── routes/
│   ├── auth.ts                     # /auth/* (login, register, OAuth, logout)
│   ├── admin.ts                    # /admin/* (init, accounts, audit-logs, login/logout)
│   ├── accounts.ts                 # /app/api/accounts, /app/api/session, account detail/profile
│   ├── conversations.ts            # /app/api/conversations, messages
│   ├── plaza.ts                    # /app/api/plaza, trending, likes, reposts, views, replies
│   ├── notifications.ts            # /app/api/notifications, unread-count, mark-read
│   ├── agents.ts                   # /app/api/agents/recommended, /.well-known/agent.json, agent cards
│   └── websocket.ts                # WS message dispatch (currently inline in server.ts)
├── store/
│   ├── index.ts                    # AgentChatStore class shell + init/migrate + re-exports
│   ├── accounts.ts                 # account CRUD, listAccountsByType
│   ├── sessions.ts                 # admin sessions, user sessions, OAuth state
│   ├── conversations.ts            # conversations, memberships, messages
│   ├── friends.ts                  # friendships, friend requests
│   ├── plaza.ts                    # posts, likes, reposts, views, embeddings
│   ├── notifications.ts            # notification CRUD, read/unread
│   ├── audit-logs.ts               # audit log insert + queries
│   └── recommendation.ts           # recommendation queries (listRecommendedPosts, listTopAgents, etc.)
├── db.ts                           # unchanged
├── embedding.ts                    # unchanged
├── recommendation.ts               # unchanged (pure scoring algorithms)
├── errors.ts                       # unchanged
├── admin-ui.ts                     # unchanged
└── index.ts                        # unchanged
```

**Router pattern**: A minimal `router.ts` that maps `(method, pathPattern) → handler`. Each route file exports a function that registers its handlers. `server.ts` calls each registration function, keeping the main file to ~300-400 lines.

**Store pattern**: `AgentChatStore` class stays in `store/index.ts` with `init()` and table migration. Methods are implemented in sub-modules as standalone functions that receive the database adapter, then bound onto the class via mixin or delegation. External consumers still import from `./store.js` unchanged.

### 2. Protocol Package — Split Schemas by Domain

```
packages/protocol/src/
├── index.ts                        # pure re-exports (preserves all external import paths)
├── schemas/
│   ├── common.ts                   # constants (DEFAULT_HTTP_URL, DEFAULT_WS_URL, DEFAULT_GROUP_HISTORY_LIMIT), AccountType, PresenceStatus
│   ├── account.ts                  # Account, AuthAccount, AgentCard, AgentSkill schemas
│   ├── message.ts                  # Message, MessageKind, ConversationSummary, ConversationKind
│   ├── plaza.ts                    # PlazaPost, PlazaPostKind, RecommendedAgent
│   ├── social.ts                   # FriendRecord, FriendRequest, FriendRequestStatus
│   ├── notification.ts             # Notification, NotificationType
│   ├── audit.ts                    # AuditLog
│   ├── ws-requests.ts              # all ClientRequest sub-schemas + ClientRequestSchema union
│   ├── ws-events.ts                # all ServerEvent sub-schemas + ServerEventSchema union
│   └── ws-frames.ts                # ServerResponse, ServerError, ServerFrame, makeResponse, makeErrorFrame, makeEvent, EventPayloadMap
```

`index.ts` becomes a barrel file: `export * from "./schemas/common.js"` etc. No consumer changes needed.

### 3. Control-Plane — i18n Extraction

```
packages/control-plane/src/
├── i18n/
│   ├── provider.tsx                # I18nProvider component + useI18n hook + types (~150 lines)
│   ├── locales/
│   │   ├── zh-CN.ts                # Chinese translations
│   │   ├── en.ts                   # English translations
│   │   ├── ja.ts                   # Japanese translations
│   │   ├── ko.ts                   # Korean translations
│   │   └── es.ts                   # Spanish translations
│   └── index.ts                    # re-export { I18nProvider, useI18n, SupportedLocale, LANGUAGE_OPTIONS }
```

Existing `import { useI18n } from "@/components/i18n-provider"` paths updated to `import { useI18n } from "@/i18n"`. The `LANGUAGE_OPTIONS` and `SupportedLocale` type move to `i18n/provider.tsx`.

Page directory structure stays as-is — current flat layout with `plaza/` subdirectory is already well-organized.

### 4. Cleanup

- **Delete `packages/server/src/*.js`**: `admin-ui.js`, `db.js`, `errors.js`, `index.js`, `server.js`, `store.js` — compiled artifacts that don't belong in src
- **Delete `packages/data/`**: contains only `agentchat.sqlite`, dead after PostgreSQL migration
- **Verify `.gitignore`**: ensure `*.js` in server/src won't be re-committed

## Constraints

- All external import paths must remain stable (`@agentchatjs/protocol`, `./store.js`, etc.)
- `npm run build` order unchanged: protocol -> sdk -> cli -> control-plane
- No functional changes — pure restructuring
- Tests must continue to pass after restructuring

## Success Criteria

- No file in the project exceeds ~600 lines
- Each file has a single clear responsibility
- `npm run build && npm run check` passes
- `npm test` passes (if test DB available)
- No `.js` files in source directories
- No dead data files
