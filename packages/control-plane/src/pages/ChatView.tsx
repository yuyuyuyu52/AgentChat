import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  User,
  MoreVertical,
  Eye,
  Clock,
  Terminal,
} from "lucide-react";
import type { Account } from "@agentchat/protocol";
import {
  listWorkspaceAccounts,
  listWorkspaceConversationMessages,
  listWorkspaceConversations,
  type OwnedConversationMessage,
  type OwnedConversationSummary,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

export default function ChatView() {
  const { agentId, convId } = useParams();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [conversation, setConversation] = React.useState<OwnedConversationSummary | undefined>();
  const [messages, setMessages] = React.useState<OwnedConversationMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!convId) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        setLoading(true);
        const [nextAccounts, nextConversations, nextMessages] = await Promise.all([
          listWorkspaceAccounts(),
          listWorkspaceConversations(),
          listWorkspaceConversationMessages(convId),
        ]);
        if (!active) {
          return;
        }
        setAccounts(nextAccounts);
        setConversation(nextConversations.find((item) => item.id === convId));
        setMessages(nextMessages);
        setError(null);
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load messages");
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
  }, [convId]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  if (loading) {
    return <div className="p-8 text-slate-500">Loading conversation...</div>;
  }

  if (error || !conversation || !agentId || !convId) {
    return <div className="p-8 text-red-300">{error ?? "Conversation not found."}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#0A0A0B]">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0D0D0F]/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link to={`/app/agents/${agentId}/conversations`}>
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{conversationTitle(conversation, agentId, accountsById)}</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Read-only
                </span>
                <span className="text-[10px] text-slate-600 font-mono">ID: {convId}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] uppercase font-bold tracking-tighter">
            {conversation.kind}
          </Badge>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 p-6" viewportRef={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex justify-center">
            <div className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Conversation started on {new Date(conversation.createdAt).toLocaleDateString()}
            </div>
          </div>

          {messages.map((message) => {
            const isSelectedAgent = message.senderId === agentId;
            return (
              <div
                key={message.id}
                className={cn("flex gap-4 group", isSelectedAgent ? "flex-row-reverse" : "flex-row")}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border",
                  isSelectedAgent ? "bg-blue-500/10 border-blue-500/20" : "bg-slate-700/10 border-slate-700/20",
                )}>
                  {isSelectedAgent
                    ? <Bot className="w-4 h-4 text-blue-500" />
                    : <User className="w-4 h-4 text-slate-400" />}
                </div>

                <div className={cn("flex flex-col max-w-[80%]", isSelectedAgent ? "items-end" : "items-start")}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                      {message.senderName}
                    </span>
                    <span className="text-[10px] text-slate-700 font-mono">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm leading-relaxed",
                    isSelectedAgent
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-white/5 text-slate-200 border border-white/5 rounded-tl-none",
                  )}>
                    {message.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <footer className="p-6 border-t border-white/5 bg-[#0D0D0F]/50">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
            <Eye className="w-3 h-3 text-yellow-500" />
            <p className="text-[10px] text-yellow-500/80 font-medium">
              User workspace message view is read-only. Sending messages still goes through agents or admin tools.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                API-backed history
              </span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Seq #{messages.at(-1)?.seq ?? 0}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
