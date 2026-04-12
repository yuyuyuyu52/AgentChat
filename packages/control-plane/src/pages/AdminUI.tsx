import React from "react";
import { Link } from "react-router-dom";
import {
  Settings,
  Users,
  Database,
  Activity,
  ShieldCheck,
  Server,
  Globe,
  ArrowLeft,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getAdminHealth, listAdminAccounts, listAdminAuditLogs, type AdminHealth } from "@/lib/admin-api";

export default function AdminUI() {
  const [health, setHealth] = React.useState<AdminHealth | null>(null);
  const [accountCount, setAccountCount] = React.useState(0);
  const [auditCount, setAuditCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [nextHealth, nextAccounts, nextAuditLogs] = await Promise.all([
        getAdminHealth(),
        listAdminAccounts(),
        listAdminAuditLogs({ limit: 50 }),
      ]);
      setHealth(nextHealth);
      setAccountCount(nextAccounts.length);
      setAuditCount(nextAuditLogs.length);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load instance details");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" />
            <h1 className="font-bold text-lg tracking-tight text-white">Instance Administration</h1>
          </div>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 rounded-full text-[10px] px-2">
            GLOBAL ADMIN
          </Badge>
        </div>
        <Button
          className="bg-white text-black hover:bg-slate-200 rounded-lg text-xs font-bold px-4"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </header>

      <div className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">System Overview</p>
            <Button variant="ghost" className="w-full justify-start gap-3 bg-white/5 text-white border border-white/10">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">Health & Metrics</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-white/5">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Account Registry</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-white/5">
              <Database className="w-4 h-4" />
              <span className="text-sm font-medium">Storage & Backups</span>
            </Button>
          </div>

          <Separator className="bg-white/5" />

          <div className="space-y-1">
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Security</p>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-white/5">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-sm font-medium">Auth Controls</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-slate-400 hover:text-white hover:bg-white/5">
              <Lock className="w-4 h-4" />
              <span className="text-sm font-medium">Session Access</span>
            </Button>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#0D0D0F] border-white/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Server className="w-5 h-5 text-blue-500" />
                  </div>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Operational</Badge>
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">HTTP Endpoint</p>
                <p className="text-sm font-mono text-white break-all">{health?.httpUrl ?? "loading..."}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0D0D0F] border-white/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Users className="w-5 h-5 text-purple-500" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">accounts</span>
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Total Accounts</p>
                <p className="text-2xl font-bold text-white">{accountCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0D0D0F] border-white/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Globe className="w-5 h-5 text-orange-500" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">events</span>
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Recent Audit Events</p>
                <p className="text-2xl font-bold text-white">{auditCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#0D0D0F] border-white/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-white">Runtime Configuration</CardTitle>
              <CardDescription className="text-slate-500">
                Server-reported configuration surfaced directly from the daemon.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">WebSocket Endpoint</p>
                  <p className="text-xs text-slate-500 font-mono break-all">{health?.wsUrl ?? "loading..."}</p>
                </div>
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">live</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Database</p>
                  <p className="text-xs text-slate-500 font-mono break-all">{health?.databasePath ?? "loading..."}</p>
                </div>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">attached</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Admin Password Gate</p>
                  <p className="text-xs text-slate-500">Protects `/admin/*` APIs and the control plane shell.</p>
                </div>
                <Badge className={health?.adminAuthEnabled
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}>
                  {health?.adminAuthEnabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Google Auth</p>
                  <p className="text-xs text-slate-500">User workspace OAuth integration status.</p>
                </div>
                <Badge className={health?.googleAuthEnabled
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-slate-500/10 text-slate-400 border-white/10"}>
                  {health?.googleAuthEnabled ? "configured" : "not configured"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
