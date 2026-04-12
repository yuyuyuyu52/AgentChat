import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  MoreVertical,
  ShieldCheck,
  Clock,
  Terminal,
} from "lucide-react";
import type { Account, ConversationSummary, Message } from "@agentchat/protocol";
import {
  listAdminAccountConversations,
  listAdminAccounts,
  listAdminConversationMessages,
  sendAdminMessage,
} from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function conversationTitle(
  conversation: ConversationSummary | undefined,
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
  const [conversation, setConversation] = React.useState<ConversationSummary | undefined>();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!agentId || !convId) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        setLoading(true);
        const [nextAccounts, nextConversations, nextMessages] = await Promise.all([
          listAdminAccounts(),
          listAdminAccountConversations(agentId),
          listAdminConversationMessages(agentId, convId),
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
  }, [agentId, convId]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agentId || !convId || !inputValue.trim()) {
      return;
    }

    try {
      setSending(true);
      const result = await sendAdminMessage({
        senderId: agentId,
        conversationId: convId,
        body: inputValue.trim(),
      });
      setMessages((current) => [...current, result.message]);
      setConversation(result.conversation);
      setInputValue("");
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

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
          <Link to={`/agents/${agentId}/conversations`}>
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {conversationTitle(conversation, agentId, accountsById)}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-green-500" />
                  Admin Stream
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
            const sender = accountsById.get(message.senderId);
            const isCurrentAgent = message.senderId === agentId;
            return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4 group",
                  isCurrentAgent ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border",
                  isCurrentAgent ? "bg-blue-500/10 border-blue-500/20" : "bg-slate-700/10 border-slate-700/20",
                )}>
                  {isCurrentAgent
                    ? <Bot className="w-4 h-4 text-blue-500" />
                    : <User className="w-4 h-4 text-slate-400" />}
                </div>

                <div className={cn(
                  "flex flex-col max-w-[80%]",
                  isCurrentAgent ? "items-end" : "items-start",
                )}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                      {sender?.name ?? message.senderId}
                    </span>
                    <span className="text-[10px] text-slate-700 font-mono">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm leading-relaxed",
                    isCurrentAgent
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
            <ShieldCheck className="w-3 h-3 text-yellow-500" />
            <p className="text-[10px] text-yellow-500/80 font-medium">
              Messages sent here are issued as the selected account: <span className="font-bold">{accountsById.get(agentId)?.name ?? agentId}</span>
            </p>
          </div>
          <form onSubmit={handleSendMessage} className="relative">
            <Input
              placeholder="Type a message..."
              className="pr-12 h-12 bg-white/5 border-white/10 text-white focus-visible:ring-blue-500 rounded-xl"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 top-1.5 h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              disabled={sending || !inputValue.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="mt-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-4">
              <button type="button" className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                <Terminal className="w-3 h-3" />
                Live API
              </button>
              <button type="button" className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                <Clock className="w-3 h-3" />
                Seq #{messages.at(-1)?.seq ?? 0}
              </button>
            </div>
            <span className="text-[10px] text-slate-600 font-mono">Press Enter to send</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
