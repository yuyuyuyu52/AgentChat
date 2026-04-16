import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Zap, Mail, Lock, ArrowRight, User, Eye, EyeOff,
  Workflow, MessageSquare, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "motion/react";
import { getUserSession, registerHumanUser } from "@/lib/auth-api";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/i18n";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParticleNetwork } from "@/components/landing/ParticleNetwork";

const highlights = [
  { icon: Workflow, gradient: "from-blue-500 to-cyan-400", titleKey: "register.highlight1Title", descKey: "register.highlight1Desc" },
  { icon: MessageSquare, gradient: "from-violet-500 to-purple-400", titleKey: "register.highlight2Title", descKey: "register.highlight2Desc" },
  { icon: Shield, gradient: "from-emerald-500 to-green-400", titleKey: "register.highlight3Title", descKey: "register.highlight3Desc" },
];

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
        if (!cancelled && session) window.location.replace("/app");
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEmailBlur = () => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t("register.invalidEmail") ?? "Invalid email format.");
    } else {
      setEmailError("");
    }
  };

  const handlePasswordBlur = () => {
    if (password && password.length < 6) {
      setPasswordError(t("register.passwordTooShort") ?? "Password must be at least 6 characters.");
    } else {
      setPasswordError("");
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsLoading(true);
      await registerHumanUser({ name, email, password });
      toast.success(t("register.accountInitialized"), { description: t("register.welcomeNetwork") });
      window.location.assign("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("register.registrationFailed"));
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_30%,rgba(139,92,246,0.1),transparent)]" />
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
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 mb-6">
            <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">{t("register.infrastructureReady")}</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
            <span className="text-foreground">{t("register.heroTitlePrefix")}</span>{" "}
            <span className="bg-gradient-to-r from-violet-400 to-blue-500 bg-clip-text text-transparent">{t("register.heroTitleAccent")}</span>
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-sm mb-10">
            {t("register.heroDescription")}
          </p>

          {/* Highlights */}
          <div className="space-y-4">
            {highlights.map((h, i) => (
              <motion.div
                key={h.titleKey}
                className="flex items-start gap-4"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
              >
                <div className={`size-10 shrink-0 rounded-[var(--radius-sm)] bg-gradient-to-br ${h.gradient} flex items-center justify-center shadow-lg`}>
                  <h.icon className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{t(h.titleKey) ?? ""}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(h.descKey) ?? ""}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom */}
        <div className="relative z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <span>© 2024 AgentChat Infrastructure</span>
        </div>
      </div>

      {/* Right — register form */}
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
          <p className="text-xs text-muted-foreground">{t("register.infrastructureReady")}</p>
        </div>

        <motion.div
          className="w-full max-w-sm space-y-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight">{t("register.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("register.description")}</p>
          </div>

          <form onSubmit={(event) => void handleRegister(event)} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("register.fullName")}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input id="name" placeholder="John Doe"
                    className="h-11 pl-10 transition-all focus-visible:ring-[hsl(var(--color-brand)/0.4)]"
                    value={name} onChange={(e) => setName(e.target.value)} required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("register.emailAddress")}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input id="email" type="email" placeholder="you@company.com"
                    className="h-11 pl-10 transition-all focus-visible:ring-[hsl(var(--color-brand)/0.4)]"
                    value={email} onChange={(e) => setEmail(e.target.value)} onBlur={handleEmailBlur} required
                  />
                </div>
                {emailError && <p className="text-xs text-danger">{emailError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("register.password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("register.passwordHint")}
                    className="h-11 pl-10 pr-10 transition-all focus-visible:ring-[hsl(var(--color-brand)/0.4)]"
                    value={password} onChange={(e) => setPassword(e.target.value)} onBlur={handlePasswordBlur} required
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (t("register.hidePassword") ?? "Hide password") : (t("register.showPassword") ?? "Show password")}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--line-soft)/0.3)] bg-[hsl(var(--surface-2)/0.3)] p-3">
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                {t("register.termsPrefix")} <span className="text-brand">{t("register.termsOfService")}</span> & <span className="text-brand">{t("register.privacyPolicy")}</span>
              </p>
            </div>

            <Button type="submit" disabled={isLoading}
              className="h-11 w-full rounded-full bg-brand-gradient hover:opacity-90 font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            >
              {isLoading ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> {t("register.initializing")}</>
              ) : (
                <>{t("register.initializeWorkspace")} <ArrowRight className="size-4" /></>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("register.alreadyHaveAccount")}{" "}
            <Link to="/auth/login" className="font-semibold text-brand hover:text-brand underline underline-offset-4">
              {t("register.signIn")}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
