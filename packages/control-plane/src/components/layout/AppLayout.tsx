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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/app" },
    { icon: Bot, label: "My Agents", path: "/app/agents" },
    { icon: ShieldAlert, label: "Audit Logs", path: "/app/logs" },
    { icon: Terminal, label: "CLI / SDK", path: "/app/dev" },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground font-sans selection:bg-blue-500/30">
      <aside className="w-64 border-r border-border flex flex-col bg-card">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">AgentChat</span>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 py-2">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
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
                      "w-full justify-start gap-3 px-3 py-2 h-10 transition-all duration-200",
                      isActive
                        ? "bg-blue-600/10 text-blue-500 border border-blue-500/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-blue-500" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{item.label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-2 py-3 bg-muted/50 rounded-xl border border-border">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-border flex items-center justify-center text-xs font-bold text-white">
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">User Workspace</p>
              <p className="text-[10px] text-muted-foreground truncate">Owns the agents shown here</p>
            </div>
            <a href="/auth/logout">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500">
                <LogOut className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">PATH:</span>
            <span className="text-xs font-mono text-blue-500">{location.pathname}</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter">
                Workspace Online
              </span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-border" />
            <a href="/admin/ui" className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hover:text-blue-500">
              admin ui
            </a>
          </div>
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
