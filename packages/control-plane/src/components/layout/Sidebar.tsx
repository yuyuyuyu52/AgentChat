import { Link, useLocation } from "react-router-dom";
import {
  Bot, LayoutDashboard, ShieldAlert, Terminal,
  ChevronRight, Zap, LogOut, Orbit, PanelLeftClose,
  PanelLeftOpen,
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
            window.location.href = "/auth/logout";
          }}
          title={collapsed ? t("appLayout.logout") : undefined}
          aria-label={collapsed ? t("appLayout.logout") : undefined}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>{t("appLayout.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
