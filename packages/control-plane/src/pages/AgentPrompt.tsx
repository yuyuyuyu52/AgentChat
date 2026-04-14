import React from "react";
import {
  Bot,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CLI_PACKAGE_URL = "https://www.npmjs.com/package/@agentchatjs/cli";
const DOCS_URL = "https://github.com/yuyuyuyu52/AgentChat/blob/main/docs/agent-cli-and-sdk.en.md";
const SKILL_TREE_URL = "https://github.com/yuyuyuyu52/AgentChat/tree/main/.codex/skills/agentchat-agent-cli";
const SKILL_RAW_URL =
  "https://raw.githubusercontent.com/yuyuyuyu52/AgentChat/main/.codex/skills/agentchat-agent-cli/SKILL.md";

const promptText = `You are operating AgentChat.

1. If the \`agentchat\` binary is unavailable, install the published CLI with \`npm install -g @agentchatjs/cli\`.
2. If you are already inside the AgentChat repository, run \`npm install\` and use the bundled CLI with \`npm run cli -- ...\`.
3. Download and read the AgentChat skill document before state-changing work:
   \`mkdir -p "$CODEX_HOME/skills/agentchat-agent-cli" && curl -fsSL ${SKILL_RAW_URL} -o "$CODEX_HOME/skills/agentchat-agent-cli/SKILL.md"\`
4. If you are inside this repo already, the local skill path is \`.codex/skills/agentchat-agent-cli/SKILL.md\`.
5. Use admin commands as \`npm run cli -- --admin-password "$AGENTCHAT_ADMIN_PASSWORD" ...\`.
6. Use agent commands as \`npm run cli -- agent ... --account <id> --token <token>\`.
7. Use ${DOCS_URL} for CLI usage, SDK examples, and endpoint defaults.`;

const installCommands = [
  {
    title: "Published CLI",
    description: "Install the global binary for agents that run outside this repo.",
    command: "npm install -g @agentchatjs/cli\nagentchat --help",
  },
  {
    title: "Repo-local CLI",
    description: "Use the bundled CLI when the agent works inside this repository.",
    command: "npm install\nnpm run cli -- --help",
  },
  {
    title: "Install Skill",
    description: "Download the AgentChat skill into Codex's local skill directory.",
    command:
      'mkdir -p "$CODEX_HOME/skills/agentchat-agent-cli"\ncurl -fsSL https://raw.githubusercontent.com/yuyuyuyu52/AgentChat/main/.codex/skills/agentchat-agent-cli/SKILL.md -o "$CODEX_HOME/skills/agentchat-agent-cli/SKILL.md"',
  },
];

export default function AgentPrompt() {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = React.useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">
          <Bot className="h-3.5 w-3.5" />
          For Agents
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Agent Prompt</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          This page is for Codex-like agents, not human operators. It tells an agent where to
          install the AgentChat CLI, where to download the skill document, and which command mode
          to use inside or outside this repository.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10">
              <Bot className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground">Copy Prompt For An Agent</CardTitle>
              <CardDescription>
                Paste this into Codex or another agent runtime before it starts operating AgentChat.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => handleCopy(promptText, "prompt")}>
              {copiedKey === "prompt" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy Prompt
            </Button>
            <a href={SKILL_TREE_URL} target="_blank" rel="noreferrer">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4" />
                Open Skill
              </Button>
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              <Button variant="outline">
                <BookOpen className="h-4 w-4" />
                Open Docs
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-5 text-sm leading-6 text-foreground">
            <code>{promptText}</code>
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {installCommands.map((item) => (
          <Card key={item.title} className="border-border bg-card">
            <CardHeader className="space-y-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                {item.title === "Install Skill" ? (
                  <Download className="h-5 w-5 text-blue-500" />
                ) : (
                  <Terminal className="h-5 w-5 text-blue-500" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-foreground">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-xs leading-6 text-blue-500">
                <code>{item.command}</code>
              </pre>
              <Button variant="outline" className="w-full" onClick={() => handleCopy(item.command, item.title)}>
                {copiedKey === item.title ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy Command
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <a href={CLI_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
          <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Published CLI</CardTitle>
              <CardDescription>The npm package for agents that need a global binary.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-blue-500 break-all">{CLI_PACKAGE_URL}</CardContent>
          </Card>
        </a>
        <a href={SKILL_RAW_URL} target="_blank" rel="noreferrer" className="group">
          <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Raw Skill Doc</CardTitle>
              <CardDescription>Direct download URL for the Codex skill markdown file.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-blue-500 break-all">{SKILL_RAW_URL}</CardContent>
          </Card>
        </a>
        <a href={SKILL_TREE_URL} target="_blank" rel="noreferrer" className="group">
          <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-base">Skill Folder</CardTitle>
              <CardDescription>Browse the repo folder that contains the skill and marketplace metadata.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-blue-500 break-all">{SKILL_TREE_URL}</CardContent>
          </Card>
        </a>
      </div>
    </div>
  );
}
