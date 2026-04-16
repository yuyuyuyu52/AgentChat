import { Link } from "react-router-dom";
import {
  Settings,
  Activity,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { useAdminHealth } from "@/lib/queries/use-admin";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/i18n";
import { ThemeToggle } from "@/components/theme-toggle";

function KeyValueRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-caption text-muted-foreground shrink-0 mr-4">{label}</span>
      <span className="text-body-sm font-mono text-foreground text-right break-all">{value ?? "—"}</span>
    </div>
  );
}

export default function AdminUI() {
  const { t } = useI18n();
  const { data: health, isLoading, isError, error, refetch, isFetching } = useAdminHealth();

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
            <Settings className="w-5 h-5 text-brand" />
            <h1 className="text-lg font-bold tracking-tight text-foreground">{t("admin.title")}</h1>
          </div>
          <Badge variant="outline" className="bg-[hsl(var(--color-brand)/0.1)] text-brand border-[hsl(var(--color-brand)/0.2)] rounded-full text-[10px] px-2">
            {t("admin.globalAdmin")}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          <Button
            className="rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className="mr-2 w-4 h-4" />
            {t("admin.refresh")}
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar — only Health section shown (only implemented feature) */}
        <div className="lg:col-span-3 space-y-1">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("admin.systemOverview")}</p>
          <Button variant="ghost" className="w-full justify-start gap-3 border border-border bg-muted/40 text-foreground">
            <Activity className="w-4 h-4 text-brand" />
            <span className="text-sm font-medium">{t("admin.healthMetrics")}</span>
          </Button>
        </div>

        {/* Main content */}
        <div className="lg:col-span-9 space-y-6">
          {/* Status card */}
          <div className="surface-raised rounded-[var(--radius-md)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading-2">{t("admin.runtimeConfiguration")}</h2>
              {isLoading ? (
                <Skeleton className="h-5 w-20 rounded-full" />
              ) : (
                <StatusDot
                  variant={health?.ok ? "online" : "error"}
                  label={health?.ok ? t("enums.healthStatus.operational") : t("enums.healthStatus.error")}
                />
              )}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <KeyValueRow label={t("admin.httpEndpoint")} value={health?.httpUrl} />
                <KeyValueRow label={t("admin.websocketEndpoint")} value={health?.wsUrl} />
                <KeyValueRow label={t("admin.database")} value={health?.databasePath} />
                <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                  <span className="text-caption text-muted-foreground shrink-0 mr-4">{t("admin.adminPasswordGate")}</span>
                  <StatusDot
                    variant={health?.adminAuthEnabled ? "online" : "warning"}
                    label={health?.adminAuthEnabled ? t("enums.healthStatus.enabled") : t("enums.healthStatus.disabled")}
                  />
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-caption text-muted-foreground shrink-0 mr-4">{t("admin.googleAuth")}</span>
                  <StatusDot
                    variant={health?.googleAuthEnabled ? "online" : "offline"}
                    label={health?.googleAuthEnabled ? t("enums.healthStatus.configured") : t("enums.healthStatus.notConfigured")}
                  />
                </div>
              </div>
            )}
          </div>

          {isError && (
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger)/0.2)] bg-[hsl(var(--color-danger)/0.05)] px-4 py-3 text-body-sm text-danger">
              {error instanceof Error ? error.message : t("admin.loadInstanceDetailsFailed")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
