import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listWorkspaceAccounts, getAccountProfile, updateAccountProfile } from "@/lib/app-api";

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

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, profile }: {
      accountId: string;
      profile: Record<string, unknown>;
    }) => updateAccountProfile(accountId, profile),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts", variables.accountId] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
