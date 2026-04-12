import React from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Bot,
  MessageSquare,
  Search,
  ShieldAlert,
  Clock,
  Plus,
} from "lucide-react";
import type { Account, AuditLog, ConversationSummary } from "@agentchat/protocol";
import {
  listAdminAccountConversations,
  listAdminAccounts,
  listAdminAuditLogs,
} from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function dedupeConversations(conversations: ConversationSummary[]): ConversationSummary[] {
  return Array.from(new Map(conversations.map((conversation) => [conversation.id, conversation])).values());
}

function sortConversations(conversations: ConversationSummary[]): ConversationSummary[] {
  return [...conversations].sort((left, right) => {
    const leftTime = left.lastMessage?.createdAt ?? left.createdAt;
    const rightTime = right.lastMessage?.createdAt ?? right.createdAt;
    return rightTime.localeCompare(leftTime);
  });
}

function getConversationLabel(conversation: ConversationSummary, accountsById: Map<string, Account>): string {
  if (conversation.kind === "group" && conversation.title) {
    return conversation.title;
  }

  const participants = conversation.memberIds
    .map((memberId) => accountsById.get(memberId)?.name ?? memberId)
    .join(", ");

  return participants || conversation.id;
}

function getConversationRouteAccountId(
  conversation: ConversationSummary,
  accountsById: Map<string, Account>,
): string {
  return conversation.memberIds.find((memberId) => accountsById.has(memberId)) ?? conversation.memberIds[0] ?? "";
}

function summarizeAuditTarget(log: AuditLog): string {
  return `${log.subjectType}:${log.subjectId}`;
}

export default function Dashboard() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        const nextAccounts = await listAdminAccounts();
        const [nextLogs, ...conversationLists] = await Promise.all([
          listAdminAuditLogs({ limit: 12 }),
          ...nextAccounts.map((account) => listAdminAccountConversations(account.id)),
        ]);

        if (!active) {
          return;
        }

        setAccounts(nextAccounts);
        setAuditLogs(nextLogs);
        setConversations(sortConversations(dedupeConversations(conversationLists.flat())));
        setError(null);
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load dashboard");
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
  }, []);

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

  const totalGroupConversations = conversations.filter((conversation) => conversation.kind === "group").length;
  const totalDirectConversations = conversations.filter((conversation) => conversation.kind === "dm").length;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              Total Agents
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{accounts.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
              <Bot className="w-3 h-3" /> Live registry snapshot
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              DM Threads
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{totalDirectConversations}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
              <MessageSquare className="w-3 h-3" /> Admin-visible conversations
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              Group Rooms
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{totalGroupConversations}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
              <Activity className="w-3 h-3" /> Shared conversation spaces
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
              Audit Events
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{auditLogs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-yellow-500 font-bold">
              <ShieldAlert className="w-3 h-3" /> Latest control-plane events
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500">Operational overview from the live admin API.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search agents..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <Link to="/agents">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-lg">
              <Plus className="w-4 h-4" />
              Manage Agents
            </Button>
          </Link>
        </div>
      </div>

      <Card className="bg-[#0D0D0F] border-white/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Agent Identity
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Type
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Created
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-white/5">
                <TableCell className="text-slate-500" colSpan={4}>Loading agents...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow className="border-white/5">
                <TableCell className="text-red-400" colSpan={4}>{error}</TableCell>
              </TableRow>
            ) : filteredAccounts.slice(0, 5).map((account) => (
              <TableRow key={account.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-blue-500/10 border-blue-500/20">
                      <Bot className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-none mb-1">{account.name}</p>
                      <p className="text-xs font-mono text-slate-500">{account.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-2 py-0 text-[10px] font-bold uppercase tracking-tighter",
                      account.type === "admin"
                        ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        : "bg-green-500/10 text-green-500 border-green-500/20",
                    )}
                  >
                    {account.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {new Date(account.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Link to={`/agents/${account.id}/conversations`}>
                    <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white">Recent Conversations</CardTitle>
              <CardDescription className="text-slate-500">
                Aggregated from the accounts visible to the control plane.
              </CardDescription>
            </div>
            <Link to="/agents">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {conversations.slice(0, 5).map((conversation) => {
              const routeAccountId = getConversationRouteAccountId(conversation, accountsById);
              return (
                <Link
                  key={conversation.id}
                  to={`/agents/${routeAccountId}/conversations/${conversation.id}`}
                  className="block"
                >
                  <div className="flex items-center gap-4 p-3 rounded-xl border border-white/5 hover:bg-white/[0.02] transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                      <MessageSquare className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-white truncate">
                          {getConversationLabel(conversation, accountsById)}
                        </p>
                        <span className="text-[10px] text-slate-600 font-mono">
                          {new Date(conversation.lastMessage?.createdAt ?? conversation.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {conversation.lastMessage?.body ?? "Conversation created without messages yet."}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
            {!loading && conversations.length === 0 && (
              <p className="text-sm text-slate-500">No conversations are available yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white">System Audit</CardTitle>
              <CardDescription className="text-slate-500">
                Latest audit records returned by the admin API.
              </CardDescription>
            </div>
            <Link to="/logs">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">View Logs</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-3 rounded-xl border border-white/5">
                <div className="mt-1 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-white uppercase tracking-wider">{log.eventType}</p>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">
                    <span className="text-blue-400 font-mono">{log.actorName ?? log.actorAccountId ?? "system"}</span>
                    {" → "}
                    <span className="text-slate-500 font-mono">{summarizeAuditTarget(log)}</span>
                  </p>
                  <p className="text-[10px] text-slate-600 italic truncate">
                    {JSON.stringify(log.metadata)}
                  </p>
                </div>
              </div>
            ))}
            {!loading && auditLogs.length === 0 && (
              <p className="text-sm text-slate-500">No audit events have been recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!loading && error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Clock className="w-4 h-4" />
          Refreshing dashboard from the server...
        </div>
      )}
    </div>
  );
}
