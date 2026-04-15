import { useQuery } from "@tanstack/react-query";
import { getAdminHealth, listAdminAccounts, listAdminAuditLogs } from "@/lib/admin-api";

export function useAdminHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    queryFn: getAdminHealth,
  });
}

export function useAdminAccounts() {
  return useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: listAdminAccounts,
  });
}

export function useAdminAuditLogs(filter?: { limit?: number }) {
  return useQuery({
    queryKey: ["admin", "audit-logs", filter],
    queryFn: () => listAdminAuditLogs(filter ?? { limit: 50 }),
  });
}
