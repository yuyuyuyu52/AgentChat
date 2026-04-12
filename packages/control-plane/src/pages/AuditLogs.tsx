import React from "react";
import {
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Bot,
} from "lucide-react";
import type { AuditLog } from "@agentchat/protocol";
import { listWorkspaceAuditLogs } from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function summarizeStatus(log: AuditLog): "success" | "failure" {
  return /(fail|reject|error)/i.test(log.eventType) ? "failure" : "success";
}

function summarizeTarget(log: AuditLog): string {
  return `${log.subjectType}:${log.subjectId}`;
}

function summarizeDetails(log: AuditLog): string {
  const metadata = Object.entries(log.metadata)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  return metadata || "No additional metadata";
}

export default function AuditLogs() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        const nextLogs = await listWorkspaceAuditLogs({ limit: 200 });
        if (active) {
          setLogs(nextLogs);
          setError(null);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load audit logs");
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

  const filteredLogs = React.useMemo(
    () =>
      logs.filter((log) =>
        `${log.actorName ?? ""} ${log.actorAccountId ?? ""} ${log.eventType} ${summarizeTarget(log)} ${summarizeDetails(log)}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      ),
    [logs, searchQuery],
  );

  const handleExportCsv = () => {
    const rows = [
      ["timestamp", "actor", "eventType", "target", "status", "details"],
      ...filteredLogs.map((log) => [
        log.createdAt,
        log.actorName ?? log.actorAccountId ?? "system",
        log.eventType,
        summarizeTarget(log),
        summarizeStatus(log),
        summarizeDetails(log),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agentchat-workspace-audit.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Audit Logs</h2>
          <p className="text-sm text-slate-500">Events for the agents owned by your current user session.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-white/10 hover:bg-white/5 text-slate-300 gap-2"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="bg-[#0D0D0F] border-white/5">
        <CardHeader className="border-b border-white/5 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search logs by actor, action, or target..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              {loading ? "Syncing..." : `${filteredLogs.length} visible events`}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-white/5">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Timestamp</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Actor</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Action</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Target</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="border-white/5">
                  <TableCell className="text-slate-500" colSpan={6}>Loading audit records...</TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className="border-white/5">
                  <TableCell className="text-red-400" colSpan={6}>{error}</TableCell>
                </TableRow>
              ) : filteredLogs.map((log) => {
                const status = summarizeStatus(log);
                return (
                  <TableRow key={log.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <TableCell className="text-xs font-mono text-slate-500">{new Date(log.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {log.actorAccountId ? (
                          <Bot className="w-3 h-3 text-purple-400" />
                        ) : (
                          <User className="w-3 h-3 text-blue-400" />
                        )}
                        <span className="text-xs font-mono text-slate-300">{log.actorName ?? log.actorAccountId ?? "system"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono bg-white/5 border-white/10 text-slate-300">
                        {log.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{summarizeTarget(log)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {status === "success" ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-red-500" />
                        )}
                        <span className={cn("text-[10px] font-bold uppercase tracking-tighter", status === "success" ? "text-green-500" : "text-red-500")}>
                          {status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="text-xs text-slate-400 truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                        {summarizeDetails(log)}
                      </p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
