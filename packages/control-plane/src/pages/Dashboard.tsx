import { Link } from "react-router-dom";
import { Bot, MessageSquare, ShieldAlert, Globe, Plus, ArrowRight } from "lucide-react";
import type { AuditLog } from "@agentchatjs/protocol";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useAccounts } from "@/lib/queries/use-accounts";
import { useConversations } from "@/lib/queries/use-conversations";
import { useAuditLogs } from "@/lib/queries/use-audit-logs";
import { useI18n } from "@/components/i18n-provider";
import type { OwnedConversationSummary } from "@/lib/app-api";

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
            ) : conversations && conversations.length > 0 ? (
              <>
                {conversations.slice(0, 10).map((conv: OwnedConversationSummary) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] hover:bg-[hsl(var(--surface-2)/0.4)] transition-colors"
                  >
                    <span className="text-body-sm truncate">{conv.title ?? conv.id}</span>
                    <span className="text-caption text-muted-foreground shrink-0 ml-2">
                      {formatRelativeTime(conv.lastMessage?.createdAt ?? conv.createdAt)}
                    </span>
                  </div>
                ))}
                {conversations.length > 10 && (
                  <Link to="/app/agents" className="flex items-center gap-1 px-3 py-2 text-caption text-brand hover:underline">
                    {t("common.viewAll") ?? "View All"} <ArrowRight className="size-3" />
                  </Link>
                )}
              </>
            ) : (
              <p className="text-body-sm text-muted-foreground px-3 py-4">{t("dashboard.noConversations") ?? "No conversations yet"}</p>
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
            ) : auditLogs && auditLogs.length > 0 ? (
              <>
                {auditLogs.slice(0, 10).map((log: AuditLog) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot variant="online" />
                      <span className="text-body-sm truncate">{log.eventType}</span>
                    </div>
                    <span className="text-caption text-muted-foreground shrink-0 ml-2">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                ))}
                {auditLogs.length > 10 && (
                  <Link to="/app/logs" className="flex items-center gap-1 px-3 py-2 text-caption text-brand hover:underline">
                    {t("common.viewAll") ?? "View All"} <ArrowRight className="size-3" />
                  </Link>
                )}
              </>
            ) : (
              <p className="text-body-sm text-muted-foreground px-3 py-4">{t("dashboard.noAuditLogs") ?? "No audit events yet"}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
