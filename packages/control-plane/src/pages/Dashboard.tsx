import React from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Search,
  MessageSquare,
  ShieldAlert,
  Clock,
} from "lucide-react";
import type { Account } from "@agentchatjs/protocol";
import {
  listWorkspaceAccounts,
  listWorkspaceAuditLogs,
  listWorkspaceConversations,
  type OwnedConversationSummary,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function conversationTitle(
  conversation: OwnedConversationSummary,
  accountsById: Map<string, Account>,
): string {
  if (conversation.kind === "group" && conversation.title) {
    return conversation.title;
  }
  return conversation.memberIds
    .map((memberId) => accountsById.get(memberId)?.name ?? memberId)
    .join(", ");
}

export default function Dashboard() {
  const { t, formatDateTime, formatTime } = useI18n();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [conversations, setConversations] = React.useState<OwnedConversationSummary[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<Awaited<ReturnType<typeof listWorkspaceAuditLogs>>>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        const [nextAccounts, nextConversations, nextLogs] = await Promise.all([
          listWorkspaceAccounts(),
          listWorkspaceConversations(),
          listWorkspaceAuditLogs({ limit: 20 }),
        ]);
        if (!active) {
          return;
        }
        setAccounts(nextAccounts);
        setConversations(nextConversations);
        setAuditLogs(nextLogs);
        setError(null);
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : t("common.loading"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [t]);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const filteredAccounts = React.useMemo(
    () =>
      accounts.filter((account) =>
        `${account.name} ${account.id}`.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [accounts, searchQuery],
  );

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-panel-subtle surface-hover-lift border-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.myAgents")}</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground">{accounts.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
              <Bot className="w-3 h-3" /> {t("dashboard.accountsYouOwn")}
            </div>
          </CardContent>
        </Card>
        <Card className="surface-panel-subtle surface-hover-lift border-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.visibleConversations")}</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground">{conversations.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
              <MessageSquare className="w-3 h-3" /> {t("dashboard.readonlyConversationAccess")}
            </div>
          </CardContent>
        </Card>
        <Card className="surface-panel-subtle surface-hover-lift border-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.auditEvents")}</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground">{auditLogs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold">
              <ShieldAlert className="w-3 h-3" /> {t("dashboard.latestActivityForAgents")}
            </div>
          </CardContent>
        </Card>
        <Card className="surface-panel-subtle surface-hover-lift border-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.scope")}</CardDescription>
            <CardTitle className="text-3xl font-bold text-foreground">{t("dashboard.owned")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-yellow-500 font-bold">
              <Clock className="w-3 h-3" /> {t("dashboard.dataFilteredBySessionOwnership")}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("dashboard.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.description")}</p>
        </div>
        <div className="relative flex-1 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("dashboard.searchAgents")}
            className="pl-10 focus-visible:ring-blue-500"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden border-transparent">
        <Table>
          <TableHeader className="bg-[hsl(var(--surface-2)/0.52)]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.tableAgent")}</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.tableType")}</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.tableCreated")}</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("dashboard.tableActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>{t("dashboard.loadingAgents")}</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell className="text-red-400" colSpan={4}>{error}</TableCell>
              </TableRow>
            ) : filteredAccounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div>
                    <p className="text-sm font-bold text-foreground">{account.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{account.id}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-tighter">
                    {t(`enums.accountType.${account.type}`, undefined, account.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(account.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Link to={`/app/agents/${account.id}/conversations`}>
                    <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">{t("common.view")}</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="border-transparent">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">{t("dashboard.recentConversations")}</CardTitle>
              <CardDescription className="text-muted-foreground">{t("dashboard.threadsYourAgentsCanSee")}</CardDescription>
            </div>
            <Link to="/app/agents">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">{t("dashboard.viewAll")}</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {conversations.slice(0, 5).map((conversation) => {
              const routeAccountId = conversation.ownedAgents[0]?.id ?? "";
              return (
                <Link key={conversation.id} to={`/app/agents/${routeAccountId}/conversations/${conversation.id}`}>
                  <div className="surface-panel-subtle surface-hover-lift flex items-center gap-4 rounded-2xl border-transparent p-3">
                    <div className="surface-chip flex h-10 w-10 items-center justify-center rounded-full border-transparent bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(37,99,235,0.08))]">
                      <MessageSquare className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="truncate text-sm font-bold text-foreground">{conversationTitle(conversation, accountsById)}</p>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {conversation.lastMessage?.body ?? t("dashboard.noMessagesYet")}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-transparent">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">{t("dashboard.auditTrail")}</CardTitle>
              <CardDescription className="text-muted-foreground">{t("dashboard.latestEventsAffectingAgents")}</CardDescription>
            </div>
            <Link to="/app/logs">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">{t("dashboard.viewLogs")}</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="surface-panel-subtle flex items-start gap-4 rounded-2xl border-transparent p-3">
                <div className="mt-1 w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground">{log.eventType}</p>
                    <span className="font-mono text-[10px] text-muted-foreground">{formatTime(log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {log.actorName ?? log.actorAccountId ?? t("common.system")} → {log.subjectType}:{log.subjectId}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
