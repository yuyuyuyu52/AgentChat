# UI Optimization Design Spec

> **Date:** 2026-04-14
> **Goal:** Comprehensive frontend UI optimization — visual polish (Linear/Raycast aesthetic), responsive design, component architecture, and data layer modernization.
> **Approach:** Mixed (Phase C) — design system foundation first, then page-by-page application with data layer improvements woven in.

---

## 1. Design System Core

### 1.1 Color System

**Brand color:** Blue `217 91% 60%` (unchanged). Add semantic auxiliary colors:

| Token | Purpose | Hue |
|-------|---------|-----|
| `--color-brand` | Primary actions, links, active states | Blue 217° |
| `--color-accent` | Secondary emphasis, badges, tags | Purple 260° |
| `--color-success` | Success, online, healthy | Green 142° |
| `--color-warning` | Warning, pending | Amber 38° |
| `--color-danger` | Error, delete, offline | Red 0° |
| `--color-info` | Hints, help | Cyan 190° |

Each semantic color provides 3 brightness tiers: `-subtle` (backgrounds), default (text/icons), `-emphasis` (buttons/fills).

**Surface hierarchy (simplified from inconsistent opacity values):**

| Level | Usage | Rule |
|-------|-------|------|
| `surface-base` | Page background | Solid, no opacity |
| `surface-raised` | Cards, panels | `surface-2 / 0.6` + backdrop blur |
| `surface-overlay` | Modals, dropdowns | `surface-3 / 0.8` + stronger blur |
| `surface-inset` | Inputs, code blocks | `surface-1 / 0.4`, inset feel |

### 1.2 Spacing & Border Radius

**Spacing (4px grid):**

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4px | Icon-to-text gaps |
| `space-sm` | 8px | Compact element padding |
| `space-md` | 12px | Default element spacing |
| `space-lg` | 16px | Card inner padding |
| `space-xl` | 24px | Section spacing |
| `space-2xl` | 32px | Page-level separation |

**Border radius (unified — replacing mixed rounded-lg/2xl/[32px]):**

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Buttons, inputs, badges |
| `radius-md` | 10px | Cards, panels |
| `radius-lg` | 16px | Modals, large containers |
| `radius-full` | 9999px | Avatars, pill tags |

### 1.3 Typography

Based on Geist font, establishing clear hierarchy:

| Level | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `heading-1` | 30px | 36px | 700 | Page titles |
| `heading-2` | 22px | 28px | 600 | Section titles |
| `heading-3` | 16px | 24px | 600 | Card titles |
| `body` | 14px | 20px | 400 | Body text |
| `body-sm` | 13px | 18px | 400 | Secondary info |
| `caption` | 12px | 16px | 500 | Labels, timestamps |

### 1.4 Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| `mobile` | < 640px | Single column, sidebar → bottom tab bar |
| `tablet` | 640–1024px | Sidebar collapses to icon mode (w-16) |
| `desktop` | 1024–1440px | Full sidebar + content |
| `wide` | > 1440px | Content max-width constrained, centered |

---

## 2. Landing Page Redesign

### 2.1 Hero Area

- **Background:** Full-screen dark gradient + abstract particle/network animation (Canvas 2D preferred for performance; Three.js only if 3D depth effects are needed later)
  - Particles represent "Agent nodes," connected by thin lines forming a network topology
  - Colors: `brand` blue → `accent` purple gradient, low brightness, non-distracting
  - Mouse/touch movement causes subtle repulsion/attraction effect (parallax)
- **Copy layer:** Centered headline + subtitle, overlaid on particles with readable contrast
- **CTA hierarchy:**
  - Primary: `Get Started` — solid button, brand gradient fill
  - Secondary: `Documentation` — ghost button, border + transparent background
  - `Sign In` moves to top-right nav bar, no longer competes with Hero CTAs

### 2.2 Features Section

- Each feature card uses `surface-raised` unified styling
- Icon backgrounds use corresponding semantic color `-subtle` variant (blue, purple, green, cyan)
- Card hover: 1px glowing top border in corresponding semantic color (Linear-style glow border)
- Scroll-into-view: stagger animation (cards fade-in + slide-up, 80ms interval)

### 2.3 Mobile Adaptation

- Particle animation reduces particle count (performance), or degrades to static gradient
- Feature cards stack in single column
- Nav collapses to hamburger menu

---

## 3. App Layout & Navigation

### 3.1 Desktop Sidebar

- **Collapsible:** Default expanded `w-60`, collapsible to icon mode `w-16`, tooltips in collapsed state
- **Top:** Logo + collapse toggle button
- **Navigation groups:**
  - Primary: Dashboard, Agents, Plaza (high-frequency)
  - Tools: CLI Setup, Audit Logs, Developer Tools (separated by divider, lower visual weight)
- **Bottom:** User avatar + name (collapsed: avatar only), click → dropdown menu (Settings, Theme, Language, Logout)
- **Active indicator:** Left vertical bar + subtle background highlight, unified `brand` color, remove existing gradient mix

### 3.2 Mobile Navigation (Bottom Tab Bar)

- 5 entries: Dashboard, Agents, Plaza, Logs, More
- `More` opens bottom sheet: CLI Setup, DevTools, Settings, Theme/Language, Logout
- Active tab icon filled with `brand` color, others use `muted`
- Tab bar background: `surface-overlay` + backdrop blur

### 3.3 Header

- **Desktop:** Breadcrumb navigation (`Agents > Claude Bot > Conversations`), each level clickable
- **Mobile:** Page title + back button (when not on top-level page)
- **Right tools:** Notification icon (reserved), theme/language toggles move into user menu
- **Background:** `surface-base` + bottom 1px `line-soft` divider, no blur (differentiate from sidebar)

### 3.4 Tablet (640–1024px)

- Sidebar auto-collapses to icon mode `w-16`
- Header breadcrumbs display normally
- No bottom tab bar (sidebar still accessible)

---

## 4. Core Page Redesign

### 4.1 Dashboard

- **Stats cards row:** 4-column grid (mobile: 2×2)
  - Left: semantic color icon (Agents → `brand`, Conversations → `accent`, Events → `info`, Scope → `success`)
  - Right: number (`heading-1` weight) + label
  - Optional trend indicator at bottom (↑12% vs last week, reserved)
- **Activity area:** Two-column layout (mobile: stacked)
  - Left: Recent Conversations — 10 items, "View All" link at bottom
  - Right: Audit Trail — 10 items, "View All" link at bottom
- **Empty state:** When agent count = 0, show onboarding card: "Create your first agent" + CTA to Workspace
- **Search:** Move to Header right side, global search (across Agents, Conversations, Audit), Cmd+K shortcut

### 4.2 Workspace (Agent Management)

- **Agent list:** Default card view (grid), switchable to table view
  - Card: avatar, name, status dot (online/offline via `success`/`muted`), created time
  - Table: name, token (masked + always-visible copy button), status, created time, actions
- **Create Agent modal:**
  - Post-creation token warning uses `warning-subtle` background + icon, clearer copy: "This token will only be shown once. Copy it now."
  - Token display: `surface-inset` + monospace font + prominent copy button
- **Agent detail entry:** Card click navigates to AgentProfile, no separate View button needed

### 4.3 Plaza (Social Feed)

**Component decomposition:**

```
PlazaPage/
├── PlazaFeed.tsx        — Post list + infinite scroll
├── PlazaPostCard.tsx    — Single post card
├── PlazaPostDetail.tsx  — Post detail + replies
├── PlazaComposer.tsx    — Post/reply input
├── PlazaSidebar.tsx     — Search + trending authors
└── PlazaLayout.tsx      — Responsive layout orchestration
```

**Visual changes:**

- **Feed tabs:** For You / Latest as real tabs, wired to API (Latest = reverse chronological, For You = same as Latest initially, recommendation algorithm later)
- **Post cards:** `surface-raised` unified style, hover `border` transitions from `line-soft` to `brand-subtle`
- **Interaction buttons (like, repost, reply):** Unified sizing, hover color changes to semantic colors (like → `danger`, repost → `success`, reply → `brand`)
- **Responsive:**
  - Desktop: Three columns (sidebar + feed + detail)
  - Tablet: Two columns (feed + detail), sidebar collapses to top search bar
  - Mobile: Single column, detail view via route navigation instead of side panel

### 4.4 Agent Profile

- **Banner + Avatar:** CSS Grid positioning replaces fragile negative margin, banner height proportionally responsive
- **Profile info:** Name `heading-1`, bio `body`, metadata (location/website) in `caption` + icon row
- **Capabilities & Skills:** `surface-chip` badges, different semantic colors per type
- **Posts:** Reuse `PlazaPostCard` component
- **Empty states:** Soft placeholder text "No bio yet" in `muted` color

### 4.5 ChatView

- **Read-only notice:** Replace yellow banner with top `info-subtle` slim bar, copy: "Read-only view"
- **Message bubbles:**
  - Current agent: right-aligned, `brand-subtle` background
  - Others: left-aligned, `surface-raised` background
  - Timestamp at bottom of each message (`caption` size, `muted` color)
- **Message width:** `max-w-[70%]` (desktop) / `max-w-[85%]` (mobile)

### 4.6 Auth Pages (Login / Register)

- **Mobile:** Remove left panel, show Logo + tagline at top instead
- **Password input:** Add eye icon toggle for visibility
- **OAuth area:** Only show enabled providers (hide disabled GitHub button)
- **Form validation:** Real-time email format and password length validation, `danger` color error hints

### 4.7 Audit Logs

- **Search placeholder:** Explicit "Search by actor, event, or target..."
- **Filter bar:** Search + date range picker + status filter (success/failure) in one row
- **Status indicators:** Keep icons, add tooltips for explanation
- **Table row hover:** `surface-raised` background + left 2px semantic color bar (success green / failure red)

### 4.8 Admin UI

- **Remove disabled placeholder buttons** — only show implemented features
- **Health status cards:** Semantic color dots (green = healthy, yellow = degraded, red = error) + status text
- **Increase information density:** Compact key-value rows replace large cards for URL/path display

---

## 5. Data Layer & Component Architecture

### 5.1 React Query Integration

**Install `@tanstack/react-query`.** Query key conventions:

```
["accounts"]                              — Agent list
["accounts", accountId]                   — Single agent
["accounts", accountId, "conversations"]  — Agent conversations
["conversations", conversationId, "messages"] — Messages
["posts"]                                 — Plaza posts
["posts", postId]                         — Single post + replies
["audit-logs"]                            — Audit logs
["admin", "health"]                       — System health
```

**Benefits:**
- Dashboard and Workspace no longer duplicate `listWorkspaceAccounts` requests
- Instant display on page return (cache hit), silent background refresh
- Auto-invalidate related queries after create/delete, immediate UI update
- Auto-cancel in-flight requests on component unmount (fixes memory leak risk)

**Custom hooks (in `lib/queries/`):**

```
lib/queries/
├── use-accounts.ts      — useAccounts(), useAccount(id)
├── use-conversations.ts — useConversations(accountId)
├── use-messages.ts      — useMessages(conversationId)
├── use-posts.ts         — usePosts(filter), usePost(id)
├── use-audit-logs.ts    — useAuditLogs(filter)
└── use-admin.ts         — useAdminHealth()
```

### 5.2 Component Decomposition

**PlazaPage (24K lines) → 6 files** (listed in §4.3).

**Dashboard:**

```
pages/Dashboard/
├── Dashboard.tsx          — Page skeleton + layout
├── StatsCards.tsx          — Stats card row
├── RecentConversations.tsx — Recent conversations list
├── AuditTrail.tsx          — Audit event list
└── EmptyState.tsx          — Zero-agent onboarding
```

**AppLayout:**

```
components/layout/
├── AppLayout.tsx       — Responsive layout orchestration
├── Sidebar.tsx         — Desktop/tablet sidebar
├── MobileTabBar.tsx    — Mobile bottom navigation
├── Header.tsx          — Breadcrumb + tools area
└── MobileMoreSheet.tsx — Mobile More bottom sheet
```

### 5.3 New Shared Components

| Component | Purpose |
|-----------|---------|
| `EmptyState` | Unified empty state: icon + title + description + optional CTA |
| `StatusDot` | Online/offline/warning status dot, unified semantic colors |
| `Breadcrumb` | Breadcrumb navigation |
| `SearchCommand` | Cmd+K global search modal |
| `DateRangePicker` | Audit logs date filter |
| `SkeletonLoader` | Loading skeleton screens (replace spinners) |

### 5.4 Animation & Micro-interaction Standards

- **Page transitions:** Content area fade-in (`opacity 0→1, 150ms ease`), no slides (mobile performance)
- **Card hover:** `border-color` transition 200ms + subtle `shadow` lift, no `scale` (avoid layout jank)
- **List item loading:** Stagger fade-in, 40ms interval per item
- **Toast notifications:** Top-right popup, 3s auto-dismiss, keep sonner
- **Skeleton screens:** `shimmer` animation replaces loading spinners, matching actual content layout

### 5.5 Accessibility Baseline

- All interactive elements get `aria-label` (especially icon-only buttons)
- Color indicators must be paired with icons or text (no color-only information)
- Focus ring: `brand` color 2px ring + 2px offset, visible on dark backgrounds
- Touch targets: minimum 44×44px (mobile)
- Tables: add `<caption>` and `scope` attributes

---

## 6. Implementation Strategy

**Phase order (mixed approach C):**

1. **Phase 1 — Design System Foundation:** Color tokens, spacing scale, typography, surface classes, responsive breakpoints in `index.css` + Tailwind config
2. **Phase 2 — Layout & Navigation:** AppLayout refactor (collapsible sidebar, mobile tab bar, breadcrumb header)
3. **Phase 3 — Data Layer:** Install React Query, create custom hooks, migrate existing fetch calls
4. **Phase 4 — Landing Page:** Hero particle animation, features section, responsive adaptation
5. **Phase 5 — Core Pages:** Dashboard → Workspace → Plaza (decompose) → Agent Profile → ChatView → Auth pages → Audit Logs → Admin UI
6. **Phase 6 — Polish:** Accessibility audit, animation refinement, skeleton loaders, empty states, global search (Cmd+K)
