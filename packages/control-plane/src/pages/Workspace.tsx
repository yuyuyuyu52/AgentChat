import React from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Copy,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import type { Account } from "@agentchat/protocol";
import {
  createAdminAccount,
  listAdminAccounts,
  resetAdminAccountToken,
} from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function maskToken(token: string | undefined): string {
  if (!token) {
    return "Hidden until issued or reset";
  }
  if (token.length <= 12) {
    return token;
  }
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export default function Workspace() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [latestTokens, setLatestTokens] = React.useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [newAgentName, setNewAgentName] = React.useState("");
  const [newAgentType, setNewAgentType] = React.useState<"agent" | "admin">("agent");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadAccounts = React.useCallback(async () => {
    try {
      setLoading(true);
      const nextAccounts = await listAdminAccounts();
      setAccounts(nextAccounts);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const filteredAccounts = React.useMemo(
    () =>
      accounts.filter((account) =>
        `${account.name} ${account.id}`.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [accounts, searchQuery],
  );

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      const createdAccount = await createAdminAccount({
        name: newAgentName.trim(),
        type: newAgentType,
      });
      setAccounts((current) => [...current, createdAccount]);
      setLatestTokens((current) => ({
        ...current,
        [createdAccount.id]: createdAccount.token,
      }));
      setNewAgentName("");
      setNewAgentType("agent");
      setIsCreateModalOpen(false);
      toast.success("Account created", {
        description: `${createdAccount.name} is ready to use.`,
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetToken = async (accountId: string) => {
    try {
      const result = await resetAdminAccountToken(accountId);
      setLatestTokens((current) => ({
        ...current,
        [accountId]: result.token,
      }));
      toast.success("Token rotated", {
        description: "The new credential is only shown once in this view.",
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Failed to rotate token");
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Agent Console</h2>
          <p className="text-sm text-slate-500">
            Issue identities, rotate tokens, and inspect conversations with real admin data.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search agents..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-lg">
                <Plus className="w-4 h-4" />
                Create Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0D0D0F] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Create New Account</DialogTitle>
                <DialogDescription className="text-slate-500">
                  The server will mint a new account id and a fresh token.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Sales Assistant"
                    className="bg-white/5 border-white/10"
                    value={newAgentName}
                    onChange={(event) => setNewAgentName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Account Type</Label>
                  <select
                    id="type"
                    className="flex h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                    value={newAgentType}
                    onChange={(event) => setNewAgentType(event.target.value as "agent" | "admin")}
                  >
                    <option value="agent">agent</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-xs text-blue-400 leading-relaxed">
                    <ShieldAlert className="w-3 h-3 inline mr-1" />
                    Tokens are only returned on create or reset. Persist them securely before leaving this page.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => void handleCreateAgent()}
                  disabled={submitting || !newAgentName.trim()}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-[#0D0D0F] border-white/5 overflow-hidden">
        <Table>
          <TableHeader className="bg-white/5">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Agent Identity
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Type
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Latest Token
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Created
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-white/5">
                <TableCell className="text-slate-500" colSpan={5}>Loading accounts...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow className="border-white/5">
                <TableCell className="text-red-400" colSpan={5}>{error}</TableCell>
              </TableRow>
            ) : filteredAccounts.map((account) => (
              <TableRow key={account.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center border",
                      account.type === "admin"
                        ? "bg-yellow-500/10 border-yellow-500/20"
                        : "bg-blue-500/10 border-blue-500/20",
                    )}>
                      <Bot className={cn("w-5 h-5", account.type === "admin" ? "text-yellow-500" : "text-blue-500")} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-none mb-1">{account.name}</p>
                      <p className="text-xs font-mono text-slate-500">{account.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-2 py-0 text-[10px] font-bold uppercase tracking-tighter",
                      account.type === "admin"
                        ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        : "bg-green-500/10 text-green-500 border-green-500/20",
                    )}
                  >
                    {account.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-slate-400 bg-white/5 px-2 py-1 rounded border border-white/5">
                      {maskToken(latestTokens[account.id])}
                    </code>
                    {latestTokens[account.id] && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => void copyToClipboard(latestTokens[account.id]!)}
                      >
                        <Copy className="w-3 h-3 text-slate-500" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {new Date(account.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/agents/${account.id}/conversations`}>
                      <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                        View
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      onClick={() => void handleResetToken(account.id)}
                    >
                      <KeyRound className="w-3 h-3 mr-1" />
                      Reset
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {!loading && filteredAccounts.length === 0 && (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
          <Bot className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">No accounts matched the current filter.</p>
        </div>
      )}
    </div>
  );
}
