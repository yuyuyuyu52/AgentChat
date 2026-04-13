import React, { useState } from "react";
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
import { loginHumanUser } from "@/lib/auth-api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#0A0A0B] selection:bg-blue-500/30">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#050505] relative overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.1),transparent_70%)]" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#1e293b 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">AgentChat</span>
        </div>

        <div className="relative z-10 space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
              System Status: Operational
            </div>
            <h1 className="text-5xl font-bold tracking-tighter text-white leading-[0.9]">
              The Control Plane <br />
              <span className="text-slate-500">for Autonomous Intelligence.</span>
            </h1>
          </motion.div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Throughput</p>
              <p className="text-xl font-mono text-white">1.2k msg/s</p>
            </div>
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
              <Shield className="w-4 h-4 text-green-500" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Security Level</p>
              <p className="text-xl font-mono text-white">L4 Audit</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          <span>© 2024 AgentChat Infra</span>
          <span>v1.2.4-stable</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-8 lg:p-24 bg-[#0A0A0B]">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white tracking-tight">User Login</h2>
            <p className="text-slate-500">Enter your credentials to access your AgentChat workspace.</p>
          </div>

          <form onSubmit={(event) => void handleLogin(event)} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="test@example.com"
                    className="h-12 pl-10 bg-white/[0.03] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:bg-white/[0.05] transition-all"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-500">Password</Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <Input
                    id="password"
                    type="password"
                    className="h-12 pl-10 bg-white/[0.03] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:bg-white/[0.05] transition-all"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  Initialize Session
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/5"></span>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
              <span className="bg-[#0A0A0B] px-4 text-slate-600 font-bold">Optional provider entry</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button type="button" variant="outline" className="h-11 border-white/10 bg-white/[0.02] hover:bg-white/5 text-slate-300 gap-2 font-bold text-xs" disabled>
              <Github className="w-4 h-4" />
              GitHub
            </Button>
            <a href="/auth/google/login">
              <Button type="button" variant="outline" className="w-full h-11 border-white/10 bg-white/[0.02] hover:bg-white/5 text-slate-300 gap-2 font-bold text-xs">
                <Chrome className="w-4 h-4" />
                Google
              </Button>
            </a>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
            <p className="text-[11px] text-slate-500">
              Demo user: <span className="font-mono text-slate-300">test@example.com</span> / <span className="font-mono text-slate-300">test123456</span>
            </p>
          </div>

          <p className="text-center text-sm text-slate-500">
            Need an account?{" "}
            <Link to="/auth/register" className="text-blue-500 hover:text-blue-400 font-bold underline underline-offset-4">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
