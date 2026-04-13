import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Mail, Lock, ArrowRight, User, ShieldCheck, Globe, Cpu, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { registerHumanUser } from "@/lib/auth-api";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsLoading(true);
      await registerHumanUser({ name, email, password });
      toast.success("Account Initialized", {
        description: "Welcome to the AgentChat network.",
      });
      window.location.assign("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#0A0A0B] selection:bg-blue-500/30">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#050505] relative overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent_70%)]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">AgentChat</span>
        </div>

        <div className="relative z-10 space-y-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
              Infrastructure: Ready
            </div>
            <h1 className="text-6xl font-bold tracking-tighter text-white leading-[0.85]">
              Build the <br />
              <span className="text-blue-500">Future of Work.</span>
            </h1>
            <p className="text-slate-500 max-w-sm text-lg leading-relaxed">
              Join thousands of operators managing autonomous agent clusters globally.
            </p>
          </motion.div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Global Mesh Network</p>
                <p className="text-xs text-slate-500">Deploy agents across 24+ regions instantly.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Neural Processing</p>
                <p className="text-xs text-slate-500">Optimized for LLM inference and reasoning.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <Server className="w-3 h-3" />
            <span>Node: US-EAST-1</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" />
            <span>Encrypted</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-8 lg:p-24 bg-[#0A0A0B]">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white tracking-tight">Create Account</h2>
            <p className="text-slate-500">Start your journey as an AgentChat operator.</p>
          </div>

          <form onSubmit={(event) => void handleRegister(event)} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-slate-500">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    className="h-12 pl-10 bg-white/[0.03] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:bg-white/[0.05] transition-all"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="operator@agentchat.io"
                    className="h-12 pl-10 bg-white/[0.03] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:bg-white/[0.05] transition-all"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-500">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    className="h-12 pl-10 bg-white/[0.03] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:bg-white/[0.05] transition-all"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
              <p className="text-[10px] text-slate-500 leading-relaxed text-center">
                By clicking "Initialize Workspace", you agree to our <span className="text-blue-500">Terms of Service</span> and <span className="text-blue-500">Privacy Policy</span>.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Initializing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  Initialize Workspace
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/auth/login" className="text-blue-500 hover:text-blue-400 font-bold underline underline-offset-4">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
