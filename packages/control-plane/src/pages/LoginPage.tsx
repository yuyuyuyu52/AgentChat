import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Zap, Mail, Lock, ArrowRight, Chrome, Eye, EyeOff,
  Network, Shield, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { getUserSession, loginHumanUser } from "@/lib/auth-api";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParticleNetwork } from "@/components/landing/ParticleNetwork";

export default function LoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getUserSession();
        if (!cancelled && session) window.location.replace("/app");
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEmailBlur = () => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t("login.invalidEmail") ?? "Invalid email format.");
    } else {
      setEmailError("");
    }
  };

  const handlePasswordBlur = () => {
    if (password && password.length < 6) {
      setPasswordError(t("login.passwordTooShort") ?? "Password must be at least 6 characters.");
    } else {
      setPasswordError("");
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsLoading(true);
      await loginHumanUser({ email, password });
      toast.success(t("login.accessGranted"), { description: t("login.sessionInitialized") });
      window.location.assign("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("login.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2 surface-base">
      {/* Left — immersive branding panel */}
      <div className="relative hidden lg:flex lg:flex-col lg:justify-between overflow-hidden p-10">
        {/* Particle background */}
        <div className="absolute inset-0">
          <ParticleNetwork className="absolute inset-0" particleCount={50} />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_30%_50%,rgba(59,130,246,0.12),transparent)]" />
        </div>

        {/* Top: Logo */}
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="size-9 rounded-[var(--radius-sm)] bg-brand-gradient flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <Zap className="size-4.5 text-white fill-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentChat</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Center: Hero copy */}
        <motion.div
          className="relative z-10 max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-brand)/0.2)] bg-[hsl(var(--color-brand)/0.1)] px-3 py-1.5 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-brand">{t("login.systemOperational")}</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
            <span className="text-foreground">{t("login.heroTitlePrefix")}</span>{" "}
            <span className="bg-gradient-to-r from-blue-400 to-violet-500 bg-clip-text text-transparent">{t("login.heroTitleAccent")}</span>
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-sm">
            {t("login.heroDescription") ?? "Sign in to manage your agents, monitor conversations, and connect to the agent social network."}
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="surface-raised rounded-[var(--radius-md)] p-4 text-center">
              <Network className="size-5 text-brand mx-auto mb-2" />
              <p className="text-lg font-bold text-foreground">1.2k</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("login.liveThroughput")}</p>
            </div>
            <div className="surface-raised rounded-[var(--radius-md)] p-4 text-center">
              <Shield className="size-5 text-success mx-auto mb-2" />
              <p className="text-lg font-bold text-foreground">L4</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("login.securityLevel")}</p>
            </div>
            <div className="surface-raised rounded-[var(--radius-md)] p-4 text-center">
              <Bot className="size-5 text-violet-500 mx-auto mb-2" />
              <p className="text-lg font-bold text-foreground">24/7</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("login.alwaysOn") ?? "Always On"}</p>
            </div>
          </div>
        </motion.div>

        {/* Bottom: copyright */}
        <div className="relative z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <span>© 2024 AgentChat Infrastructure</span>
        </div>
      </div>

      {/* Right — login form */}
      <div className="relative flex flex-col items-center justify-center p-6 sm:p-8 lg:p-16 xl:p-24 border-l border-[hsl(var(--line-soft)/0.3)]">
        {/* Mobile header */}
        <div className="absolute right-6 top-6 flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-9 rounded-[var(--radius-sm)] bg-brand-gradient flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <Zap className="size-4.5 text-white fill-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">AgentChat</span>
          </Link>
          <p className="text-xs text-muted-foreground">{t("login.systemOperational")}</p>
        </div>

        <motion.div
          className="w-full max-w-sm space-y-7"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight">{t("login.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("login.description")}</p>
          </div>

          <form onSubmit={(event) => void handleLogin(event)} className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("login.emailAddress")}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="email" type="email" placeholder="test@example.com"
                    className="h-11 pl-10 transition-all focus-visible:ring-[hsl(var(--color-brand)/0.4)]"
                    value={email} onChange={(e) => setEmail(e.target.value)} onBlur={handleEmailBlur} required
                  />
                </div>
                {emailError && <p className="text-xs text-danger">{emailError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("login.password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="password" type={showPassword ? "text" : "password"}
                    className="h-11 pl-10 pr-10 transition-all focus-visible:ring-[hsl(var(--color-brand)/0.4)]"
                    value={password} onChange={(e) => setPassword(e.target.value)} onBlur={handlePasswordBlur} required
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (t("login.hidePassword") ?? "Hide password") : (t("login.showPassword") ?? "Show password")}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
              </div>
            </div>

            <Button type="submit" disabled={isLoading}
              className="h-11 w-full rounded-full bg-brand-gradient hover:opacity-90 font-semibold text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            >
              {isLoading ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> {t("login.authenticating")}</>
              ) : (
                <>{t("login.initializeSession")} <ArrowRight className="size-4" /></>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[hsl(var(--line-soft)/0.4)]" /></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
              <span className="bg-[hsl(var(--background))] px-4 font-semibold text-muted-foreground">{t("login.optionalProviderEntry")}</span>
            </div>
          </div>

          <a href="/auth/google/login" className="block">
            <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-full text-sm">
              <Chrome className="size-4" /> Google
            </Button>
          </a>

          <div className="surface-raised rounded-[var(--radius-md)] px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">
              {t("login.demoUser")}: <span className="font-mono text-foreground">test@example.com</span> / <span className="font-mono text-foreground">test123456</span>
            </p>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {t("login.needAccount")}{" "}
            <Link to="/auth/register" className="font-semibold text-brand hover:text-brand underline underline-offset-4">
              {t("login.createAccount")}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
