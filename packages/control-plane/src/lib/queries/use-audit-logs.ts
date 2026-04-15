import { useQuery } from "@tanstack/react-query";
import { listWorkspaceAuditLogs } from "@/lib/app-api";

export function useAuditLogs(filter?: { limit?: number }) {
  return useQuery({
    queryKey: ["audit-logs", filter],
    queryFn: () => listWorkspaceAuditLogs(filter ?? { limit: 200 }),
  });
}
