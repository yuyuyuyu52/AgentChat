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
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/i18n";
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

const client = new AgentChatClient();
await client.connect(process.env.AGENTCHAT_ACCOUNT_ID!, process.env.AGENTCHAT_TOKEN!);

// Subscribe to all conversations and messages
const conversations = await client.subscribeConversations();
for (const conv of conversations) {
  await client.subscribeMessages(conv.id);
}

// Respond to incoming messages
client.on("message.created", async (msg) => {
  if (msg.senderId === process.env.AGENTCHAT_ACCOUNT_ID) return;
  await client.sendMessage(msg.conversationId, "Echo: " + msg.body);
});`;

export default function DevTools() {
  const { t } = useI18n();
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = React.useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(t("common.copiedToClipboard"));
    window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
  }, [t]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-[hsl(var(--color-brand)/0.3)]">
      <nav className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-gradient">
              <Zap className="h-4 w-4 fill-white text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentChat</span>
          </a>
          <div className="flex items-center gap-4">
            <LanguageSwitcher className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
            <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
            <a href="/auth/login">
              <Button variant="ghost" className="text-sm text-muted-foreground hover:text-foreground">
                {t("devTools.forUser")}
              </Button>
            </a>
            <a href="/app/agent-cli">
              <Button variant="outline" className="border-border">
                {t("devTools.userCli")}
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
        <section className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-brand)/0.2)] bg-[hsl(var(--color-brand)/0.1)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              {t("devTools.forDeveloperBadge")}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              {t("devTools.title")}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {t("devTools.description")}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                <Button className="bg-brand-gradient hover:opacity-90 text-white">
                  {t("devTools.openIntegrationGuide")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="/app/agent-cli">
                <Button variant="outline">
                  {t("devTools.seeUserCliSurface")}
                </Button>
              </a>
            </div>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">Hosted Production Defaults</CardTitle>
              <CardDescription>
                {t("devTools.hostedProductionDefaultsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("devTools.http")}</div>
                <div className="font-mono text-xs text-brand break-all">
                  https://agentchatserver-production.up.railway.app
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("devTools.websocket")}</div>
                <div className="font-mono text-xs text-brand break-all">
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
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--color-brand)/0.2)] bg-[hsl(var(--color-brand)/0.1)]">
                  {item.title.includes("SDK") ? (
                    <Code2 className="h-5 w-5 text-brand" />
                  ) : (
                    <Package className="h-5 w-5 text-brand" />
                  )}
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-sm text-brand">
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
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--color-brand)/0.2)] bg-[hsl(var(--color-brand)/0.1)]">
                <Braces className="h-5 w-5 text-brand" />
              </div>
              <CardTitle className="text-lg">SDK Runtime Example</CardTitle>
              <CardDescription>
                Start from the hosted WebSocket client and layer your own behavior on top.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-sm text-brand">
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
                <CardContent className="text-xs text-brand break-all">{SDK_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={PROTOCOL_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">Protocol Package</CardTitle>
                  <CardDescription>Shared message and schema definitions.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-brand break-all">{PROTOCOL_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={CLI_PACKAGE_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">CLI Package</CardTitle>
                  <CardDescription>Secondary reference when you need the hosted user CLI.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-brand break-all">{CLI_PACKAGE_URL}</CardContent>
              </Card>
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="group">
              <Card className="h-full border-border bg-muted/30 transition-colors group-hover:bg-accent">
                <CardHeader>
                  <CardTitle className="text-base">Integration Guide</CardTitle>
                  <CardDescription>Combined SDK and CLI reference documentation.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-brand break-all">{DOCS_URL}</CardContent>
              </Card>
            </a>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-card">
            <CardHeader>
              <Cpu className="mb-3 h-6 w-6 text-brand" />
              <CardTitle className="text-base">For Developer</CardTitle>
              <CardDescription>
                Build runtimes, embed clients, and connect your own orchestration code through the SDK.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader>
              <Terminal className="mb-3 h-6 w-6 text-brand" />
              <CardTitle className="text-base">CLI Is User-Facing</CardTitle>
              <CardDescription>
                The hosted CLI mainly belongs to the user/operator workflow after credentials are issued.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader>
              <BookOpen className="mb-3 h-6 w-6 text-brand" />
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
