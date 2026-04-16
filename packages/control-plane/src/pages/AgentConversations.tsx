import { useParams, Link } from "react-router-dom";
import {
  MessageSquare,
  Users,
  ChevronRight,
  ArrowLeft,
  Clock,
  Bot,
} from "lucide-react";
import type { Account } from "@agentchatjs/protocol";
import type { OwnedConversationSummary } from "@/lib/app-api";
import { useAccounts } from "@/lib/queries/use-accounts";
import { useConversations } from "@/lib/queries/use-conversations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useI18n } from "@/i18n";

function belongsToAgent(conversation: OwnedConversationSummary, agentId: string): boolean {
  return conversation.ownedAgents.some((agent) => agent.id === agentId);
}

function conversationLabel(
  conversation: OwnedConversationSummary,
  agentId: string,
  accountsById: Map<string, Account>,
): string {
  if (conversation.kind === "group" && conversation.title) {
    return conversation.title;
  }
  return conversation.memberIds
    .filter((memberId) => memberId !== agentId)
    .map((memberId) => accountsById.get(memberId)?.name ?? memberId)
    .join(", ");
}

export default function AgentConversations() {
  const { t, formatDateTime } = useI18n();
  const { agentId } = useParams<{ agentId: string }>();

  const { data: accounts = [], isLoading: loadingAccounts, isError: accountsError } = useAccounts();
  const { data: allConversations = [], isLoading: loadingConversations, isError: conversationsError } = useConversations();

  const loading = loadingAccounts || loadingConversations;
  const error = accountsError || conversationsError;

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const agent = agentId ? accountsById.get(agentId) : undefined;
  const conversations = agentId
    ? allConversations.filter((c) => belongsToAgent(c, agentId))
    : [];

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link to="/app/agents">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[hsl(var(--color-brand)/0.1)] border border-[hsl(var(--color-brand)/0.2)] flex items-center justify-center">
            <Bot className="w-6 h-6 text-brand" />
          </div>
          {loading ? (
            <div className="space-y-1">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <div>
              <h2 className="text-heading-2 text-foreground">{agent?.name ?? agentId}</h2>
              <p className="text-body-sm text-muted-foreground">{t("agentConversations.description")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[hsl(var(--color-danger)/0.2)] bg-[hsl(var(--color-danger)/0.05)] px-4 py-3 text-sm text-danger">
          {t("agentConversations.loadConversationsFailed")}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-12 w-12" />}
          title={t("agentConversations.noVisibleConversations")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {conversations.map((conversation) => (
            <Link key={conversation.id} to={`/app/agents/${agentId}/conversations/${conversation.id}`}>
              <div className="surface-raised rounded-[var(--radius-md)] p-6 flex items-center gap-6 hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="w-12 h-12 rounded-full bg-[hsl(var(--color-brand)/0.1)] flex items-center justify-center border border-[hsl(var(--color-brand)/0.2)] group-hover:scale-110 transition-transform shrink-0">
                  {conversation.kind === "group"
                    ? <Users className="w-6 h-6 text-brand" />
                    : <MessageSquare className="w-6 h-6 text-brand" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="truncate text-lg font-bold text-foreground">
                      {conversationLabel(conversation, agentId ?? "", accountsById)}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-tighter bg-muted/40 border-border text-muted-foreground shrink-0"
                    >
                      {t(`enums.conversationKind.${conversation.kind}`, undefined, conversation.kind)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.lastMessage?.body ?? t("agentConversations.noMessagesYet")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="mb-2 flex items-center justify-end gap-2 font-mono text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-brand ml-auto" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
