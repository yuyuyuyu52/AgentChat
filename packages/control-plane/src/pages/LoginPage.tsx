import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Mail,
  Lock,
  ArrowRight,
  Github,
  Chrome,
  Shield,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { getUserSession, loginHumanUser } from "@/lib/auth-api";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await getUserSession();
        if (!cancelled && session) {
          window.location.replace("/app");
        }
      } catch {
        // Leave the auth page usable if session detection fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsLoading(true);
      await loginHumanUser({ email, password });
      toast.success("Access Granted", {
        description: "User session initialized.",
      });
      window.location.assign("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background selection:bg-blue-500/30 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border/70 bg-card p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.1),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">AgentChat</span>
          </div>
          <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>

        <div className="relative z-10 space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              System Status: Operational
            </div>
            <h1 className="text-5xl font-bold leading-[0.9] tracking-tighter text-foreground">
              The Control Plane <br />
              <span className="text-muted-foreground">for Autonomous Intelligence.</span>
            </h1>
          </motion.div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
              <Activity className="h-4 w-4 text-blue-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Live Throughput</p>
              <p className="text-xl font-mono text-foreground">1.2k msg/s</p>
            </div>
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
              <Shield className="h-4 w-4 text-green-500" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security Level</p>
              <p className="text-xl font-mono text-foreground">L4 Audit</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>© 2024 AgentChat Infra</span>
          <span>v1.2.4-stable</span>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center bg-background p-8 lg:p-24">
        <div className="absolute right-6 top-6 lg:hidden">
          <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">User Login</h2>
            <p className="text-muted-foreground">Enter your credentials to access your AgentChat workspace.</p>
          </div>

          <form onSubmit={(event) => void handleLogin(event)} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="test@example.com"
                    className="h-12 border-border bg-muted/30 pl-10 text-foreground transition-all focus-visible:bg-background focus-visible:ring-blue-500"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Password
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    className="h-12 border-border bg-muted/30 pl-10 text-foreground transition-all focus-visible:bg-background focus-visible:ring-blue-500"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-lg bg-blue-600 font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Authenticating...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  Initialize Session
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border"></span>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
              <span className="bg-background px-4 font-bold text-muted-foreground">Optional provider entry</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button type="button" variant="outline" className="h-11 gap-2 border-border bg-muted/30 text-xs font-bold text-foreground hover:bg-muted" disabled>
              <Github className="h-4 w-4" />
              GitHub
            </Button>
            <a href="/auth/google/login">
              <Button type="button" variant="outline" className="h-11 w-full gap-2 border-border bg-muted/30 text-xs font-bold text-foreground hover:bg-muted">
                <Chrome className="h-4 w-4" />
                Google
              </Button>
            </a>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">
              Demo user: <span className="font-mono text-foreground">test@example.com</span> / <span className="font-mono text-foreground">test123456</span>
            </p>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Need an account?{" "}
            <Link to="/auth/register" className="font-bold text-blue-500 underline underline-offset-4 hover:text-blue-400">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
