import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  LayoutDashboard,
  ShieldAlert,
  Terminal,
  Settings,
  LogOut,
  ChevronRight,
  Zap,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getAdminHealth, logoutAdmin, type AdminHealth } from "@/lib/admin-api";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const [health, setHealth] = React.useState<AdminHealth | null>(null);
  const [healthError, setHealthError] = React.useState<string | null>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Bot, label: "Agents", path: "/agents" },
    { icon: ShieldAlert, label: "Audit Logs", path: "/logs" },
    { icon: Terminal, label: "CLI / SDK", path: "/dev" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const nextHealth = await getAdminHealth();
        if (active) {
          setHealth(nextHealth);
          setHealthError(null);
        }
      } catch (error) {
        if (active) {
          setHealthError(error instanceof Error ? error.message : "Failed to reach server");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logoutAdmin();
    } finally {
      window.location.assign("/admin/ui");
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-slate-200 font-sans selection:bg-blue-500/30">
      <aside className="w-64 border-r border-white/5 flex flex-col bg-[#0D0D0F]">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">AgentChat</span>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 py-2">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Control Plane
            </p>
            {navItems.map((item) => {
              const isActive = item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);

              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 px-3 py-2 h-10 transition-all duration-200",
                      isActive
                        ? "bg-blue-600/10 text-blue-400 border border-blue-500/20"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5",
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "text-slate-500")} />
                    <span className="text-sm font-medium">{item.label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-3 px-2 py-3 bg-white/5 rounded-xl border border-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">Admin Session</p>
              <p className="text-[10px] text-slate-500 truncate">Cookie-authenticated control plane</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-slate-500 hover:text-red-400"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          <div className="px-2 py-3 bg-black/30 rounded-xl border border-white/5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                Server Status
              </p>
              <RefreshCw className={cn("w-3 h-3 text-slate-600", !health && !healthError && "animate-spin")} />
            </div>
            {health ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter text-green-500">
                    Online
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate">{health.httpUrl}</p>
              </>
            ) : (
              <p className="text-[10px] text-slate-500">
                {healthError ?? "Checking daemon health..."}
              </p>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0A0A0B]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500">PATH:</span>
            <span className="text-xs font-mono text-blue-400">
              {location.pathname === "/" ? "/admin/ui" : `/admin/ui${location.pathname}`}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full border",
              health
                ? "bg-green-500/10 border-green-500/20"
                : "bg-yellow-500/10 border-yellow-500/20",
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", health ? "bg-green-500" : "bg-yellow-500")} />
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-tighter",
                health ? "text-green-500" : "text-yellow-500",
              )}>
                {health ? "Server Online" : "Syncing"}
              </span>
            </div>
            <Separator orientation="vertical" className="h-4 bg-white/10" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              {health?.wsUrl ?? "ws unavailable"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
