import React from "react";
import { Link } from "react-router-dom";
import { Bot, Copy, KeyRound, Plus, Search, ShieldAlert } from "lucide-react";
import type { Account } from "@agentchatjs/protocol";
import {
  createWorkspaceAccount,
  listWorkspaceAccounts,
  resetWorkspaceAccountToken,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

function maskToken(token: string | undefined): string {
  if (!token) {
    return "Hidden until issued or reset";
  }
  return token.length <= 12 ? token : `${token.slice(0, 8)}...${token.slice(-4)}`;
}

export default function Workspace() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [latestTokens, setLatestTokens] = React.useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [newAgentName, setNewAgentName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadAccounts = React.useCallback(async () => {
    try {
      setLoading(true);
      const nextAccounts = await listWorkspaceAccounts();
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
      const createdAccount = await createWorkspaceAccount({
        name: newAgentName.trim(),
        type: "agent",
      });
      setAccounts((current) => [...current, createdAccount]);
      setLatestTokens((current) => ({ ...current, [createdAccount.id]: createdAccount.token }));
      setNewAgentName("");
      setIsCreateModalOpen(false);
      toast.success("Agent created", {
        description: "The token is shown once here after creation.",
      });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetToken = async (accountId: string) => {
    try {
      const result = await resetWorkspaceAccountToken(accountId);
      setLatestTokens((current) => ({ ...current, [accountId]: result.token }));
      toast.success("Token rotated");
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : "Failed to rotate token");
    }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(token);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">My Agents</h2>
          <p className="text-sm text-muted-foreground">Create and manage agent accounts owned by your user session.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-10 focus-visible:ring-blue-500"
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
            <DialogContent className="surface-float border-transparent text-foreground">
              <DialogHeader>
                <DialogTitle>Create New Agent</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  The workspace creates a new owned agent account and returns its token once.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Display Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Sales Assistant"
                    value={newAgentName}
                    onChange={(event) => setNewAgentName(event.target.value)}
                  />
                </div>
                <div className="surface-panel-subtle rounded-2xl border-transparent bg-[linear-gradient(180deg,rgba(37,99,235,0.12),rgba(37,99,235,0.05))] p-4">
                  <p className="text-xs text-blue-400 leading-relaxed">
                    <ShieldAlert className="w-3 h-3 inline mr-1" />
                    Save the token before you navigate away. The API will not return it again unless you reset it.
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

      <Card className="overflow-hidden border-transparent">
        <Table>
          <TableHeader className="bg-[hsl(var(--surface-2)/0.52)]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Agent</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Type</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Latest Token</TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Created</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>Loading agents...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell className="text-red-400" colSpan={5}>{error}</TableCell>
              </TableRow>
            ) : filteredAccounts.map((account) => (
              <TableRow key={account.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="surface-chip flex h-10 w-10 items-center justify-center rounded-2xl border-transparent bg-[linear-gradient(180deg,rgba(37,99,235,0.16),rgba(37,99,235,0.08))]">
                      <Bot className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="mb-1 text-sm font-bold leading-none text-foreground">{account.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{account.id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-bold uppercase tracking-tighter bg-[linear-gradient(180deg,rgba(34,197,94,0.16),rgba(34,197,94,0.08))] text-green-600 dark:text-green-400">
                    {account.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="surface-chip rounded-xl border-transparent px-2 py-1 text-xs font-mono text-muted-foreground">
                      {maskToken(latestTokens[account.id])}
                    </code>
                    {latestTokens[account.id] && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => void handleCopy(latestTokens[account.id]!)}
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(account.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/app/agents/${account.id}/conversations`}>
                      <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">View</Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-foreground/80"
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
    </div>
  );
}
