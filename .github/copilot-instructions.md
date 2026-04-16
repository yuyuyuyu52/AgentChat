# Copilot Code Review Instructions

## Project Context

AgentChat is a local-first IM infrastructure for AI agents. TypeScript monorepo (npm workspaces) with five packages: protocol (Zod schemas), server (Node.js HTTP+WS daemon), control-plane (React 19 + Vite + Tailwind v4 frontend), sdk (WebSocket client), cli (admin/agent CLI).

Database: PostgreSQL only (with pgvector). No ORM — raw SQL via a `DatabaseAdapter` abstraction.

## Review Priorities

Focus on issues that actually break things. In descending priority:

1. **Correctness** — Logic errors, race conditions, off-by-one, missing null checks on external data, broken SQL queries, wrong join conditions
2. **Security** — SQL injection (parameterized queries required), XSS, auth bypass, token leakage, missing permission checks, secrets in code
3. **Data integrity** — Missing transactions where atomicity matters, partial writes, lost updates, constraint violations
4. **Performance (only if egregious)** — N+1 queries, unbounded result sets, missing LIMIT, blocking the event loop, memory leaks from uncleaned listeners/timers
5. **API contract** — Response shape mismatches with protocol Zod schemas, breaking changes to public endpoints or SDK methods

## What NOT to Flag

Do not comment on any of the following unless they cause a real bug:

- Code style, formatting, naming conventions — we have linters for this
- Missing JSDoc/comments on self-explanatory code
- "Consider using X instead of Y" style suggestions where both are correct
- Import ordering
- Minor TypeScript type narrowing preferences (e.g. `as` vs type guard when the cast is safe)
- File length or function length unless it demonstrably causes a problem
- Suggesting abstraction/DRY for code that appears 2-3 times — premature abstraction is worse than repetition
- "Nit:" prefixed suggestions — if it's a nit, don't post it
- Missing error handling for internal code paths that can't fail
- Test coverage opinions — we decide what to test

## Project Conventions (don't flag deviations as issues)

- `@/` path alias maps to `packages/control-plane/src/`
- i18n uses custom `useI18n()` hook, not react-i18next
- Icons from lucide-react, font is Geist
- Server uses raw `node:http` + `ws`, not Express/Fastify — this is intentional
- `void somePromise.catch(() => {})` for fire-and-forget is intentional, not a missing await
- SQL uses `?` placeholders with parameter arrays (not template literals) — this is the parameterized query pattern

## How to Comment

- One comment per distinct issue. Don't stack multiple suggestions in one comment.
- State what's wrong and why it matters (what breaks). Don't just say "this could be improved."
- If proposing a fix, show the code. Don't describe it in prose.
- Severity: use `critical` for bugs/security, `warning` for likely problems, skip everything else.
- If you're not at least 80% confident something is actually wrong, don't comment.
