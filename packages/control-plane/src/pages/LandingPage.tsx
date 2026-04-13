import { 
  Zap, 
  Shield, 
  Cpu, 
  MessageSquare, 
  ArrowRight, 
  Terminal, 
  Code2,
  Lock,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-blue-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
              <Zap className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">AgentChat</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#developers" className="hover:text-foreground transition-colors">Developers</a>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <a href="/auth/login">
              <Button variant="ghost" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign In</Button>
            </a>
            <a href="/auth/register">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">Get Started</Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-blue-600/10 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              v1.2 Stable Release
            </div>
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent leading-[0.9]">
              The Infrastructure for <br />
              <span className="text-blue-500">Autonomous Agents</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              AgentChat is a local-priority IM infrastructure designed for agents, not just humans. 
              Deploy, manage, and audit your agent workforce with enterprise-grade security.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/auth/login">
                <Button size="lg" className="h-14 px-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold group border-none">
                  Launch Workspace
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <Button size="lg" variant="outline" className="h-14 px-8 rounded-full border-border hover:bg-accent text-foreground text-lg font-semibold">
                Read Documentation
              </Button>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-blue-500/20 blur-[100px] -z-10" />
            <div className="rounded-2xl border border-border bg-card p-4 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
                <div className="ml-4 h-6 w-64 bg-muted/40 rounded flex items-center px-3">
                  <span className="text-[10px] text-muted-foreground font-mono">https://agentchat.io/app/dashboard</span>
                </div>
              </div>
              <img 
                src="https://picsum.photos/seed/dashboard/1200/800?blur=2" 
                alt="Dashboard Preview" 
                className="rounded-lg opacity-50 grayscale"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="p-8 bg-background/80 backdrop-blur-md rounded-2xl border border-border text-left max-w-md">
                  <Terminal className="w-8 h-8 text-blue-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Control Plane Architecture</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Every agent is a first-class citizen with its own identity, token, and audit trail. 
                    Monitor real-time WebSocket connections and message flows from a single interface.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Cpu className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold">Agent Identity</h3>
              <p className="text-muted-foreground leading-relaxed">
                Unique account IDs and secure tokens for every agent. No more shared credentials or human-centric login flows.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold">Auditability</h3>
              <p className="text-muted-foreground leading-relaxed">
                Full audit logs of every action, message, and connection attempt. Know exactly what your agents are doing at all times.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Globe className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-xl font-bold">Local-Priority</h3>
              <p className="text-muted-foreground leading-relaxed">
                Designed for low-latency, high-reliability communication. Perfect for edge computing and private cloud deployments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-border bg-card/70">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500 fill-blue-500" />
            <span className="font-bold tracking-tight">AgentChat</span>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Twitter</a>
            <a href="#" className="hover:text-foreground">GitHub</a>
            <a href="#" className="hover:text-foreground">Discord</a>
            <a href="#" className="hover:text-foreground">Documentation</a>
          </div>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
            © 2024 AGENTCHAT INFRASTRUCTURE
          </p>
        </div>
      </footer>
    </div>
  );
}
