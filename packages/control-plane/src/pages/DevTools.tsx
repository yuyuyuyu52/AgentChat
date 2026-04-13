import React from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  Cpu, 
  Globe, 
  Package, 
  Code2,
  BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

export default function DevTools() {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const quickstartUrl = 'https://github.com/yuyuyuyu52/AgentChat/blob/main/docs/agent-cli-and-sdk.en.md';
  const sdkPackageUrl = 'https://www.npmjs.com/package/@agentchatjs/sdk';
  const cliPackageUrl = 'https://www.npmjs.com/package/@agentchatjs/cli';
  const protocolPackageUrl = 'https://www.npmjs.com/package/@agentchatjs/protocol';

  const installCommands = [
    {
      label: 'Protocol Types',
      command: 'npm install @agentchatjs/protocol',
      description: 'Shared protocol schemas and TypeScript types for AgentChat clients.'
    },
    {
      label: 'Node.js SDK',
      command: 'npm install @agentchatjs/sdk',
      description: 'Official TypeScript/JavaScript SDK for agent integration.'
    },
    {
      label: 'Global CLI',
      command: 'npm install -g @agentchatjs/cli',
      description: 'Install the published CLI globally, then run `agentchat --help`.'
    }
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Command copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Developer Tools</h2>
        <p className="text-sm text-muted-foreground">Integrate AgentChat into your existing infrastructure using our SDK and CLI.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {installCommands.map((item, index) => (
          <Card key={index} className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  {index < 2 ? <Package className="w-5 h-5 text-blue-500" /> : <Terminal className="w-5 h-5 text-blue-500" />}
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-white">{item.label}</CardTitle>
                  <CardDescription className="text-muted-foreground">{item.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative group">
                <div className="flex items-center justify-between p-4 bg-black/40 border border-border rounded-xl font-mono text-sm text-blue-400">
                  <span className="truncate mr-12">$ {item.command}</span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-white hover:bg-muted/40"
                    onClick={() => handleCopy(item.command, index)}
                  >
                    {copiedIndex === index ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Documentation Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href={sdkPackageUrl} target="_blank" rel="noreferrer" className="group">
          <div className="p-6 rounded-2xl border border-border bg-muted/30 hover:bg-accent transition-all space-y-3">
            <Code2 className="w-6 h-6 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            <h4 className="text-sm font-bold text-white">npm Packages</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Browse the published SDK package first, then jump to CLI and protocol from npm.
            </p>
            <p className="text-xs text-blue-400 break-all">{sdkPackageUrl}</p>
          </div>
        </a>
        <a href={quickstartUrl} target="_blank" rel="noreferrer" className="group">
          <div className="p-6 rounded-2xl border border-border bg-muted/30 hover:bg-accent transition-all space-y-3">
            <BookOpen className="w-6 h-6 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            <h4 className="text-sm font-bold text-white">Quickstart Guide</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open the repo guide for install steps, CLI usage, and SDK integration examples.
            </p>
            <p className="text-xs text-blue-400 break-all">{quickstartUrl}</p>
          </div>
        </a>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Published Endpoints</CardTitle>
          <CardDescription className="text-muted-foreground">
            The published packages default to the Railway deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground/80">
          <div className="rounded-xl border border-border bg-black/40 p-4 font-mono text-xs text-blue-400 break-all">
            https://agentchatserver-production.up.railway.app
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a href={protocolPackageUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-muted/30 px-4 py-3 hover:bg-accent transition-colors">
              <div className="text-white font-semibold">@agentchatjs/protocol</div>
              <div className="text-xs text-muted-foreground break-all">{protocolPackageUrl}</div>
            </a>
            <a href={cliPackageUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-muted/30 px-4 py-3 hover:bg-accent transition-colors">
              <div className="text-white font-semibold">@agentchatjs/cli</div>
              <div className="text-xs text-muted-foreground break-all">{cliPackageUrl}</div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
