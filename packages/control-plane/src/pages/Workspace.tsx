import React from "react";
import { Link } from "react-router-dom";
import { Bot, Copy, KeyRound, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Account } from "@agentchatjs/protocol";
import { createWorkspaceAccount, resetWorkspaceAccountToken } from "@/lib/app-api";
import { useAccounts, useDeleteAccount } from "@/lib/queries/use-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";

function maskToken(token: string): string {
  return token.length <= 12 ? token : `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export default function Workspace() {
  const { t, formatDateTime } = useI18n();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading, isError, error } = useAccounts();

  const [latestTokens, setLatestTokens] = React.useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [newAgentName, setNewAgentName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<Account | null>(null);

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createWorkspaceAccount({ name, type: "agent" }),
    onSuccess: (createdAccount) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setLatestTokens((prev) => ({ ...prev, [createdAccount.id]: createdAccount.token }));
      setNewAgentName("");
      setIsCreateModalOpen(false);
      toast.success(t("workspace.agentCreated"), {
        description: t("workspace.tokenShownOnce"),
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("workspace.createAccountFailed"));
    },
  });

  const resetMutation = useMutation({
    mutationFn: (accountId: string) => resetWorkspaceAccountToken(accountId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setLatestTokens((prev) => ({ ...prev, [result.accountId]: result.token }));
      toast.success(t("workspace.tokenRotated"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("workspace.rotateTokenFailed"));
    },
  });

  const deleteMutation = useDeleteAccount();

  const filteredAccounts = React.useMemo(
    () =>
      accounts.filter((account: Account) =>
        `${account.name} ${account.id}`.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [accounts, searchQuery],
  );

  const handleCopy = async (accountId: string, token: string) => {
    const text = `AGENTCHAT_ACCOUNT_ID=${accountId}\nAGENTCHAT_TOKEN=${token}`;
    await navigator.clipboard.writeText(text);
    toast.success(t("workspace.copiedToClipboard"));
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-heading-2 text-foreground">{t("workspace.title")}</h2>
          <p className="text-body-sm text-muted-foreground">{t("workspace.description")}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("workspace.searchAgents")}
              className="pl-10"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          {/* Create Agent Dialog */}
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-lg">
                <Plus className="w-4 h-4" />
                {t("workspace.createAgent")}
              </Button>
            </DialogTrigger>
            <DialogContent className="surface-float border-transparent text-foreground">
              <DialogHeader>
                <DialogTitle>{t("workspace.createNewAgent")}</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {t("workspace.createNewAgentDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("workspace.agentDisplayName")}</Label>
                  <Input
                    id="name"
                    placeholder={t("workspace.agentDisplayNamePlaceholder")}
                    value={newAgentName}
                    onChange={(event) => setNewAgentName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && newAgentName.trim()) {
                        createMutation.mutate(newAgentName.trim());
                      }
                    }}
                  />
                </div>
                <div className="rounded-[var(--radius-md)] bg-warning-subtle p-4">
                  <p className="text-caption leading-relaxed">
                    <ShieldAlert className="w-3 h-3 inline mr-1" />
                    {t("workspace.saveTokenWarning")}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newAgentName.trim())}
                  disabled={createMutation.isPending || !newAgentName.trim()}
                >
                  {t("common.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Token revealed after creation */}
      {Object.keys(latestTokens).length > 0 && (
        <div className="space-y-3">
          {Object.entries(latestTokens).map(([accountId, token]) => {
            const account = accounts.find((a: Account) => a.id === accountId);
            return (
              <div
                key={accountId}
                className="rounded-[var(--radius-md)] bg-warning-subtle p-4 space-y-2"
              >
                <p className="text-caption font-medium flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {account?.name ?? accountId} — {t("workspace.tokenShownOnce")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="surface-inset flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-mono text-foreground truncate">
                    {token}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={t("workspace.copyToken")}
                    onClick={() => void handleCopy(accountId, token)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Card grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-[var(--radius-md)] bg-destructive/10 p-6 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : t("workspace.loadAccountsFailed")}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <EmptyState
          icon={<Bot className="w-10 h-10" />}
          title={searchQuery ? t("workspace.searchAgents") : t("workspace.title")}
          description={
            searchQuery
              ? undefined
              : t("workspace.description")
          }
          action={
            !searchQuery ? (
              <Button
                className="gap-2 rounded-lg"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                {t("workspace.createAgent")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((account: Account) => {
            const latestToken = latestTokens[account.id];
            return (
              <Link
                key={account.id}
                to={`/app/agents/${account.id}`}
                className="surface-raised rounded-[var(--radius-md)] p-5 flex flex-col gap-4 hover:ring-2 hover:ring-[hsl(var(--color-brand)/0.4)] transition-all block"
              >
                {/* Card header: avatar + name + badge */}
                <div className="flex items-start gap-3">
                  <div className="surface-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand-icon">
                    <Bot className="w-5 h-5 text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-heading-3 text-foreground truncate">{account.name}</p>
                    <p className="text-caption font-mono text-muted-foreground truncate">{account.id}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full px-2 py-0 text-[10px] font-bold uppercase tracking-tighter bg-[linear-gradient(180deg,hsl(var(--color-success)/0.16),hsl(var(--color-success)/0.06))] text-success"
                  >
                    {t(`enums.accountType.${account.type}`, undefined, account.type)}
                  </Badge>
                </div>

                {/* Created date */}
                <p className="text-caption text-muted-foreground">
                  {formatDateTime(account.createdAt)}
                </p>

                {/* Token row — only shown when a token is available for this account */}
                {latestToken && (
                  <div
                    className="rounded-[var(--radius-sm)] bg-warning-subtle p-3 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-caption">{t("workspace.tokenShownOnce")}</p>
                    <div className="flex items-center gap-2">
                      <code className="surface-inset flex-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-mono text-foreground truncate">
                        {maskToken(latestToken)}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        aria-label={t("workspace.copyToken")}
                        onClick={() => void handleCopy(account.id, latestToken)}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Card footer actions */}
                <div
                  className="flex items-center justify-end gap-2 pt-1 border-t border-border/40"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-foreground/80"
                    disabled={resetMutation.isPending}
                    onClick={() => resetMutation.mutate(account.id)}
                  >
                    <KeyRound className="w-3 h-3 mr-1" />
                    {t("workspace.reset")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(account)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    {t("workspace.delete")}
                  </Button>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="surface-float border-transparent text-foreground">
          <DialogHeader>
            <DialogTitle>{t("workspace.deleteAgent")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t("workspace.deleteAgentConfirm", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--radius-md)] bg-destructive/10 p-4">
            <p className="text-caption leading-relaxed text-destructive">
              <ShieldAlert className="w-3 h-3 inline mr-1" />
              {t("workspace.deleteAgentWarning")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    setDeleteTarget(null);
                    setLatestTokens((prev) => {
                      const next = { ...prev };
                      delete next[deleteTarget.id];
                      return next;
                    });
                    toast.success(t("workspace.agentDeleted"));
                  },
                  onError: (err) => {
                    toast.error(err instanceof Error ? err.message : t("workspace.deleteAgentFailed"));
                  },
                });
              }}
            >
              {t("workspace.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
