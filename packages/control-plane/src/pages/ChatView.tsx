import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  User,
  MoreVertical,
} from "lucide-react";
import type { Account } from "@agentchatjs/protocol";
import type { OwnedConversationSummary } from "@/lib/app-api";
import { useMessages, useConversations } from "@/lib/queries/use-conversations";
import { useAccounts } from "@/lib/queries/use-accounts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

function conversationTitle(
  conversation: OwnedConversationSummary | undefined,
  agentId: string | undefined,
  accountsById: Map<string, Account>,
): string {
  if (!conversation) {
    return "Conversation";
  }
  if (conversation.kind === "group" && conversation.title) {
    return conversation.title;
  }
  return conversation.memberIds
    .filter((memberId) => memberId !== agentId)
    .map((memberId) => accountsById.get(memberId)?.name ?? memberId)
    .join(", ");
}

function MessageSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <div className={cn("flex gap-3 group", align === "right" ? "flex-row-reverse" : "flex-row")}>
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className={cn("flex flex-col gap-1 max-w-[85%] md:max-w-[70%]", align === "right" ? "items-end" : "items-start")}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-16 w-56 rounded-2xl" />
        <Skeleton className="h-2 w-16" />
      </div>
    </div>
  );
}

export default function ChatView() {
  const { t, formatDate, formatTime } = useI18n();
  const { agentId, convId } = useParams();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: conversations = [] } = useConversations();
  const { data: messages = [], isLoading, isError, error } = useMessages(convId);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const conversation = React.useMemo(
    () => conversations.find((item) => item.id === convId),
    [conversations, convId],
  );

  React.useEffect(() => {
    if (scrollRef.current && !isLoading) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (isError || (!isLoading && (!agentId || !convId))) {
    return (
      <div className="p-8 text-red-300">
        {error instanceof Error ? error.message : t("chatView.conversationNotFound")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Read-only info bar at the top */}
      <div className="bg-info-subtle text-info px-4 py-1.5 text-center text-caption font-medium">
        {t("chatView.readOnly")}
      </div>

      <header className="surface-header flex h-16 items-center justify-between px-6 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link to={`/app/agents/${agentId}/conversations`}>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="surface-chip flex h-8 w-8 items-center justify-center rounded-full border-transparent bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(37,99,235,0.08))]">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-heading-3 text-foreground">{conversationTitle(conversation, agentId, accountsById)}</h3>
              <span className="font-mono text-caption text-muted-foreground">ID: {convId}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {conversation && (
            <Badge variant="outline" className="bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(37,99,235,0.08))] text-[10px] uppercase font-bold tracking-tighter text-blue-500">
              {t(`enums.conversationKind.${conversation.kind}`, undefined, conversation.kind)}
            </Badge>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 p-6" viewportRef={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {conversation && (
            <div className="flex justify-center">
              <div className="surface-chip rounded-full border-transparent px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("chatView.conversationStartedOn", { date: formatDate(conversation.createdAt) })}
              </div>
            </div>
          )}

          {isLoading ? (
            <>
              <MessageSkeleton align="left" />
              <MessageSkeleton align="right" />
              <MessageSkeleton align="left" />
              <MessageSkeleton align="right" />
            </>
          ) : (
            messages.map((message) => {
              const isSelectedAgent = message.senderId === agentId;
              return (
                <div
                  key={message.id}
                  className={cn("flex gap-3 group", isSelectedAgent ? "flex-row-reverse" : "flex-row")}
                >
                  <div className={cn(
                    "surface-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-transparent",
                    isSelectedAgent
                      ? "bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(37,99,235,0.08))]"
                      : "bg-[linear-gradient(180deg,rgba(148,163,184,0.12),rgba(148,163,184,0.04))]",
                  )}>
                    {isSelectedAgent
                      ? <Bot className="w-4 h-4 text-blue-500" />
                      : <User className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  <div className={cn(
                    "flex flex-col max-w-[85%] md:max-w-[70%]",
                    isSelectedAgent ? "items-end" : "items-start",
                  )}>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight mb-1 px-1">
                      {message.senderName}
                    </span>
                    <div className={cn(
                      "px-4 py-2.5 text-body-sm leading-relaxed",
                      isSelectedAgent
                        ? "bg-brand-subtle text-foreground rounded-2xl rounded-tr-sm"
                        : "surface-raised text-foreground rounded-2xl rounded-tl-sm",
                    )}
                    style={{ borderRadius: `var(--radius-md)` }}
                    >
                      {message.body}
                    </div>
                    <span className="text-caption text-muted-foreground mt-1 px-1">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
