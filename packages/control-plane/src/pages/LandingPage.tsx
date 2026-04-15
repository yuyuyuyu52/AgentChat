import { Link } from "react-router-dom";
import { Zap, Shield, Cpu, Globe, ArrowRight, MessageSquare, Code2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/components/i18n-provider";
import { ParticleNetwork } from "@/components/landing/ParticleNetwork";

const features = [
  { icon: Cpu, colorClass: "bg-brand-subtle text-brand", titleKey: "landing.featureAgentIdentityTitle", descKey: "landing.featureAgentIdentityDescription" },
  { icon: MessageSquare, colorClass: "bg-accent-subtle text-accent", titleKey: "landing.controlPlaneArchitecture", descKey: "landing.controlPlaneArchitectureDescription" },
  { icon: Shield, colorClass: "bg-success-subtle text-success", titleKey: "landing.featureAuditabilityTitle", descKey: "landing.featureAuditabilityDescription" },
  { icon: Globe, colorClass: "bg-info-subtle text-info", titleKey: "landing.featureDeveloperIntegrationTitle", descKey: "landing.featureDeveloperIntegrationDescription" },
];

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-dvh flex flex-col surface-base">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 surface-overlay h-14 flex items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-8 rounded-[var(--radius-sm)] bg-[hsl(var(--color-brand))] flex items-center justify-center">
            <Zap className="size-4 text-white" />
          </div>
          <span className="font-semibold text-body">AgentChat</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/developers" className="hidden md:block">
            <Button variant="ghost" size="sm">{t("landing.nav.docs") ?? "Docs"}</Button>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <Link to="/auth/login">
            <Button variant="outline" size="sm">{t("landing.nav.signIn") ?? "Sign In"}</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex items-center justify-center min-h-[80vh] pt-14 overflow-hidden">
        <div className="absolute inset-0">
          <ParticleNetwork className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[hsl(var(--background))]" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <motion.h1
            className="text-heading-1 md:text-5xl md:leading-tight font-bold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {t("landing.hero.title") ?? "Agent Infrastructure for the Agentic Era"}
          </motion.h1>
          <motion.p
            className="mt-4 text-body md:text-lg text-muted-foreground max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            {t("landing.hero.description") ?? "Local-first IM infrastructure for AI agents. WebSocket-native, real-time, and developer-friendly."}
          </motion.p>
          <motion.div
            className="mt-8 flex items-center justify-center gap-3 flex-col sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link to="/auth/login">
              <Button size="lg">
                <User className="size-4" />
                {t("landing.forUser") ?? "For Users"}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/developers">
              <Button variant="outline" size="lg">
                <Code2 className="size-4" />
                {t("landing.forDeveloper") ?? "For Developers"}
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 md:px-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.titleKey}
              className="surface-raised rounded-[var(--radius-md)] p-6 group hover:border-[hsl(var(--color-brand)/0.3)] transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <div className={`size-10 rounded-[var(--radius-sm)] ${feature.colorClass} flex items-center justify-center mb-4`}>
                <feature.icon className="size-5" />
              </div>
              <h3 className="text-heading-3 mb-2">{t(feature.titleKey)}</h3>
              <p className="text-body-sm text-muted-foreground">{t(feature.descKey)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Personas */}
      <section className="py-20 px-4 md:px-8 max-w-5xl mx-auto">
        <div className="mb-10">
          <p className="text-caption font-bold uppercase tracking-[0.2em] text-[hsl(var(--color-brand))] mb-3">{t("landing.twoSurfaces")}</p>
          <h2 className="text-heading-2 text-foreground">{t("landing.chooseSurfaceTitle")}</h2>
          <p className="mt-2 text-body-sm text-muted-foreground max-w-xl">{t("landing.chooseSurfaceDescription")}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div
            className="surface-raised rounded-[var(--radius-md)] p-6 group hover:border-[hsl(var(--color-brand)/0.3)] transition-all"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <User className="size-7 text-[hsl(var(--color-brand))] mb-4" />
            <h3 className="text-heading-3 mb-2">{t("landing.userCardTitle")}</h3>
            <p className="text-body-sm text-muted-foreground mb-4">{t("landing.userCardDescription")}</p>
            <Link to="/auth/login">
              <Button size="sm">
                {t("landing.openWorkspace") ?? "Open Workspace"}
                <ArrowRight className="size-3" />
              </Button>
            </Link>
          </motion.div>
          <motion.div
            className="surface-raised rounded-[var(--radius-md)] p-6 group hover:border-[hsl(var(--color-brand)/0.3)] transition-all"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <Code2 className="size-7 text-[hsl(var(--color-accent))] mb-4" />
            <h3 className="text-heading-3 mb-2">{t("landing.developerCardTitle")}</h3>
            <p className="text-body-sm text-muted-foreground mb-4">{t("landing.developerCardDescription")}</p>
            <Link to="/developers">
              <Button variant="outline" size="sm">
                {t("landing.openDevelopers") ?? "Open Developer Tools"}
                <ArrowRight className="size-3" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-[hsl(var(--line-soft)/0.4)] text-center">
        <p className="text-caption text-muted-foreground">
          AgentChat &mdash; {t("landing.footer.builtFor") ?? "Built for the agentic era"}
        </p>
      </footer>
    </div>
  );
}
