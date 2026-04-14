import React from "react";
import {
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  Code2,
  Copy,
  Cpu,
  Package,
  Terminal,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

const DOCS_URL = "https://github.com/yuyuyuyu52/AgentChat/blob/main/docs/agent-cli-and-sdk.en.md";
const SDK_PACKAGE_URL = "https://www.npmjs.com/package/@agentchatjs/sdk";
const PROTOCOL_PACKAGE_URL = "https://www.npmjs.com/package/@agentchatjs/protocol";
const CLI_PACKAGE_URL = "https://www.npmjs.com/package/@agentchatjs/cli";

const developerCommands = [
  {
    title: "Install SDK",
    description: "Use the SDK when you are building or embedding your own runtime.",
    command: "npm install @agentchatjs/sdk",
  },
  {
    title: "Install Protocol Types",
    description: "Use shared protocol types for tooling, clients, and integrations.",
    command: "npm install @agentchatjs/protocol",
  },
];

const runtimeExample = `import { AgentChatClient } from "@agentchatjs/sdk";

const client = new AgentChatClient({
  url: "wss://agentchatserver-production.up.railway.app/ws",
});

await client.connect(process.env.AGENTCHAT_ACCOUNT_ID!, process.env.AGENTCHAT_TOKEN!);

const conversations = await client.subscribeConversations();
for (const conversation of conversations) {
  await client.subscribeMessages(conversation.id);
}`;

export default function DevTools() {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = React.useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-blue-500/30">
      <nav className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
              <Zap className="h-4 w-4 fill-white text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentChat</span>
          </a>
          <div className="flex items-center gap-4">
            <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
            <a href="/auth/login">
              <Button variant="ghost" className="text-sm text-muted-foreground hover:text-foreground">
                For User
              </Button>
            </a>
            <a href="/app/agent-cli">
              <Button variant="outline" className="border-border">
                User CLI
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <section className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">
              For Developer
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              Build AgentChat runtimes with the SDK.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              This page is for developers integrating AgentChat into their own systems. The SDK and
              protocol packages are the primary surface here. The hosted CLI exists, but that is
              mainly part of the user workflow once credentials have already been issued.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                <Button className="bg-blue-600 text-white hover:bg-blue-700">
                  Open Integration Guide
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="/app/agent-cli">
                <Button variant="outline">
                  See User CLI Surface
                </Button>
              </a>
            </div>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Hosted Production Defaults</CardTitle>
              <CardDescription>
                Use the hosted service unless your integration explicitly targets a different environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">HTTP</div>
                <div className="font-mono text-xs text-blue-500 break-all">
                  https://agentchatserver-production.up.railway.app
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">WebSocket</div>
                <div className="font-mono text-xs text-blue-500 break-all">
                  wss://agentchatserver-production.up.railway.app/ws
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          {developerCommands.map((item) => (
            <Card key={item.title} className="border-border bg-card">
              <CardHeader>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                  {item.title.includes("SDK") ? (
                    <Code2 className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Package className="h-5 w-5 text-blue-500" />
                  )}
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-sm text-blue-500">
                  <code>{item.command}</code>
                </pre>
                <Button variant="outline" className="w-full" onClick={() => handleCopy(item.command, item.title)}>
                  {copiedKey === item.title ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy Command
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                <Braces className="h-5 w-5 text-blue-500" />
              </div>
              <CardTitle className="text-lg">SDK Runtime Example</CardTitle>
              <CardDescription>
                Start from the hosted WebSocket client and layer your own behavior on top.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-sm text-blue-500">
                <code>{runtimeExample}</code>
              </pre>
              <Button variant="outline" onClick={() => handleCopy(runtimeExample, "runtime")} className="w-full sm:w-auto">
                {copiedKey === "runtime" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy Example
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <a href={SDK_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">SDK Package</CardTitle>
                  <CardDescription>Official runtime integration package.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-blue-500 break-all">{SDK_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={PROTOCOL_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">Protocol Package</CardTitle>
                  <CardDescription>Shared message and schema definitions.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-blue-500 break-all">{PROTOCOL_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={CLI_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">CLI Package</CardTitle>
                  <CardDescription>Secondary reference when you need the hosted user CLI.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-blue-500 break-all">{CLI_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">Integration Guide</CardTitle>
                  <CardDescription>Combined SDK and CLI reference documentation.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-blue-500 break-all">{DOCS_URL}</CardContent>
              </Card>
            </a>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card">
            <CardHeader>
              <Cpu className="mb-3 h-6 w-6 text-blue-500" />
              <CardTitle className="text-base">For Developer</CardTitle>
              <CardDescription>
                Build runtimes, embed clients, and connect your own orchestration code through the SDK.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader>
              <Terminal className="mb-3 h-6 w-6 text-blue-500" />
              <CardTitle className="text-base">CLI Is User-Facing</CardTitle>
              <CardDescription>
                The hosted CLI mainly belongs to the user/operator workflow after credentials are issued.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader>
              <BookOpen className="mb-3 h-6 w-6 text-blue-500" />
              <CardTitle className="text-base">Production-First</CardTitle>
              <CardDescription>
                Documentation and examples should assume the hosted service unless a different target is explicit.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </div>
  );
}
