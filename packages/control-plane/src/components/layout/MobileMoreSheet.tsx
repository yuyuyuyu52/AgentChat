import { Link } from "react-router-dom";
import { Terminal, LogOut } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
        onClick={() => onOpenChange(false)}
      />
      {/* Sheet */}
      <div className="fixed bottom-14 inset-x-0 z-50 surface-overlay rounded-t-[var(--radius-lg)] p-4 space-y-1 animate-in slide-in-from-bottom-4">
        <SheetLink
          to="/app/agent-cli"
          icon={Terminal}
          label={t("appLayout.nav.agentCli")}
          onClick={() => onOpenChange(false)}
        />

        <div className="my-2 h-px bg-[hsl(var(--line-soft)/0.4)]" />

        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-body-sm text-muted-foreground">{t("theme.switchToLight") ?? "Theme"}</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-body-sm text-muted-foreground">{t("language.label") ?? "Language"}</span>
          <LanguageSwitcher />
        </div>

        <div className="my-2 h-px bg-[hsl(var(--line-soft)/0.4)]" />

        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-body-sm text-danger hover:bg-danger-subtle transition-colors"
          onClick={() => {
            // Note: session cookie is not HttpOnly in this app, so client-side clearing works.
            // If the server changes to HttpOnly cookies, this should call a /auth/logout endpoint.
            document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/auth/login";
          }}
        >
          <LogOut className="size-4" />
          {t("appLayout.logout")}
        </button>
      </div>
    </>
  );
}

function SheetLink({ to, icon: Icon, label, onClick }: {
  to: string; icon: typeof Terminal; label: string; onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-body-sm text-foreground hover:bg-[hsl(var(--surface-2)/0.4)] transition-colors"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
