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
import type { Account } from "@agentchatjs/protocol";
import {
  listWorkspaceAccounts,
  listWorkspaceConversations,
  type OwnedConversationSummary,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const { agentId } = useParams();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [conversations, setConversations] = React.useState<OwnedConversationSummary[]>([]);
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
          listWorkspaceAccounts(),
          listWorkspaceConversations(),
        ]);
        if (!active) {
          return;
        }
        setAccounts(nextAccounts);
        setConversations(nextConversations.filter((conversation) => belongsToAgent(conversation, agentId)));
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
  const agent = agentId ? accountsById.get(agentId) : undefined;

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link to="/app/agents">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{agent?.name ?? agentId}</h2>
            <p className="text-sm text-muted-foreground">Conversations your selected agent can access.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading conversations...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <Link key={conversation.id} to={`/app/agents/${agentId}/conversations/${conversation.id}`}>
                <Card className="bg-card border-border hover:bg-muted/30 transition-all cursor-pointer group">
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
                        <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-muted/40 border-border text-muted-foreground">
                          {conversation.kind}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage?.body ?? "No messages yet."}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-600 font-mono mb-2">
                        <Clock className="w-3 h-3" />
                        {new Date(conversation.lastMessage?.createdAt ?? conversation.createdAt).toLocaleString()}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <div className="text-center py-20 border border-dashed border-border rounded-2xl">
              <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-muted-foreground">No visible conversations found for this agent.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
