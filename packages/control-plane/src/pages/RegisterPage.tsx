import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Mail, Lock, ArrowRight, User, ShieldCheck, Globe, Cpu, Server, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { getUserSession, registerHumanUser } from "@/lib/auth-api";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export default function RegisterPage() {
  const { t } = useI18n();
  const [name, setName] = useState("");
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

  const handleEmailBlur = () => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handlePasswordBlur = () => {
    if (password && password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
    } else {
      setPasswordError("");
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsLoading(true);
      await registerHumanUser({ name, email, password });
      toast.success(t("register.accountInitialized"), {
        description: t("register.welcomeNetwork"),
      });
      window.location.assign("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("register.registrationFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background selection:bg-blue-500/30 lg:grid-cols-2">
      {/* Left branding panel — hidden on mobile */}
      <div className="relative hidden overflow-hidden border-r border-border/70 bg-card p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "40px 40px" }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">AgentChat</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
            <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          </div>
        </div>

        <div className="relative z-10 space-y-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              {t("register.infrastructureReady")}
            </div>
            <h1 className="text-6xl font-bold leading-[0.85] tracking-tighter text-foreground">
              {t("register.heroTitlePrefix")} <br />
              <span className="text-blue-500">{t("register.heroTitleAccent")}</span>
            </h1>
            <p className="max-w-sm text-lg leading-relaxed text-muted-foreground">
              {t("register.heroDescription")}
            </p>
          </motion.div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Globe className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t("register.globalMeshNetwork")}</p>
                <p className="text-xs text-muted-foreground">{t("register.globalMeshDescription")}</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Cpu className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t("register.neuralProcessing")}</p>
                <p className="text-xs text-muted-foreground">{t("register.neuralDescription")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <Server className="h-3 w-3" />
            <span>{t("register.node")}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3 w-3" />
            <span>{t("register.encrypted")}</span>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center bg-background p-8 lg:p-24">
        {/* Mobile controls row */}
        <div className="absolute right-6 top-6 flex items-center gap-2 lg:hidden">
          <LanguageSwitcher className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
          <ThemeToggle className="border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>

        {/* Mobile logo + tagline */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              <Zap className="h-5 w-5 fill-white text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">AgentChat</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("register.infrastructureReady")}</p>
        </div>

        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{t("register.title")}</h2>
            <p className="text-muted-foreground">{t("register.description")}</p>
          </div>

          <form onSubmit={(event) => void handleRegister(event)} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("register.fullName")}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    className="h-12 border-border bg-muted/30 pl-10 text-foreground transition-all focus-visible:bg-background focus-visible:ring-blue-500"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("register.emailAddress")}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="operator@agentchat.io"
                    className="h-12 border-border bg-muted/30 pl-10 text-foreground transition-all focus-visible:bg-background focus-visible:ring-blue-500"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={handleEmailBlur}
                    required
                  />
                </div>
                {emailError && <p className="text-xs text-danger">{emailError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("register.password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("register.passwordHint")}
                    className="h-12 border-border bg-muted/30 pl-10 pr-10 text-foreground transition-all focus-visible:bg-background focus-visible:ring-blue-500"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={handlePasswordBlur}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
              </div>
            </div>

            <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-4">
              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                {t("register.termsPrefix")} <span className="text-blue-500">{t("register.termsOfService")}</span> and <span className="text-blue-500">{t("register.privacyPolicy")}</span>.
              </p>
            </div>

            <Button
              type="submit"
              className="h-12 w-full rounded-lg bg-blue-600 font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  {t("register.initializing")}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {t("register.initializeWorkspace")}
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("register.alreadyHaveAccount")}{" "}
            <Link to="/auth/login" className="font-bold text-blue-500 underline underline-offset-4 hover:text-blue-400">
              {t("register.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
