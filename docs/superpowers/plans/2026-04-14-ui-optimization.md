# UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive frontend UI overhaul — Linear/Raycast-grade visual polish, full responsive design, React Query data layer, and component decomposition.

**Architecture:** Mixed approach — build design system foundation first (colors, spacing, typography, surface tokens in CSS), then refactor layout with responsive sidebar/tab bar, introduce React Query for data management, and finally apply the new design system page-by-page.

**Tech Stack:** React 19, Tailwind CSS v4, @tanstack/react-query, Canvas 2D (particle animation), React Router v7, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-14-ui-optimization-design.md`

---

## File Structure

### New files to create:
```
packages/control-plane/src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx              — Collapsible desktop/tablet sidebar
│   │   ├── MobileTabBar.tsx         — Mobile bottom navigation
│   │   ├── Header.tsx               — Breadcrumb header
│   │   └── MobileMoreSheet.tsx      — Mobile "More" bottom sheet
│   └── ui/
│       ├── empty-state.tsx          — Reusable empty state
│       ├── status-dot.tsx           — Online/offline indicator
│       ├── breadcrumb.tsx           — Breadcrumb navigation
│       ├── skeleton.tsx             — Skeleton loading component
│       └── search-command.tsx       — Cmd+K global search modal
├── lib/
│   └── queries/
│       ├── query-client.ts          — QueryClient config
│       ├── use-accounts.ts          — Account query hooks
│       ├── use-conversations.ts     — Conversation query hooks
│       ├── use-messages.ts          — Message query hooks
│       ├── use-posts.ts             — Plaza post query hooks
│       ├── use-audit-logs.ts        — Audit log query hooks
│       └── use-admin.ts             — Admin health query hooks
├── pages/
│   └── plaza/
│       ├── PlazaLayout.tsx          — Responsive layout orchestration
│       ├── PlazaFeed.tsx            — Post list + infinite scroll
│       ├── PlazaPostCard.tsx        — Single post card
│       ├── PlazaPostDetail.tsx      — Post detail + replies
│       ├── PlazaComposer.tsx        — Post/reply input
│       └── PlazaSidebar.tsx         — Search + trending authors
└── components/
    └── landing/
        └── ParticleNetwork.tsx      — Canvas particle animation
```

### Files to modify:
```
packages/control-plane/src/index.css                    — Design tokens overhaul
packages/control-plane/src/App.tsx                      — Add QueryClientProvider, update routes
packages/control-plane/src/components/layout/AppLayout.tsx — Compose new layout components
packages/control-plane/src/components/ui/button.tsx     — Apply new radius tokens
packages/control-plane/src/components/ui/card.tsx        — Apply new surface/radius tokens
packages/control-plane/src/components/ui/input.tsx       — Apply new radius tokens
packages/control-plane/src/components/ui/badge.tsx       — Apply new radius tokens
packages/control-plane/src/components/ui/table.tsx       — Apply new surface tokens
packages/control-plane/src/components/ui/dialog.tsx      — Apply new radius tokens
packages/control-plane/src/components/ui/separator.tsx   — Apply new line tokens
packages/control-plane/src/pages/LandingPage.tsx         — Full redesign
packages/control-plane/src/pages/LoginPage.tsx           — Responsive + form improvements
packages/control-plane/src/pages/RegisterPage.tsx        — Responsive + form improvements
packages/control-plane/src/pages/Dashboard.tsx           — Redesign + React Query migration
packages/control-plane/src/pages/Workspace.tsx           — Redesign + React Query migration
packages/control-plane/src/pages/AgentProfile.tsx        — Redesign + React Query migration
packages/control-plane/src/pages/AgentConversations.tsx  — React Query migration
packages/control-plane/src/pages/ChatView.tsx            — Redesign + React Query migration
packages/control-plane/src/pages/AuditLogs.tsx           — Redesign + React Query migration
packages/control-plane/src/pages/AdminUI.tsx             — Redesign + React Query migration
packages/control-plane/src/pages/PlazaPage.tsx           — Replace with plaza/ module
packages/control-plane/package.json                      — Add @tanstack/react-query
```

---

## Phase 1: Design System Foundation

### Task 1: Color tokens and semantic colors

**Files:**
- Modify: `packages/control-plane/src/index.css:11-79` (CSS custom properties)

- [ ] **Step 1: Add semantic color tokens to light theme**

In `index.css`, after the existing `:root` custom properties (around line 43), add the semantic color tokens. Find the `:root` block and add these after the existing variables:

```css
/* Semantic colors - light theme */
--color-brand: 217 91% 60%;
--color-brand-subtle: 217 91% 95%;
--color-brand-emphasis: 217 91% 50%;
--color-accent: 260 60% 55%;
--color-accent-subtle: 260 60% 94%;
--color-accent-emphasis: 260 60% 45%;
--color-success: 142 71% 45%;
--color-success-subtle: 142 71% 93%;
--color-success-emphasis: 142 71% 35%;
--color-warning: 38 92% 50%;
--color-warning-subtle: 38 92% 93%;
--color-warning-emphasis: 38 92% 40%;
--color-danger: 0 84% 60%;
--color-danger-subtle: 0 84% 95%;
--color-danger-emphasis: 0 84% 50%;
--color-info: 190 80% 45%;
--color-info-subtle: 190 80% 93%;
--color-info-emphasis: 190 80% 35%;
```

- [ ] **Step 2: Add semantic color tokens to dark theme**

In the `.dark` block (around line 46-79), add the dark-mode versions:

```css
/* Semantic colors - dark theme */
--color-brand: 217 91% 60%;
--color-brand-subtle: 217 40% 15%;
--color-brand-emphasis: 217 91% 65%;
--color-accent: 260 60% 65%;
--color-accent-subtle: 260 30% 15%;
--color-accent-emphasis: 260 60% 70%;
--color-success: 142 71% 50%;
--color-success-subtle: 142 30% 14%;
--color-success-emphasis: 142 71% 55%;
--color-warning: 38 92% 55%;
--color-warning-subtle: 38 40% 14%;
--color-warning-emphasis: 38 92% 60%;
--color-danger: 0 84% 62%;
--color-danger-subtle: 0 40% 14%;
--color-danger-emphasis: 0 84% 67%;
--color-info: 190 80% 50%;
--color-info-subtle: 190 30% 14%;
--color-info-emphasis: 190 80% 55%;
```

- [ ] **Step 3: Verify theme switching works**

Run: `cd packages/control-plane && npm run check`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/index.css
git commit -m "feat(design-system): add semantic color tokens (brand, accent, success, warning, danger, info)"
```

---

### Task 2: Spacing, typography, and radius tokens

**Files:**
- Modify: `packages/control-plane/src/index.css`

- [ ] **Step 1: Add spacing, radius, and typography tokens to @theme**

At the top of `index.css`, after the font imports (after line 7), add a `@theme` block to define custom Tailwind tokens:

```css
@theme {
  /* Spacing scale (4px grid) */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;

  /* Radius scale */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Typography */
  --font-size-heading-1: 30px;
  --line-height-heading-1: 36px;
  --font-size-heading-2: 22px;
  --line-height-heading-2: 28px;
  --font-size-heading-3: 16px;
  --line-height-heading-3: 24px;
  --font-size-body: 14px;
  --line-height-body: 20px;
  --font-size-body-sm: 13px;
  --line-height-body-sm: 18px;
  --font-size-caption: 12px;
  --line-height-caption: 16px;
}
```

- [ ] **Step 2: Add typography utility classes**

In `index.css`, add a `@layer utilities` block after the theme block:

```css
@layer utilities {
  .text-heading-1 {
    font-size: var(--font-size-heading-1);
    line-height: var(--line-height-heading-1);
    font-weight: 700;
  }
  .text-heading-2 {
    font-size: var(--font-size-heading-2);
    line-height: var(--line-height-heading-2);
    font-weight: 600;
  }
  .text-heading-3 {
    font-size: var(--font-size-heading-3);
    line-height: var(--line-height-heading-3);
    font-weight: 600;
  }
  .text-body {
    font-size: var(--font-size-body);
    line-height: var(--line-height-body);
    font-weight: 400;
  }
  .text-body-sm {
    font-size: var(--font-size-body-sm);
    line-height: var(--line-height-body-sm);
    font-weight: 400;
  }
  .text-caption {
    font-size: var(--font-size-caption);
    line-height: var(--line-height-caption);
    font-weight: 500;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/index.css
git commit -m "feat(design-system): add spacing, radius, and typography tokens"
```

---

### Task 3: Unified surface classes

**Files:**
- Modify: `packages/control-plane/src/index.css:154-300` (surface classes)

- [ ] **Step 1: Replace surface classes with new 4-tier system**

Replace the existing surface classes (lines 154-300) with the new unified surface system. Keep existing class names as aliases where possible to avoid breaking all pages at once:

```css
@layer components {
  /* === New 4-tier surface system === */
  .surface-base {
    background-color: hsl(var(--background));
  }

  .surface-raised {
    background: linear-gradient(
      135deg,
      hsl(var(--surface-2) / 0.6) 0%,
      hsl(var(--surface-3) / 0.4) 100%
    );
    backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--line-soft) / 0.5);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .surface-raised:hover {
    border-color: hsl(var(--line-soft) / 0.8);
    box-shadow: 0 2px 8px hsl(var(--shadow-float));
  }

  .surface-overlay {
    background: linear-gradient(
      135deg,
      hsl(var(--surface-3) / 0.8) 0%,
      hsl(var(--surface-2) / 0.7) 100%
    );
    backdrop-filter: blur(20px);
    border: 1px solid hsl(var(--line-soft) / 0.6);
  }

  .surface-inset {
    background: hsl(var(--surface-1) / 0.4);
    border: 1px solid hsl(var(--line-soft) / 0.3);
    box-shadow: inset 0 1px 3px hsl(var(--shadow-soft));
  }

  /* === Aliases for backward compatibility (remove after migration) === */
  .surface-panel {
    @apply surface-raised;
  }
  .surface-panel-subtle {
    @apply surface-raised;
  }
  .surface-float {
    @apply surface-overlay;
  }

  /* === Sidebar (kept, refined) === */
  .surface-sidebar {
    background: linear-gradient(
      180deg,
      hsl(var(--surface-2) / 0.6) 0%,
      hsl(var(--surface-1) / 0.4) 100%
    );
    backdrop-filter: blur(16px);
    border-right: 1px solid hsl(var(--line-soft) / 0.5);
  }

  /* === Header === */
  .surface-header {
    background: hsl(var(--background));
    border-bottom: 1px solid hsl(var(--line-soft) / 0.5);
  }

  /* === Input === */
  .surface-input {
    background: hsl(var(--surface-1) / 0.4);
    border: 1px solid hsl(var(--line-soft) / 0.4);
    box-shadow: inset 0 1px 2px hsl(var(--shadow-soft));
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .surface-input:focus-within {
    border-color: hsl(var(--color-brand));
    box-shadow: 0 0 0 2px hsl(var(--color-brand) / 0.15);
  }

  /* === Chip / Badge === */
  .surface-chip {
    background: hsl(var(--surface-2) / 0.5);
    border: 1px solid hsl(var(--line-soft) / 0.4);
    border-radius: var(--radius-full);
    padding: 2px 10px;
    font-size: var(--font-size-caption);
    line-height: var(--line-height-caption);
  }

  /* === Navigation active === */
  .surface-nav-active {
    background: linear-gradient(
      90deg,
      hsl(var(--color-brand) / 0.12) 0%,
      transparent 100%
    );
    border-left: 2px solid hsl(var(--color-brand));
  }

  /* === Hover lift === */
  .surface-hover-lift {
    transition: transform 200ms ease, box-shadow 200ms ease;
  }
  .surface-hover-lift:hover {
    box-shadow: 0 4px 12px hsl(var(--shadow-float));
  }

  /* === Semantic color backgrounds === */
  .bg-brand-subtle { background-color: hsl(var(--color-brand-subtle)); }
  .bg-accent-subtle { background-color: hsl(var(--color-accent-subtle)); }
  .bg-success-subtle { background-color: hsl(var(--color-success-subtle)); }
  .bg-warning-subtle { background-color: hsl(var(--color-warning-subtle)); }
  .bg-danger-subtle { background-color: hsl(var(--color-danger-subtle)); }
  .bg-info-subtle { background-color: hsl(var(--color-info-subtle)); }

  .text-brand { color: hsl(var(--color-brand)); }
  .text-accent { color: hsl(var(--color-accent)); }
  .text-success { color: hsl(var(--color-success)); }
  .text-warning { color: hsl(var(--color-warning)); }
  .text-danger { color: hsl(var(--color-danger)); }
  .text-info { color: hsl(var(--color-info)); }

  .border-brand { border-color: hsl(var(--color-brand)); }
  .border-brand-subtle { border-color: hsl(var(--color-brand) / 0.3); }

  /* === Skeleton shimmer === */
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .skeleton {
    background: linear-gradient(
      90deg,
      hsl(var(--surface-2) / 0.4) 25%,
      hsl(var(--surface-3) / 0.6) 50%,
      hsl(var(--surface-2) / 0.4) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: var(--radius-sm);
  }
}
```

- [ ] **Step 2: Type-check and visual verify**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/index.css
git commit -m "feat(design-system): replace surface classes with unified 4-tier system"
```

---

### Task 4: Shared UI components (EmptyState, StatusDot, Skeleton, Breadcrumb)

**Files:**
- Create: `packages/control-plane/src/components/ui/empty-state.tsx`
- Create: `packages/control-plane/src/components/ui/status-dot.tsx`
- Create: `packages/control-plane/src/components/ui/skeleton.tsx`
- Create: `packages/control-plane/src/components/ui/breadcrumb.tsx`

- [ ] **Step 1: Create EmptyState component**

```tsx
// packages/control-plane/src/components/ui/empty-state.tsx
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="mb-4 text-muted-foreground/60">{icon}</div>
      <h3 className="text-heading-3 text-foreground mb-1">{title}</h3>
      {description && <p className="text-body-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create StatusDot component**

```tsx
// packages/control-plane/src/components/ui/status-dot.tsx
import { cn } from "@/lib/utils";

type StatusDotVariant = "online" | "offline" | "warning" | "error";

interface StatusDotProps {
  variant: StatusDotVariant;
  label?: string;
  className?: string;
}

const variantClasses: Record<StatusDotVariant, string> = {
  online: "bg-[hsl(var(--color-success))]",
  offline: "bg-muted-foreground/40",
  warning: "bg-[hsl(var(--color-warning))]",
  error: "bg-[hsl(var(--color-danger))]",
};

export function StatusDot({ variant, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("size-2 rounded-full shrink-0", variantClasses[variant])}
        aria-label={label ?? variant}
      />
      {label && <span className="text-caption text-muted-foreground">{label}</span>}
    </span>
  );
}
```

- [ ] **Step 3: Create Skeleton component**

```tsx
// packages/control-plane/src/components/ui/skeleton.tsx
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("surface-raised rounded-[var(--radius-md)] p-4 space-y-3", className)}>
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}
```

- [ ] **Step 4: Create Breadcrumb component**

```tsx
// packages/control-plane/src/components/ui/breadcrumb.tsx
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-body-sm", className)}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
          )}
          {item.href && index < items.length - 1 ? (
            <Link
              to={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors truncate"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/components/ui/empty-state.tsx \
       packages/control-plane/src/components/ui/status-dot.tsx \
       packages/control-plane/src/components/ui/skeleton.tsx \
       packages/control-plane/src/components/ui/breadcrumb.tsx
git commit -m "feat(design-system): add EmptyState, StatusDot, Skeleton, Breadcrumb components"
```

---

## Phase 2: Layout & Navigation

### Task 5: Collapsible Sidebar component

**Files:**
- Create: `packages/control-plane/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar component**

```tsx
// packages/control-plane/src/components/layout/Sidebar.tsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot, LayoutDashboard, ShieldAlert, Terminal,
  ChevronRight, Zap, LogOut, Orbit, PanelLeftClose,
  PanelLeftOpen, Code2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

const primaryNav = [
  { icon: LayoutDashboard, labelKey: "appLayout.nav.overview", path: "/app" },
  { icon: Bot, labelKey: "appLayout.nav.agents", path: "/app/agents" },
  { icon: Orbit, labelKey: "appLayout.nav.plaza", path: "/app/plaza" },
];

const toolsNav = [
  { icon: Terminal, labelKey: "appLayout.nav.agentCli", path: "/app/agent-cli" },
  { icon: ShieldAlert, labelKey: "appLayout.nav.logs", path: "/app/logs" },
  { icon: Code2, labelKey: "appLayout.nav.devTools", path: "/developers" },
];

export function Sidebar({ collapsed, onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const { t } = useI18n();

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  const NavItem = ({ icon: Icon, labelKey, path }: typeof primaryNav[0]) => {
    const active = isActive(path);
    return (
      <Link
        to={path}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] transition-colors text-body-sm",
          active
            ? "surface-nav-active text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-2)/0.4)]"
        )}
        title={collapsed ? t(labelKey) : undefined}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{t(labelKey)}</span>}
        {!collapsed && active && <ChevronRight className="size-3.5 ml-auto text-muted-foreground" />}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col surface-sidebar h-full transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Link to="/app" className="flex items-center gap-2 shrink-0">
          <div className="size-8 rounded-[var(--radius-sm)] bg-[hsl(var(--color-brand))] flex items-center justify-center">
            <Zap className="size-4 text-white" />
          </div>
          {!collapsed && <span className="font-semibold text-body">AgentChat</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("ml-auto shrink-0", collapsed && "mx-auto mt-1")}
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {primaryNav.map((item) => (
          <NavItem key={item.path} {...item} />
        ))}

        {/* Divider */}
        <div className="my-3 mx-1 h-px bg-[hsl(var(--line-soft)/0.4)]" />

        {toolsNav.map((item) => (
          <NavItem key={item.path} {...item} />
        ))}
      </nav>

      {/* User area */}
      <div className="px-2 py-3 border-t border-[hsl(var(--line-soft)/0.4)]">
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-body-sm text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-2)/0.4)] transition-colors"
          onClick={() => {
            document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/auth/login";
          }}
          title={collapsed ? t("appLayout.logout") : undefined}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>{t("appLayout.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/layout/Sidebar.tsx
git commit -m "feat(layout): add collapsible Sidebar component"
```

---

### Task 6: Mobile Tab Bar and More Sheet

**Files:**
- Create: `packages/control-plane/src/components/layout/MobileTabBar.tsx`
- Create: `packages/control-plane/src/components/layout/MobileMoreSheet.tsx`

- [ ] **Step 1: Create MobileTabBar**

```tsx
// packages/control-plane/src/components/layout/MobileTabBar.tsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Bot, Orbit, ShieldAlert, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: LayoutDashboard, labelKey: "appLayout.nav.overview", path: "/app" },
  { icon: Bot, labelKey: "appLayout.nav.agents", path: "/app/agents" },
  { icon: Orbit, labelKey: "appLayout.nav.plaza", path: "/app/plaza" },
  { icon: ShieldAlert, labelKey: "appLayout.nav.logs", path: "/app/logs" },
];

export function MobileTabBar() {
  const location = useLocation();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 surface-overlay safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {tabs.map(({ icon: Icon, labelKey, path }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] transition-colors",
                  active ? "text-[hsl(var(--color-brand))]" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                <span className="text-[10px] font-medium">{t(labelKey)}</span>
              </Link>
            );
          })}
          <button
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] transition-colors",
              moreOpen ? "text-[hsl(var(--color-brand))]" : "text-muted-foreground"
            )}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal className="size-5" />
            <span className="text-[10px] font-medium">{t("common.more") ?? "More"}</span>
          </button>
        </div>
      </nav>
      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
```

- [ ] **Step 2: Create MobileMoreSheet**

```tsx
// packages/control-plane/src/components/layout/MobileMoreSheet.tsx
import { Link } from "react-router-dom";
import { Terminal, Code2, LogOut, Settings } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
        onClick={() => onOpenChange(false)}
      />
      {/* Sheet */}
      <div className="fixed bottom-14 inset-x-0 z-50 surface-overlay rounded-t-[var(--radius-lg)] p-4 space-y-1 animate-in slide-in-from-bottom-4">
        <SheetLink
          to="/app/agent-cli"
          icon={Terminal}
          label={t("appLayout.nav.agentCli")}
          onClick={() => onOpenChange(false)}
        />
        <SheetLink
          to="/developers"
          icon={Code2}
          label={t("appLayout.nav.devTools") ?? "Developer Tools"}
          onClick={() => onOpenChange(false)}
        />

        <div className="my-2 h-px bg-[hsl(var(--line-soft)/0.4)]" />

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-body-sm text-muted-foreground">{t("theme.switchToLight") ?? "Theme"}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-body-sm text-muted-foreground">{t("language.label") ?? "Language"}</span>
          <LanguageSwitcher />
        </div>

        <div className="my-2 h-px bg-[hsl(var(--line-soft)/0.4)]" />

        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-body-sm text-danger hover:bg-danger-subtle transition-colors"
          onClick={() => {
            document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/auth/login";
          }}
        >
          <LogOut className="size-4" />
          {t("appLayout.logout")}
        </button>
      </div>
    </>
  );
}

function SheetLink({ to, icon: Icon, label, onClick }: {
  to: string; icon: typeof Terminal; label: string; onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-body-sm text-foreground hover:bg-[hsl(var(--surface-2)/0.4)] transition-colors"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/components/layout/MobileTabBar.tsx \
       packages/control-plane/src/components/layout/MobileMoreSheet.tsx
git commit -m "feat(layout): add MobileTabBar and MobileMoreSheet components"
```

---

### Task 7: Header component with Breadcrumb

**Files:**
- Create: `packages/control-plane/src/components/layout/Header.tsx`

- [ ] **Step 1: Create Header component**

```tsx
// packages/control-plane/src/components/layout/Header.tsx
import { useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  const { t } = useI18n();
  const segments = location.pathname.split("/").filter(Boolean);

  // Map known paths to labels
  const labelMap: Record<string, string> = {
    app: t("appLayout.nav.overview"),
    agents: t("appLayout.nav.agents"),
    plaza: t("appLayout.nav.plaza"),
    logs: t("appLayout.nav.logs"),
    "agent-cli": t("appLayout.nav.agentCli"),
    conversations: t("agentConversations.title") ?? "Conversations",
  };

  const items: BreadcrumbItem[] = [];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    if (segment === "app" && i === 0) continue; // Skip "app" root

    const label = labelMap[segment] ?? segment;
    const isLast = i === segments.length - 1;

    items.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  }

  return items;
}

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const breadcrumbs = useBreadcrumbs();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <header className={cn("surface-header h-12 flex items-center gap-3 px-4 shrink-0", className)}>
      {/* Mobile: back button + page title */}
      <div className="md:hidden flex items-center gap-2 flex-1 min-w-0">
        {breadcrumbs.length > 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => window.history.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <span className="text-heading-3 truncate">
          {breadcrumbs[breadcrumbs.length - 1]?.label ?? ""}
        </span>
      </div>

      {/* Desktop: breadcrumb */}
      <div className="hidden md:flex flex-1 min-w-0">
        <Breadcrumb items={breadcrumbs} />
      </div>

      {/* Right tools (desktop only — mobile tools are in MobileMoreSheet) */}
      <div className="hidden md:flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/layout/Header.tsx
git commit -m "feat(layout): add Header component with breadcrumb navigation"
```

---

### Task 8: Refactor AppLayout to compose new layout components

**Files:**
- Modify: `packages/control-plane/src/components/layout/AppLayout.tsx` (full rewrite)

- [ ] **Step 1: Rewrite AppLayout**

Replace the entire content of `AppLayout.tsx` with:

```tsx
// packages/control-plane/src/components/layout/AppLayout.tsx
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileTabBar } from "./MobileTabBar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden surface-base">
      {/* Sidebar (hidden on mobile via internal md:flex) */}
      <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile tab bar (hidden on desktop via internal md:hidden) */}
      <MobileTabBar />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Start dev server and verify layout**

Run: `cd packages/control-plane && npm run dev`

Verify in browser at `http://localhost:3000/app`:
- Desktop (>1024px): Sidebar visible on left, collapsible via button, header with breadcrumb
- Tablet (640-1024px): Sidebar starts collapsed as icon mode
- Mobile (<640px): No sidebar, bottom tab bar visible, header shows page title + back button

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/components/layout/AppLayout.tsx
git commit -m "refactor(layout): compose AppLayout from Sidebar, Header, MobileTabBar"
```

---

## Phase 3: Data Layer

### Task 9: Install React Query and create QueryClient

**Files:**
- Modify: `packages/control-plane/package.json`
- Create: `packages/control-plane/src/lib/queries/query-client.ts`
- Modify: `packages/control-plane/src/App.tsx`

- [ ] **Step 1: Install @tanstack/react-query**

Run: `cd packages/control-plane && npm install @tanstack/react-query`

- [ ] **Step 2: Create QueryClient configuration**

```tsx
// packages/control-plane/src/lib/queries/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 seconds before background refetch
      gcTime: 5 * 60_000,     // 5 minutes cache retention
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
```

- [ ] **Step 3: Add QueryClientProvider to App.tsx**

In `App.tsx`, add the import and wrap the app:

Add import at top:
```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queries/query-client";
```

Wrap the existing JSX: the `<ThemeProvider>` should be wrapped with `<QueryClientProvider client={queryClient}>`:

```tsx
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          {/* ...existing routes... */}
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/package.json \
       packages/control-plane/src/lib/queries/query-client.ts \
       packages/control-plane/src/App.tsx
git commit -m "feat(data): install React Query and add QueryClientProvider"
```

---

### Task 10: Create query hooks

**Files:**
- Create: `packages/control-plane/src/lib/queries/use-accounts.ts`
- Create: `packages/control-plane/src/lib/queries/use-conversations.ts`
- Create: `packages/control-plane/src/lib/queries/use-messages.ts`
- Create: `packages/control-plane/src/lib/queries/use-posts.ts`
- Create: `packages/control-plane/src/lib/queries/use-audit-logs.ts`
- Create: `packages/control-plane/src/lib/queries/use-admin.ts`

- [ ] **Step 1: Create use-accounts hook**

```tsx
// packages/control-plane/src/lib/queries/use-accounts.ts
import { useQuery } from "@tanstack/react-query";
import { listWorkspaceAccounts, getAccountProfile } from "@/lib/app-api";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: listWorkspaceAccounts,
  });
}

export function useAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: ["accounts", accountId],
    queryFn: () => getAccountProfile(accountId!),
    enabled: !!accountId,
  });
}
```

- [ ] **Step 2: Create use-conversations hook**

```tsx
// packages/control-plane/src/lib/queries/use-conversations.ts
import { useQuery } from "@tanstack/react-query";
import {
  listWorkspaceConversations,
  listWorkspaceConversationMessages,
} from "@/lib/app-api";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: listWorkspaceConversations,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversations", conversationId, "messages"],
    queryFn: () => listWorkspaceConversationMessages(conversationId!),
    enabled: !!conversationId,
  });
}
```

- [ ] **Step 3: Create use-posts hook**

```tsx
// packages/control-plane/src/lib/queries/use-posts.ts
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listWorkspacePlazaPosts,
  getWorkspacePlazaPost,
  listPlazaReplies,
  likePlazaPost,
  unlikePlazaPost,
  repostPlazaPost,
  unrepostPlazaPost,
  replyToPlazaPost,
} from "@/lib/app-api";

export function usePosts(filter?: { authorAccountId?: string }) {
  return useInfiniteQuery({
    queryKey: ["posts", filter],
    queryFn: ({ pageParam }) =>
      listWorkspacePlazaPosts({
        ...filter,
        limit: 20,
        ...(pageParam ?? {}),
      }),
    initialPageParam: undefined as { beforeCreatedAt?: string; beforeId?: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { beforeCreatedAt: last.createdAt, beforeId: last.id };
    },
  });
}

export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ["posts", postId],
    queryFn: () => getWorkspacePlazaPost(postId!),
    enabled: !!postId,
  });
}

export function useReplies(postId: string | undefined) {
  return useQuery({
    queryKey: ["posts", postId, "replies"],
    queryFn: () => listPlazaReplies(postId!, { limit: 20 }),
    enabled: !!postId,
  });
}

export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      liked ? unlikePlazaPost(postId) : likePlazaPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useRepostPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reposted }: { postId: string; reposted: boolean }) =>
      reposted ? unrepostPlazaPost(postId) : repostPlazaPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useReplyToPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, text }: { postId: string; text: string }) =>
      replyToPlazaPost(postId, text),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["posts", variables.postId, "replies"] });
    },
  });
}
```

- [ ] **Step 4: Create use-audit-logs hook**

```tsx
// packages/control-plane/src/lib/queries/use-audit-logs.ts
import { useQuery } from "@tanstack/react-query";
import { listWorkspaceAuditLogs } from "@/lib/app-api";

export function useAuditLogs(filter?: { limit?: number }) {
  return useQuery({
    queryKey: ["audit-logs", filter],
    queryFn: () => listWorkspaceAuditLogs(filter ?? { limit: 200 }),
  });
}
```

- [ ] **Step 5: Create use-admin hook**

```tsx
// packages/control-plane/src/lib/queries/use-admin.ts
import { useQuery } from "@tanstack/react-query";
import { getAdminHealth, listAdminAccounts, listAdminAuditLogs } from "@/lib/admin-api";

export function useAdminHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: getAdminHealth,
  });
}

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: listAdminAccounts,
  });
}

export function useAdminAuditLogs(filter?: { limit?: number }) {
  return useQuery({
    queryKey: ["admin", "audit-logs", filter],
    queryFn: () => listAdminAuditLogs(filter ?? { limit: 50 }),
  });
}
```

- [ ] **Step 6: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/lib/queries/
git commit -m "feat(data): add React Query hooks for accounts, conversations, posts, audit logs, admin"
```

---

## Phase 4: Landing Page

### Task 11: Particle network animation

**Files:**
- Create: `packages/control-plane/src/components/landing/ParticleNetwork.tsx`

- [ ] **Step 1: Create ParticleNetwork Canvas component**

```tsx
// packages/control-plane/src/components/landing/ParticleNetwork.tsx
import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface ParticleNetworkProps {
  className?: string;
  particleCount?: number;
  connectionDistance?: number;
}

export function ParticleNetwork({
  className,
  particleCount: initialCount,
  connectionDistance = 150,
}: ParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animationRef = useRef<number>(0);

  const getParticleCount = useCallback((width: number) => {
    if (initialCount) return initialCount;
    if (width < 640) return 30;
    if (width < 1024) return 50;
    return 80;
  }, [initialCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // Reinit particles on resize
      const count = getParticleCount(rect.width);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 0.5,
      }));
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      // Update positions
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        // Mouse repulsion
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120 * 0.02;
          p.vx += dx * force;
          p.vy += dy * force;
        }

        // Clamp velocity
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 1) {
          p.vx = (p.vx / speed) * 1;
          p.vy = (p.vy / speed) * 1;
        }
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.15;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(217, 91%, 60%, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        // Blue-purple gradient based on position
        const hue = 217 + (p.x / w) * 43; // 217 (blue) → 260 (purple)
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.6)`;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(animationRef.current);
    };
  }, [connectionDistance, getParticleCount]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/landing/ParticleNetwork.tsx
git commit -m "feat(landing): add Canvas particle network animation component"
```

---

### Task 12: Redesign Landing Page

**Files:**
- Modify: `packages/control-plane/src/pages/LandingPage.tsx` (full rewrite)

- [ ] **Step 1: Rewrite LandingPage with particle hero and new design**

Replace the full content of `LandingPage.tsx`:

```tsx
import { Link } from "react-router-dom";
import { Zap, Shield, Cpu, Globe, ArrowRight, MessageSquare, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/components/i18n-provider";
import { ParticleNetwork } from "@/components/landing/ParticleNetwork";

const features = [
  { icon: Cpu, colorClass: "bg-brand-subtle text-brand", titleKey: "landing.features.websocket", descKey: "landing.features.websocketDesc" },
  { icon: MessageSquare, colorClass: "bg-accent-subtle text-accent", titleKey: "landing.features.realtime", descKey: "landing.features.realtimeDesc" },
  { icon: Shield, colorClass: "bg-success-subtle text-success", titleKey: "landing.features.auth", descKey: "landing.features.authDesc" },
  { icon: Globe, colorClass: "bg-info-subtle text-info", titleKey: "landing.features.i18n", descKey: "landing.features.i18nDesc" },
];

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-dvh flex flex-col surface-base">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 surface-overlay h-14 flex items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-8 rounded-[var(--radius-sm)] bg-[hsl(var(--color-brand))] flex items-center justify-center">
            <Zap className="size-4 text-white" />
          </div>
          <span className="font-semibold text-body">AgentChat</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/developers" className="hidden md:block">
            <Button variant="ghost" size="sm">{t("landing.nav.docs") ?? "Docs"}</Button>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <Link to="/auth/login">
            <Button variant="outline" size="sm">{t("landing.nav.signIn") ?? "Sign In"}</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex items-center justify-center min-h-[80vh] pt-14 overflow-hidden">
        {/* Particle background */}
        <div className="absolute inset-0">
          <ParticleNetwork className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[hsl(var(--background))]" />
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <motion.h1
            className="text-heading-1 md:text-5xl md:leading-tight font-bold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {t("landing.hero.title") ?? "Agent Infrastructure for the Agentic Era"}
          </motion.h1>
          <motion.p
            className="mt-4 text-body md:text-lg text-muted-foreground max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            {t("landing.hero.description") ?? "Local-first IM infrastructure for AI agents. WebSocket-native, real-time, and developer-friendly."}
          </motion.p>
          <motion.div
            className="mt-8 flex items-center justify-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link to="/auth/register">
              <Button size="lg">
                {t("landing.hero.getStarted") ?? "Get Started"}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/developers">
              <Button variant="outline" size="lg">
                <Code2 className="size-4" />
                {t("landing.hero.docs") ?? "Documentation"}
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 md:px-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.titleKey}
              className="surface-raised rounded-[var(--radius-md)] p-6 group hover:border-[hsl(var(--color-brand)/0.3)] transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <div className={`size-10 rounded-[var(--radius-sm)] ${feature.colorClass} flex items-center justify-center mb-4`}>
                <feature.icon className="size-5" />
              </div>
              <h3 className="text-heading-3 mb-2">{t(feature.titleKey)}</h3>
              <p className="text-body-sm text-muted-foreground">{t(feature.descKey)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-[hsl(var(--line-soft)/0.4)] text-center">
        <p className="text-caption text-muted-foreground">
          AgentChat &mdash; {t("landing.footer.builtFor") ?? "Built for the agentic era"}
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run dev server and check `http://localhost:3000/`:
- Particle animation renders and responds to mouse
- CTA buttons are visually distinct (primary vs outline)
- Feature cards animate on scroll
- Mobile: particles reduced, cards single-column, nav has hamburger

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/LandingPage.tsx
git commit -m "feat(landing): redesign with particle network hero and unified feature cards"
```

---

## Phase 5: Core Pages

### Task 13: Redesign Dashboard

**Files:**
- Modify: `packages/control-plane/src/pages/Dashboard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Dashboard with React Query and new design**

Replace the full content of `Dashboard.tsx`. Key changes:
- Use `useAccounts()`, `useConversations()`, `useAuditLogs()` hooks
- Stat cards with semantic colors
- Two-column activity layout (10 items each)
- Empty state when no agents
- Skeleton loaders during loading

```tsx
import { Link } from "react-router-dom";
import { Bot, MessageSquare, ShieldAlert, Globe, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useAccounts } from "@/lib/queries/use-accounts";
import { useConversations } from "@/lib/queries/use-conversations";
import { useAuditLogs } from "@/lib/queries/use-audit-logs";
import { useI18n } from "@/components/i18n-provider";

const statCards = [
  { icon: Bot, labelKey: "dashboard.agents", colorClass: "bg-brand-subtle text-brand", dataKey: "agents" as const },
  { icon: MessageSquare, labelKey: "dashboard.conversations", colorClass: "bg-accent-subtle text-accent", dataKey: "conversations" as const },
  { icon: ShieldAlert, labelKey: "dashboard.auditEvents", colorClass: "bg-info-subtle text-info", dataKey: "auditEvents" as const },
  { icon: Globe, labelKey: "dashboard.scope", colorClass: "bg-success-subtle text-success", dataKey: "scope" as const },
];

export default function Dashboard() {
  const { t, formatRelativeTime } = useI18n();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: conversations, isLoading: loadingConvs } = useConversations();
  const { data: auditLogs, isLoading: loadingLogs } = useAuditLogs({ limit: 20 });

  const isLoading = loadingAccounts || loadingConvs || loadingLogs;

  const stats = {
    agents: accounts?.length ?? 0,
    conversations: conversations?.length ?? 0,
    auditEvents: auditLogs?.length ?? 0,
    scope: t("dashboard.scopeValue") ?? "workspace",
  };

  // Empty state: no agents yet
  if (!isLoading && stats.agents === 0) {
    return (
      <EmptyState
        icon={<Bot className="size-12" />}
        title={t("dashboard.emptyTitle") ?? "Create your first agent"}
        description={t("dashboard.emptyDesc") ?? "Get started by creating an agent in the workspace."}
        action={
          <Link to="/app/agents">
            <Button>
              <Plus className="size-4" />
              {t("dashboard.createAgent") ?? "Create Agent"}
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ icon: Icon, labelKey, colorClass, dataKey }) => (
          <div key={dataKey} className="surface-raised rounded-[var(--radius-md)] p-4">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <div className="flex items-start gap-3">
                <div className={`size-9 rounded-[var(--radius-sm)] ${colorClass} flex items-center justify-center shrink-0`}>
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-heading-1 leading-none">{stats[dataKey]}</p>
                  <p className="text-caption text-muted-foreground mt-1">{t(labelKey)}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Conversations */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.recentConversations") ?? "Recent Conversations"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <SkeletonCard />
            ) : (
              <>
                {conversations?.slice(0, 10).map((conv) => (
                  <Link
                    key={conv.id}
                    to={`/app/agents/${conv.ownedAgents?.[0]?.id ?? ""}/conversations/${conv.id}`}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] hover:bg-[hsl(var(--surface-2)/0.4)] transition-colors"
                  >
                    <span className="text-body-sm truncate">{conv.name ?? conv.id}</span>
                    <span className="text-caption text-muted-foreground shrink-0 ml-2">
                      {formatRelativeTime(conv.lastActivityAt ?? conv.createdAt)}
                    </span>
                  </Link>
                ))}
                {(conversations?.length ?? 0) > 10 && (
                  <Link to="/app/agents" className="flex items-center gap-1 px-3 py-2 text-caption text-brand hover:underline">
                    {t("common.viewAll") ?? "View All"} <ArrowRight className="size-3" />
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Audit Trail */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.auditTrail") ?? "Audit Trail"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <SkeletonCard />
            ) : (
              <>
                {auditLogs?.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot variant={log.status === "success" ? "online" : "error"} />
                      <span className="text-body-sm truncate">{log.event}</span>
                    </div>
                    <span className="text-caption text-muted-foreground shrink-0 ml-2">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                ))}
                {(auditLogs?.length ?? 0) > 10 && (
                  <Link to="/app/logs" className="flex items-center gap-1 px-3 py-2 text-caption text-brand hover:underline">
                    {t("common.viewAll") ?? "View All"} <ArrowRight className="size-3" />
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass (fix any type issues from API return types)

- [ ] **Step 3: Verify in browser**

Check `http://localhost:3000/app`:
- Stats cards render with semantic colors
- Skeleton loaders during data loading
- Empty state shown when no agents exist
- Two-column activity section

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): redesign with React Query, semantic color stats, skeleton loaders, empty state"
```

---

### Task 14: Redesign Workspace

**Files:**
- Modify: `packages/control-plane/src/pages/Workspace.tsx`

- [ ] **Step 1: Rewrite Workspace with React Query and new design**

Key changes vs current:
- Replace `useState` + `useEffect` fetch with `useAccounts()` hook
- Use `useMutation` for create/reset token
- Card view by default (grid), keep table toggle
- Token warning uses `warning-subtle` background
- Copy button always visible (not hover-only)
- Card click navigates to AgentProfile

Replace the full content of `Workspace.tsx` with a component that uses `useAccounts()` from the query hooks, `useMutation` from React Query for `createWorkspaceAccount` and `resetWorkspaceAccountToken`, card grid layout with `surface-raised` styling, `StatusDot` for online/offline, and the `EmptyState` component when no agents exist. Use `useQueryClient().invalidateQueries({ queryKey: ["accounts"] })` after create/reset mutations.

- [ ] **Step 2: Type-check and verify in browser**

Run: `cd packages/control-plane && npm run check`
Verify at `http://localhost:3000/app/agents`:
- Agent cards display in grid
- Token copy button always visible
- Create agent modal uses warning-subtle for token display
- Empty state when no agents

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/Workspace.tsx
git commit -m "feat(workspace): redesign with React Query, card grid, improved token UX"
```

---

### Task 15: Decompose and redesign PlazaPage

**Files:**
- Create: `packages/control-plane/src/pages/plaza/PlazaLayout.tsx`
- Create: `packages/control-plane/src/pages/plaza/PlazaFeed.tsx`
- Create: `packages/control-plane/src/pages/plaza/PlazaPostCard.tsx`
- Create: `packages/control-plane/src/pages/plaza/PlazaPostDetail.tsx`
- Create: `packages/control-plane/src/pages/plaza/PlazaComposer.tsx`
- Create: `packages/control-plane/src/pages/plaza/PlazaSidebar.tsx`
- Modify: `packages/control-plane/src/pages/PlazaPage.tsx` (replace with re-export)
- Modify: `packages/control-plane/src/App.tsx` (update import if needed)

- [ ] **Step 1: Create PlazaPostCard component**

Reusable post card used in feed and profile pages. Uses `surface-raised`, semantic color interaction buttons (like → danger, repost → success, reply → brand), `useLikePost()` and `useRepostPost()` mutations.

- [ ] **Step 2: Create PlazaComposer component**

Simple text input for reply composition. Uses `surface-inset` styling, submit button with brand color.

- [ ] **Step 3: Create PlazaPostDetail component**

Detail view for selected post. Shows post content, reply list using `useReplies()`, and `PlazaComposer` for new replies. Uses `useReplyToPost()` mutation.

- [ ] **Step 4: Create PlazaSidebar component**

Search input + trending authors section. Hidden on mobile, collapses to search bar on tablet. Uses `useDeferredValue` for search.

- [ ] **Step 5: Create PlazaFeed component**

Post list with infinite scroll using `usePosts()` infinite query hook. Feed mode tabs (For You / Latest) wired to query filter. Uses `PlazaPostCard` for each post.

- [ ] **Step 6: Create PlazaLayout component**

Responsive layout orchestration:
- Desktop: 3-column (sidebar 240px + feed flex-1 + detail 380px)
- Tablet: 2-column (feed + detail), sidebar collapsed to top search
- Mobile: single column, detail via route navigation

- [ ] **Step 7: Replace PlazaPage.tsx with new module**

Replace the entire content of `PlazaPage.tsx` with:

```tsx
export { default } from "./plaza/PlazaLayout";
```

- [ ] **Step 8: Type-check and verify**

Run: `cd packages/control-plane && npm run check`
Verify Plaza at `http://localhost:3000/app/plaza`:
- Feed loads with infinite scroll
- For You / Latest tabs work
- Post detail shows on click (desktop: side panel, mobile: route)
- Like/repost buttons show semantic colors on hover

- [ ] **Step 9: Commit**

```bash
git add packages/control-plane/src/pages/plaza/ \
       packages/control-plane/src/pages/PlazaPage.tsx
git commit -m "refactor(plaza): decompose into 6 focused components with React Query"
```

---

### Task 16: Redesign AgentProfile and AgentConversations

**Files:**
- Modify: `packages/control-plane/src/pages/AgentProfile.tsx`
- Modify: `packages/control-plane/src/pages/AgentConversations.tsx`

- [ ] **Step 1: Rewrite AgentProfile**

Key changes:
- Use `useAccount(agentId)` and `usePosts({ authorAccountId })` hooks
- CSS Grid for banner + avatar positioning (replace `-mt-16` negative margin)
- Typography hierarchy: name `heading-1`, bio `body`, metadata `caption`
- Capabilities/skills as `surface-chip` badges with semantic colors
- Reuse `PlazaPostCard` for posts
- Empty state for no bio: "No bio yet" in `muted` color
- Skeleton loading for profile and posts

- [ ] **Step 2: Migrate AgentConversations to React Query**

Replace `useState` + `useEffect` fetch pattern with `useAccounts()` and `useConversations()` hooks. Apply `surface-raised` to conversation cards, use `StatusDot` for conversation type indicators, add `Skeleton` loading state.

- [ ] **Step 3: Type-check and verify**

Run: `cd packages/control-plane && npm run check`
Verify at `http://localhost:3000/app/agents/:id` and `http://localhost:3000/app/agents/:id/conversations`

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/pages/AgentProfile.tsx \
       packages/control-plane/src/pages/AgentConversations.tsx
git commit -m "feat(profile): redesign with CSS Grid layout, React Query, semantic badges"
```

---

### Task 17: Redesign ChatView

**Files:**
- Modify: `packages/control-plane/src/pages/ChatView.tsx`

- [ ] **Step 1: Rewrite ChatView**

Key changes:
- Use `useMessages(convId)` and `useAccounts()` hooks
- Read-only notice: slim `info-subtle` bar at top instead of yellow banner
- Message bubbles: right-aligned `brand-subtle` for current agent, left `surface-raised` for others
- Timestamp at bottom of each message (`caption`, `muted`)
- Max width: `max-w-[70%]` desktop, `max-w-[85%]` mobile
- Skeleton loader during loading

- [ ] **Step 2: Type-check and verify**

Run: `cd packages/control-plane && npm run check`

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/ChatView.tsx
git commit -m "feat(chat): redesign with info-subtle readonly bar, timestamp on messages, React Query"
```

---

### Task 18: Redesign Auth pages

**Files:**
- Modify: `packages/control-plane/src/pages/LoginPage.tsx`
- Modify: `packages/control-plane/src/pages/RegisterPage.tsx`

- [ ] **Step 1: Update LoginPage**

Key changes:
- Mobile: hide left panel, show logo + tagline at top
- Add password visibility toggle (eye icon on password input)
- Hide disabled GitHub OAuth button
- Form validation: real-time email format check, password length minimum
- Error messages use `danger` color

Add state: `const [showPassword, setShowPassword] = useState(false)`

Password field JSX:
```tsx
<div className="relative">
  <Input type={showPassword ? "text" : "password"} ... />
  <button
    type="button"
    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
    onClick={() => setShowPassword(!showPassword)}
    aria-label={showPassword ? "Hide password" : "Show password"}
  >
    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
  </button>
</div>
```

Left panel responsive: wrap with `className="hidden lg:flex ..."`.
Mobile top: add logo block with `className="lg:hidden flex items-center gap-2 mb-8"`.

- [ ] **Step 2: Update RegisterPage with same changes**

Apply the same pattern: password toggle, mobile logo, hide disabled OAuth, form validation.

- [ ] **Step 3: Type-check and verify**

Run: `cd packages/control-plane && npm run check`
Verify at `http://localhost:3000/auth/login` and `/auth/register`:
- Mobile: logo at top, no left panel
- Password visibility toggle works
- No disabled GitHub button

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/pages/LoginPage.tsx \
       packages/control-plane/src/pages/RegisterPage.tsx
git commit -m "feat(auth): add password toggle, mobile responsive, hide disabled OAuth, form validation"
```

---

### Task 19: Redesign AuditLogs

**Files:**
- Modify: `packages/control-plane/src/pages/AuditLogs.tsx`

- [ ] **Step 1: Rewrite AuditLogs**

Key changes:
- Use `useAuditLogs()` hook
- Search placeholder: "Search by actor, event, or target..."
- Filter bar: search + status filter (success/failure dropdown) in one row
- Table row hover: `surface-raised` background + left 2px semantic color bar
- Status icons with tooltip (title attribute)
- Skeleton table during loading

- [ ] **Step 2: Type-check and verify**

Run: `cd packages/control-plane && npm run check`

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/AuditLogs.tsx
git commit -m "feat(audit): redesign with React Query, filter bar, semantic status indicators"
```

---

### Task 20: Redesign AdminUI

**Files:**
- Modify: `packages/control-plane/src/pages/AdminUI.tsx`

- [ ] **Step 1: Rewrite AdminUI**

Key changes:
- Use `useAdminHealth()`, `useAdminAccounts()`, `useAdminAuditLogs()` hooks
- Remove disabled placeholder sidebar buttons — only show implemented features
- Health status: `StatusDot` component (green/yellow/red) + status text
- Compact key-value rows for URL/path display
- Skeleton loading

- [ ] **Step 2: Type-check and verify**

Run: `cd packages/control-plane && npm run check`

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/AdminUI.tsx
git commit -m "feat(admin): redesign with React Query, remove disabled placeholders, compact layout"
```

---

## Phase 6: Polish

### Task 21: Accessibility improvements

**Files:**
- Modify: multiple UI component files and page files

- [ ] **Step 1: Add aria-labels to icon-only buttons**

Audit all `Button` components with `size="icon*"` variants across the codebase. Add `aria-label` to any that lack one. Key locations:
- `Sidebar.tsx` collapse button (already has)
- `Header.tsx` back button (already has)
- `ThemeToggle.tsx` (already has)
- All copy buttons in Workspace, AgentPrompt, DevTools

- [ ] **Step 2: Ensure color indicators have text/icon pairs**

Check all `StatusDot` usages have a `label` prop or adjacent text. Check that badge colors are not the sole indicator of meaning.

- [ ] **Step 3: Add focus ring styles**

In `index.css`, add to the base layer:

```css
@layer base {
  :focus-visible {
    outline: 2px solid hsl(var(--color-brand));
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: Verify touch targets**

Check all interactive elements in mobile layout meet 44×44px minimum. Key areas:
- MobileTabBar tab items (already min-w-[48px] min-h-[44px])
- Copy buttons in tables
- Close buttons in dialogs

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(a11y): add aria-labels, focus ring, color-text pairing, touch target sizing"
```

---

### Task 22: Animation refinement and skeleton loaders

**Files:**
- Modify: pages that still use loading spinners

- [ ] **Step 1: Replace all remaining loading spinners with skeleton loaders**

Search for `Loading` text or spinner animations in page components. Replace with `<Skeleton>` or `<SkeletonCard>` components. Key files:
- `AgentConversations.tsx` — skeleton cards for conversation list
- `ChatView.tsx` — skeleton message bubbles
- `AgentPrompt.tsx` — no data loading, skip
- `DevTools.tsx` — no data loading, skip

- [ ] **Step 2: Add stagger animation to list items**

In pages with lists (Dashboard activity, Workspace cards, AuditLogs rows), wrap each item with:

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ delay: index * 0.04 }}
>
  {/* item content */}
</motion.div>
```

- [ ] **Step 3: Verify animations are smooth**

Check in browser that:
- Skeleton loaders match content layout
- Stagger animations don't cause layout shift
- Page transitions are smooth 150ms fade

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(polish): replace spinners with skeleton loaders, add stagger list animations"
```

---

### Task 23: Global search (Cmd+K)

**Files:**
- Create: `packages/control-plane/src/components/ui/search-command.tsx`
- Modify: `packages/control-plane/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Create SearchCommand component**

A modal triggered by Cmd+K (or Ctrl+K). Searches across agents, conversations, and audit logs using the React Query cache. Uses `surface-overlay` styling, `surface-inset` search input, keyboard navigation.

```tsx
// packages/control-plane/src/components/ui/search-command.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bot, MessageSquare, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  id: string;
  type: "agent" | "conversation" | "audit";
  label: string;
  href: string;
}

const typeIcons = {
  agent: Bot,
  conversation: MessageSquare,
  audit: ShieldAlert,
};

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: SearchResult[] = [];

    // Search cached accounts
    const accounts = queryClient.getQueryData<any[]>(["accounts"]) ?? [];
    for (const a of accounts) {
      if (a.name?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q)) {
        items.push({ id: a.id, type: "agent", label: a.name ?? a.id, href: `/app/agents/${a.id}` });
      }
    }

    return items.slice(0, 10);
  }, [query, queryClient]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.href);
    onOpenChange(false);
    setQuery("");
  }, [navigate, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, results, selectedIndex, handleSelect, onOpenChange]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" onClick={() => onOpenChange(false)} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg surface-overlay rounded-[var(--radius-lg)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-[hsl(var(--line-soft)/0.4)]">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents, conversations..."
            className="flex-1 h-12 bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="text-caption text-muted-foreground/50 border border-[hsl(var(--line-soft)/0.4)] rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="p-2 max-h-64 overflow-y-auto">
            {results.map((result, index) => {
              const Icon = typeIcons[result.type];
              return (
                <button
                  key={result.id}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-body-sm transition-colors",
                    index === selectedIndex ? "bg-[hsl(var(--surface-2)/0.6)] text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{result.label}</span>
                  <span className="ml-auto text-caption text-muted-foreground/50">{result.type}</span>
                </button>
              );
            })}
          </div>
        )}
        {query && results.length === 0 && (
          <div className="p-8 text-center text-body-sm text-muted-foreground">No results found</div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire Cmd+K to AppLayout**

In `AppLayout.tsx`, add:

```tsx
import { useState, useEffect } from "react";
import { SearchCommand } from "@/components/ui/search-command";

// Inside the component:
const [searchOpen, setSearchOpen] = useState(false);

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen(true);
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);

// In JSX, after <MobileTabBar />:
<SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
```

- [ ] **Step 3: Type-check and verify**

Run: `cd packages/control-plane && npm run check`
Verify: Press Cmd+K on any /app page — modal opens, type to search, arrow keys navigate, Enter selects.

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/components/ui/search-command.tsx \
       packages/control-plane/src/components/layout/AppLayout.tsx
git commit -m "feat(search): add Cmd+K global search command palette"
```

---

### Task 24: Update UI component tokens

**Files:**
- Modify: `packages/control-plane/src/components/ui/button.tsx`
- Modify: `packages/control-plane/src/components/ui/card.tsx`
- Modify: `packages/control-plane/src/components/ui/input.tsx`
- Modify: `packages/control-plane/src/components/ui/dialog.tsx`
- Modify: `packages/control-plane/src/components/ui/table.tsx`
- Modify: `packages/control-plane/src/components/ui/badge.tsx`

- [ ] **Step 1: Update border-radius tokens in UI components**

Replace hardcoded `rounded-xl` with `rounded-[var(--radius-sm)]` in:
- `button.tsx`: base class `rounded-xl` → `rounded-[var(--radius-sm)]`
- `input.tsx`: `rounded-xl` → `rounded-[var(--radius-sm)]`
- `badge.tsx`: `rounded-4xl` → `rounded-[var(--radius-full)]`

Replace `rounded-xl` with `rounded-[var(--radius-md)]` in:
- `card.tsx`: `rounded-[calc(var(--radius)+8px)]` → `rounded-[var(--radius-md)]`
- `dialog.tsx` DialogContent: `rounded-xl` → `rounded-[var(--radius-md)]`

Replace in `table.tsx`:
- `bg-[hsl(var(--surface-2)/0.52)]` → use `surface-raised` class or standardize to `bg-[hsl(var(--surface-2)/0.6)]`

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/ui/
git commit -m "refactor(ui): align component tokens to design system (radius, surface)"
```

---

### Task 25: Remove backward compatibility aliases and clean up

**Files:**
- Modify: `packages/control-plane/src/index.css`

- [ ] **Step 1: Remove backward compat surface aliases**

After all pages have been migrated, remove the aliases from `index.css`:

```css
/* Remove these lines: */
.surface-panel { @apply surface-raised; }
.surface-panel-subtle { @apply surface-raised; }
.surface-float { @apply surface-overlay; }
```

- [ ] **Step 2: Search for remaining old class usage**

Run: `grep -r "surface-panel\|surface-float\|surface-section\|surface-grid-fade" packages/control-plane/src/`

If any matches remain, update them to use the new class names.

- [ ] **Step 3: Remove unused old surface class definitions**

Remove `surface-section`, `surface-grid-fade`, and any other old classes that are no longer referenced.

- [ ] **Step 4: Type-check and full build**

Run: `cd packages/control-plane && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/index.css
git commit -m "chore: remove backward-compat surface aliases and unused CSS classes"
```

---

### Task 26: Add missing i18n keys

**Files:**
- Modify: `packages/control-plane/src/components/i18n-provider.tsx`

- [ ] **Step 1: Add new translation keys**

Add these keys to all 5 locale blocks in the messages object:

```ts
// Under "common":
more: "More" / "更多" / "もっと見る" / "더보기" / "Más",
viewAll: "View All" / "查看全部" / "すべて表示" / "모두 보기" / "Ver todo",

// Under "dashboard":
emptyTitle: "Create your first agent" / "创建你的第一个 Agent" / ...,
emptyDesc: "Get started by creating an agent in the workspace." / "在工作区中创建 Agent 来开始使用。" / ...,
createAgent: "Create Agent" / "创建 Agent" / ...,
recentConversations: "Recent Conversations" / "最近的对话" / ...,
auditTrail: "Audit Trail" / "审计日志" / ...,
scopeValue: "workspace" / "工作区" / ...,

// Under "appLayout.nav":
devTools: "Developer Tools" / "开发者工具" / ...,
```

- [ ] **Step 2: Type-check**

Run: `cd packages/control-plane && npm run check`

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/i18n-provider.tsx
git commit -m "feat(i18n): add missing translation keys for new UI components"
```

---

### Task 27: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: All packages build successfully

- [ ] **Step 2: Type-check all packages**

Run: `npm run check`
Expected: No errors

- [ ] **Step 3: Visual verification in browser**

Start dev server: `npm run dev:control-plane`

Check each surface at multiple viewport widths (375px, 768px, 1280px, 1920px):
- Landing page: particle animation, hero, features
- Login / Register: mobile responsive, password toggle
- Dashboard: stats cards, activity lists, empty state
- Workspace: agent cards grid, create modal
- Plaza: feed tabs, post cards, detail panel, responsive layout
- Agent Profile: banner + avatar, capabilities badges
- ChatView: message bubbles, read-only bar
- Audit Logs: filter bar, status indicators
- Admin UI: compact layout, health dots

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: visual polish and responsive fixes from final review"
```
