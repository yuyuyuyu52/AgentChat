import { useQuery } from "@tanstack/react-query";
import { listWorkspaceAccounts, getAccountProfile } from "@/lib/app-api";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: listWorkspaceAccounts,
  });
}

export function useAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: ["accounts", accountId],
    queryFn: () => getAccountProfile(accountId!),
    enabled: !!accountId,
  });
}
