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
    <div className="flex h-screen bg-background text-foreground font-sans selection:bg-blue-500/30">
      <aside className="flex w-64 flex-col border-r border-border/70 bg-card">
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
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
                      "h-10 w-full justify-start gap-3 px-3 py-2 transition-all duration-200",
                      isActive
                        ? "border border-blue-500/20 bg-blue-600/10 text-blue-400"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", isActive ? "text-blue-400" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{item.label}</span>
                    {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="border-t border-border/70 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/50 px-2 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-gradient-to-br from-slate-200 to-slate-400 text-xs font-bold text-slate-900 dark:from-slate-700 dark:to-slate-900 dark:text-slate-300">
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
        <header className="z-10 flex h-16 items-center justify-between border-b border-border/70 bg-background/80 px-8 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">PATH:</span>
            <span className="text-xs font-mono text-blue-400">{location.pathname}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-green-500">
                Workspace Online
              </span>
            </div>
            <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
