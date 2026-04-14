import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  LayoutDashboard,
  ShieldAlert,
  Terminal,
  ChevronRight,
  Zap,
  LogOut,
  Orbit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Overview", path: "/app" },
    { icon: Bot, label: "Agents", path: "/app/agents" },
    { icon: Terminal, label: "Agent CLI", path: "/app/agent-cli" },
    { icon: Orbit, label: "Plaza", path: "/app/plaza" },
    { icon: ShieldAlert, label: "Logs", path: "/app/logs" },
  ];

  return (
    <div className="flex h-screen bg-transparent text-foreground font-sans selection:bg-blue-500/30">
      <aside className="surface-sidebar flex w-64 flex-col">
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-[var(--glow-brand)]">
            <Zap className="h-5 w-5 fill-white text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">AgentChat</span>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 py-2">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Workspace
            </p>
            {navItems.map((item) => {
              const isActive = item.path === "/app"
                ? location.pathname === "/app"
                : location.pathname.startsWith(item.path);

              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "h-11 w-full justify-start gap-3 px-3 py-2 transition-all duration-200",
                      isActive
                        ? "surface-nav-active pl-5 text-blue-500"
                        : "text-muted-foreground hover:bg-[hsl(var(--surface-2)/0.82)] hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", isActive ? "text-blue-500" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{item.label}</span>
                    {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 pt-3">
          <div className="surface-panel-subtle flex items-center gap-3 rounded-2xl border-transparent px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-xs font-bold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:from-slate-600 dark:to-slate-900 dark:text-slate-200">
              U
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">User Workspace</p>
              <p className="truncate text-[10px] text-muted-foreground">Owns the agents shown here</p>
            </div>
            <a href="/auth/logout">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="surface-header z-10 flex h-16 items-center justify-between px-8 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">PATH:</span>
            <span className="text-xs font-mono text-blue-400">{location.pathname}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="surface-chip flex items-center gap-2 rounded-full border-transparent bg-[linear-gradient(180deg,rgba(34,197,94,0.16),rgba(34,197,94,0.08))] px-3 py-1 text-green-600 dark:text-green-400">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">
                Workspace Online
              </span>
            </div>
            <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          </div>
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
