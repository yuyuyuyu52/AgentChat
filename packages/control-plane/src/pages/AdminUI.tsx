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
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AdminUI() {
  const { t } = useI18n();
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
      setError(nextError instanceof Error ? nextError.message : t("admin.loadInstanceDetailsFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background/85 px-8 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" />
            <h1 className="text-lg font-bold tracking-tight text-foreground">{t("admin.title")}</h1>
          </div>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 rounded-full text-[10px] px-2">
            {t("admin.globalAdmin")}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          <Button
            className="rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="mr-2 w-4 h-4" />
            {t("admin.refresh")}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="space-y-1">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("admin.systemOverview")}</p>
            <Button variant="ghost" className="w-full justify-start gap-3 border border-border bg-muted/40 text-foreground">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">{t("admin.healthMetrics")}</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">{t("admin.accountRegistry")}</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <Database className="w-4 h-4" />
              <span className="text-sm font-medium">{t("admin.storageBackups")}</span>
            </Button>
          </div>

          <Separator className="bg-muted/40" />

          <div className="space-y-1">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("admin.security")}</p>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-sm font-medium">{t("admin.authControls")}</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              <Lock className="w-4 h-4" />
              <span className="text-sm font-medium">{t("admin.sessionAccess")}</span>
            </Button>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Server className="w-5 h-5 text-blue-500" />
                  </div>
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{t("enums.healthStatus.operational")}</Badge>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">{t("admin.httpEndpoint")}</p>
                <p className="break-all text-sm font-mono text-foreground">{health?.httpUrl ?? t("common.loading")}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Users className="w-5 h-5 text-purple-500" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{t("admin.accountsUnit")}</span>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">{t("admin.totalAccounts")}</p>
                <p className="text-2xl font-bold text-foreground">{accountCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Globe className="w-5 h-5 text-orange-500" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">{t("admin.eventsUnit")}</span>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">{t("admin.recentAuditEvents")}</p>
                <p className="text-2xl font-bold text-foreground">{auditCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-foreground">{t("admin.runtimeConfiguration")}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t("admin.runtimeConfigurationDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">{t("admin.websocketEndpoint")}</p>
                  <p className="text-xs text-muted-foreground font-mono break-all">{health?.wsUrl ?? t("common.loading")}</p>
                </div>
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{t("enums.healthStatus.live")}</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">{t("admin.database")}</p>
                  <p className="text-xs text-muted-foreground font-mono break-all">{health?.databasePath ?? t("common.loading")}</p>
                </div>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{t("enums.healthStatus.attached")}</Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">{t("admin.adminPasswordGate")}</p>
                  <p className="text-xs text-muted-foreground">{t("admin.adminPasswordGateDescription")}</p>
                </div>
                <Badge className={health?.adminAuthEnabled
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}>
                  {health?.adminAuthEnabled ? t("enums.healthStatus.enabled") : t("enums.healthStatus.disabled")}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">{t("admin.googleAuth")}</p>
                  <p className="text-xs text-muted-foreground">{t("admin.googleAuthDescription")}</p>
                </div>
                <Badge className={health?.googleAuthEnabled
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-slate-500/10 text-muted-foreground border-border"}>
                  {health?.googleAuthEnabled ? t("enums.healthStatus.configured") : t("enums.healthStatus.notConfigured")}
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
