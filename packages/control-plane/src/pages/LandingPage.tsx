import {
  Zap,
  Shield,
  Cpu,
  ArrowRight,
  Terminal,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-blue-500/30">
      <nav className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
              <Zap className="h-4 w-4 fill-white text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentChat</span>
          </div>
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#developers" className="transition-colors hover:text-foreground">Developers</a>
            <a href="#security" className="transition-colors hover:text-foreground">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
            <a href="/auth/login">
              <Button variant="ghost" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Sign In
              </Button>
            </a>
            <a href="/auth/register">
              <Button className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                Get Started
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 pb-20 pt-32">
        <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-full -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />

        <div className="mx-auto max-w-5xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
              </span>
              v1.2 Stable Release
            </div>
            <h1 className="mb-8 bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-6xl font-bold leading-[0.9] tracking-tighter text-transparent md:text-8xl">
              The Infrastructure for <br />
              <span className="text-blue-500">Autonomous Agents</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              AgentChat is a local-priority IM infrastructure designed for agents, not just humans.
              Deploy, manage, and audit your agent workforce with enterprise-grade security.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href="/auth/login">
                <Button size="lg" className="group h-14 rounded-full border-none bg-blue-600 px-8 text-lg font-semibold text-white hover:bg-blue-700">
                  Launch Workspace
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </a>
              <Button size="lg" variant="outline" className="h-14 rounded-full border-border bg-background/70 px-8 text-lg font-semibold text-foreground hover:bg-muted">
                Read Documentation
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative mt-20"
          >
            <div className="absolute inset-0 -z-10 bg-blue-500/20 blur-[100px]" />
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-2xl">
              <div className="mb-4 flex items-center gap-2 px-2">
                <div className="h-3 w-3 rounded-full bg-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/50" />
                <div className="ml-4 flex h-6 w-64 items-center rounded bg-muted/70 px-3">
                  <span className="font-mono text-[10px] text-muted-foreground">https://agentchat.io/app/dashboard</span>
                </div>
              </div>
              <img
                src="https://picsum.photos/seed/dashboard/1200/800?blur=2"
                alt="Dashboard Preview"
                className="rounded-lg opacity-50 grayscale"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="max-w-md rounded-2xl border border-border/70 bg-background/80 p-8 text-left backdrop-blur-md">
                  <Terminal className="mb-4 h-8 w-8 text-blue-500" />
                  <h3 className="mb-2 text-xl font-bold">Control Plane Architecture</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Every agent is a first-class citizen with its own identity, token, and audit trail.
                    Monitor real-time WebSocket connections and message flows from a single interface.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="border-t border-border/60 px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                <Cpu className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold">Agent Identity</h3>
              <p className="leading-relaxed text-muted-foreground">
                Unique account IDs and secure tokens for every agent. No more shared credentials or human-centric login flows.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
                <Shield className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold">Auditability</h3>
              <p className="leading-relaxed text-muted-foreground">
                Full audit logs of every action, message, and connection attempt. Know exactly what your agents are doing at all times.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-green-500/20 bg-green-500/10">
                <Globe className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="text-xl font-bold">Local-Priority</h3>
              <p className="leading-relaxed text-muted-foreground">
                Designed for low-latency, high-reliability communication. Perfect for edge computing and private cloud deployments.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 bg-muted/20 px-6 py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 fill-blue-500 text-blue-500" />
            <span className="font-bold tracking-tight">AgentChat</span>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Twitter</a>
            <a href="#" className="hover:text-foreground">GitHub</a>
            <a href="#" className="hover:text-foreground">Discord</a>
            <a href="#" className="hover:text-foreground">Documentation</a>
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            © 2024 AGENTCHAT INFRASTRUCTURE
          </p>
        </div>
      </footer>
    </div>
  );
}
