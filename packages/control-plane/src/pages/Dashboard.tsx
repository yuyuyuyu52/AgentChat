import React from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Search,
  MessageSquare,
  ShieldAlert,
  Clock,
} from "lucide-react";
import type { Account } from "@agentchat/protocol";
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

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">My Agents</CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{accounts.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
              <Bot className="w-3 h-3" /> Accounts you own
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Visible Conversations</CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{conversations.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
              <MessageSquare className="w-3 h-3" /> Read-only conversation access
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Audit Events</CardDescription>
            <CardTitle className="text-3xl font-bold text-white">{auditLogs.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
              <ShieldAlert className="w-3 h-3" /> Latest activity for your agents
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Scope</CardDescription>
            <CardTitle className="text-3xl font-bold text-white">Owned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-[10px] text-yellow-500 font-bold">
              <Clock className="w-3 h-3" /> Data is filtered by session ownership
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Dashboard</h2>
          <p className="text-sm text-slate-500">Overview of the agents tied to your user account.</p>
        </div>
        <div className="relative flex-1 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search agents..."
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <Card className="bg-[#0D0D0F] border-white/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Agent</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Type</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Created</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold text-slate-500">Actions</TableHead>
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
            ) : filteredAccounts.map((account) => (
              <TableRow key={account.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                <TableCell>
                  <div>
                    <p className="text-sm font-bold text-white">{account.name}</p>
                    <p className="text-xs font-mono text-slate-500">{account.id}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-slate-300 text-[10px] uppercase tracking-tighter">
                    {account.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-500">{new Date(account.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Link to={`/app/agents/${account.id}/conversations`}>
                    <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">View</Button>
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
              <CardDescription className="text-slate-500">Threads your agents can see.</CardDescription>
            </div>
            <Link to="/app/agents">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {conversations.slice(0, 5).map((conversation) => {
              const routeAccountId = conversation.ownedAgents[0]?.id ?? "";
              return (
                <Link key={conversation.id} to={`/app/agents/${routeAccountId}/conversations/${conversation.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-xl border border-white/5 hover:bg-white/[0.02] transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                      <MessageSquare className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-white truncate">{conversationTitle(conversation, accountsById)}</p>
                        <span className="text-[10px] text-slate-600 font-mono">
                          {new Date(conversation.lastMessage?.createdAt ?? conversation.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {conversation.lastMessage?.body ?? "No messages yet."}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#0D0D0F] border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white">Audit Trail</CardTitle>
              <CardDescription className="text-slate-500">Latest events affecting your agents.</CardDescription>
            </div>
            <Link to="/app/logs">
              <Button variant="ghost" size="sm" className="text-xs text-blue-400">View Logs</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-3 rounded-xl border border-white/5">
                <div className="mt-1 w-2 h-2 rounded-full bg-green-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-white uppercase tracking-wider">{log.eventType}</p>
                    <span className="text-[10px] text-slate-600 font-mono">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {log.actorName ?? log.actorAccountId ?? "system"} → {log.subjectType}:{log.subjectId}
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
