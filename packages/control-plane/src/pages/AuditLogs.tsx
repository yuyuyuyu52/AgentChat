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
import type { AuditLog } from "@agentchatjs/protocol";
import { useAuditLogs } from "@/lib/queries/use-audit-logs";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

type StatusFilter = "all" | "success" | "failure";

function summarizeStatus(log: AuditLog): "success" | "failure" {
  return /(fail|reject|error)/i.test(log.eventType) ? "failure" : "success";
}

function summarizeTarget(log: AuditLog): string {
  return `${log.subjectType}:${log.subjectId}`;
}

function summarizeDetails(log: AuditLog): string {
  return Object.entries(log.metadata)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
}

export default function AuditLogs() {
  const { t, formatDateTime } = useI18n();
  const { data: logs = [], isLoading, isError, error } = useAuditLogs({ limit: 200 });
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const filteredLogs = React.useMemo(
    () =>
      logs.filter((log) => {
        const matchesSearch = `${log.actorName ?? ""} ${log.actorAccountId ?? ""} ${log.eventType} ${summarizeTarget(log)} ${summarizeDetails(log)}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (statusFilter === "all") return true;
        return summarizeStatus(log) === statusFilter;
      }),
    [logs, searchQuery, statusFilter],
  );

  const handleExportCsv = () => {
    const rows = [
      ["timestamp", "actor", "eventType", "target", "status", "details"],
      ...filteredLogs.map((log) => [
        log.createdAt,
        log.actorName ?? log.actorAccountId ?? t("common.system"),
        log.eventType,
        summarizeTarget(log),
        summarizeStatus(log),
        summarizeDetails(log) || t("auditLogs.noAdditionalMetadata"),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = t("auditLogs.csvFilename");
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-heading-2 text-foreground">{t("auditLogs.title")}</h2>
          <p className="text-body-sm text-muted-foreground">{t("auditLogs.description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-border hover:bg-muted/40 text-foreground/80 gap-2"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
          >
            <Download className="w-4 h-4" />
            {t("auditLogs.exportCsv")}
          </Button>
        </div>
      </div>

      <Card className="surface-raised border-border">
        <CardHeader className="border-b border-border px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("auditLogs.searchLogs", undefined, "Search by actor, event, or target...")}
                className="border-border bg-muted/40 pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-blue-500"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
              {(["all", "success", "failure"] as StatusFilter[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setStatusFilter(option)}
                  className={cn(
                    "text-caption px-3 py-1 rounded transition-colors capitalize",
                    statusFilter === option
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option === "all" ? t("common.all", undefined, "All") : option === "success" ? t("enums.auditStatus.success", undefined, "Success") : t("enums.auditStatus.failure", undefined, "Failure")}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-caption text-muted-foreground shrink-0">
              <Clock className="w-3 h-3" />
              {isLoading ? t("auditLogs.syncing") : t("auditLogs.visibleEvents", { count: filteredLogs.length })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableTimestamp")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableActor")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableAction")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableTarget")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableStatus")}</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{t("auditLogs.tableDetails")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-border hover:bg-transparent">
                    <TableCell><Skeleton className="h-3 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-40" /></TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow className="border-border">
                  <TableCell className="text-red-400" colSpan={6}>
                    {error instanceof Error ? error.message : t("auditLogs.loadAuditFailed")}
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell className="text-muted-foreground text-body-sm" colSpan={6}>
                    {t("auditLogs.loadingAuditRecords", undefined, "No audit records found.")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => {
                  const status = summarizeStatus(log);
                  const isSuccess = status === "success";
                  return (
                    <TableRow
                      key={log.id}
                      className={cn(
                        "border-border transition-colors group relative",
                        "hover:bg-[hsl(var(--surface-2)/0.4)]",
                        "border-l-2",
                        isSuccess
                          ? "border-l-transparent hover:border-l-green-500"
                          : "border-l-transparent hover:border-l-red-500",
                      )}
                    >
                      <TableCell className="text-xs font-mono text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {log.actorAccountId ? (
                            <Bot className="w-3 h-3 text-purple-400" />
                          ) : (
                            <User className="w-3 h-3 text-blue-400" />
                          )}
                          <span className="text-xs font-mono text-foreground/80">
                            {log.actorName ?? log.actorAccountId ?? t("common.system")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono bg-muted/40 border-border text-foreground/80">
                          {log.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{summarizeTarget(log)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isSuccess ? (
                            <span title={t("enums.auditStatus.success", undefined, "Event completed successfully")}>
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            </span>
                          ) : (
                            <span title={t("enums.auditStatus.failure", undefined, "Event failed or was rejected")}>
                              <AlertCircle className="w-3 h-3 text-red-500" />
                            </span>
                          )}
                          <span className={cn("text-[10px] font-bold uppercase tracking-tighter", isSuccess ? "text-green-500" : "text-red-500")}>
                            {t(`enums.auditStatus.${status}`, undefined, status)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-xs text-muted-foreground truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                          {summarizeDetails(log) || t("auditLogs.noAdditionalMetadata")}
                        </p>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
