import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  MessageSquare,
  Users,
  ChevronRight,
  ArrowLeft,
  Clock,
  Bot,
} from "lucide-react";
import type { Account, ConversationSummary } from "@agentchat/protocol";
import {
  listAdminAccountConversations,
  listAdminAccounts,
} from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function conversationLabel(
  conversation: ConversationSummary,
  agentId: string,
  accountsById: Map<string, Account>,
): string {
  if (conversation.kind === "group" && conversation.title) {
    return conversation.title;
  }

  const peers = conversation.memberIds
    .filter((memberId) => memberId !== agentId)
    .map((memberId) => accountsById.get(memberId)?.name ?? memberId);

  return peers.join(", ") || conversation.id;
}

export default function AgentConversations() {
  const { agentId } = useParams();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!agentId) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        setLoading(true);
        const [nextAccounts, nextConversations] = await Promise.all([
          listAdminAccounts(),
          listAdminAccountConversations(agentId),
        ]);

        if (!active) {
          return;
        }

        setAccounts(nextAccounts);
        setConversations(
          [...nextConversations].sort((left, right) =>
            (right.lastMessage?.createdAt ?? right.createdAt).localeCompare(
              left.lastMessage?.createdAt ?? left.createdAt,
            ),
          ),
        );
        setError(null);
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "Failed to load conversations");
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
  }, [agentId]);

  const accountsById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const account = agentId ? accountsById.get(agentId) : undefined;

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/agents">
          <Button variant="ghost" size="icon" className="text-slate-500 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{account?.name ?? agentId}</h2>
            <p className="text-sm text-slate-500">Conversations & Message Streams</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading conversations...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <Link key={conversation.id} to={`/agents/${agentId}/conversations/${conversation.id}`}>
                <Card className="bg-[#0D0D0F] border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer group">
                  <CardContent className="p-6 flex items-center gap-6">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                      {conversation.kind === "group"
                        ? <Users className="w-6 h-6 text-blue-500" />
                        : <MessageSquare className="w-6 h-6 text-blue-500" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white truncate">
                          {conversationLabel(conversation, agentId ?? "", accountsById)}
                        </h3>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-white/5 border-white/10 text-slate-400">
                          {conversation.kind}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {conversation.lastMessage?.body ?? "No messages yet."}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-600 font-mono mb-2">
                        <Clock className="w-3 h-3" />
                        {new Date(conversation.lastMessage?.createdAt ?? conversation.createdAt).toLocaleString()}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-blue-500 transition-colors ml-auto" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
              <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No active conversations found for this account.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
