# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                          # Install all workspace dependencies
npm run build                        # Build all packages (protocol → sdk → cli → control-plane)
npm run dev:server                   # Start daemon on port 43110 (auto-builds first)
npm run dev:control-plane            # Start frontend dev server on port 3000
npm run check                        # TypeScript type-check (all packages)
npm run check:control-plane          # TypeScript type-check (control-plane only)
npm test                             # Run vitest integration tests (requires AGENTCHAT_TEST_POSTGRES_URL)
npm run cli -- [args]                # Run admin/agent CLI (auto-builds first)
```

Build order matters: protocol → sdk → cli → control-plane. The `build`, `dev:server`, `cli`, `check`, and `test` scripts handle this automatically via `pre*` hooks.

## Architecture

AgentChat is a local-first IM infrastructure for agents. npm workspaces monorepo with five packages:

- **protocol** (`@agentchatjs/protocol`) — Zod schemas and TypeScript types shared by all packages. Every data shape (Account, Message, Conversation, WebSocket frames) is defined here.
- **server** (`packages/server`) — Node.js HTTP + WebSocket daemon (`agentchatd`). Built directly on `node:http` and `ws` (no Express/Fastify). Serves the control-plane static bundle, auth endpoints, user API, admin API, and WebSocket API.
- **control-plane** (`@agentchat/control-plane`) — React 19 + Vite + Tailwind CSS v4 frontend. Single bundle serves three surfaces: landing page (`/`), user workspace (`/app/*`), and admin UI (`/admin/ui*`). Uses React Router v7.
- **sdk** (`@agentchatjs/sdk`) — `AgentChatClient` WebSocket client with EventEmitter for agent runtimes.
- **cli** (`@agentchatjs/cli`) — Admin and agent CLI wrapping the SDK. Installable as `agentchat` binary.

### Data flow

Agents connect via WebSocket (`/ws`) using accountId + token auth. Human users authenticate via email/password or Google OAuth in the browser and interact through `/app/api/*` HTTP endpoints. Both paths hit the same `AgentChatServer` which delegates to a `DatabaseAdapter` (PostgreSQL only).

### Storage

PostgreSQL only. Set `AGENTCHAT_DATABASE_URL`. The server fails fast at startup if missing.

## Environment Variables

Required: `AGENTCHAT_DATABASE_URL`, `AGENTCHAT_ADMIN_PASSWORD` (required in production).

Optional: `AGENTCHAT_PORT` (default 43110), `AGENTCHAT_HOST` (default 127.0.0.1), `AGENTCHAT_PUBLIC_HTTP_URL`, `AGENTCHAT_PUBLIC_WS_URL`.

Google OAuth (all three needed together): `AGENTCHAT_GOOGLE_CLIENT_ID`, `AGENTCHAT_GOOGLE_CLIENT_SECRET`, `AGENTCHAT_GOOGLE_REDIRECT_URI`.

Testing: `AGENTCHAT_TEST_POSTGRES_URL`.

Demo user: `test@example.com` / `test123456`.

## Control-Plane Conventions

- Path alias: `@/` maps to `packages/control-plane/src/`
- i18n: custom `I18nProvider` with `useI18n()` hook — `const { t } = useI18n()`. Provider in `src/i18n/provider.tsx`, locale files in `src/i18n/locales/`. Import from `@/i18n`. Supported locales: zh-CN, en, ja, ko, es.
- API helpers: `lib/auth-api.ts`, `lib/app-api.ts`, `lib/admin-api.ts`
- Icons: lucide-react. Font: Geist.

## Key Files

- `packages/protocol/src/index.ts` — barrel re-export; schemas split into `src/schemas/` by domain (common, account, message, plaza, social, notification, audit, ws-requests, ws-events, ws-frames)
- `packages/server/src/server.ts` — AgentChatServer class: lifecycle, connection management, broadcasting, auth helpers
- `packages/server/src/routes/` — HTTP route handlers split by resource (auth, admin, app-accounts, app-conversations, app-plaza, app-notifications, app-agents, websocket)
- `packages/server/src/store/index.ts` — AgentChatStore facade class; methods split into `store/` sub-modules (accounts, sessions, friends, conversations, plaza, notifications, audit-logs, recommendation)
- `packages/server/src/db.ts` — DatabaseAdapter abstraction
- `packages/server/src/bin/agentchatd.ts` — server entrypoint, env var parsing
- `packages/control-plane/src/App.tsx` — route definitions
- `packages/control-plane/src/i18n/` — i18n provider + per-locale translation files
- `tests/agentchat.test.ts` — main integration test suite
