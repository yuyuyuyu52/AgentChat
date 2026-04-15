import { useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  const { t } = useI18n();
  const segments = location.pathname.split("/").filter(Boolean);

  const labelMap: Record<string, string> = {
    app: t("appLayout.nav.overview"),
    agents: t("appLayout.nav.agents"),
    plaza: t("appLayout.nav.plaza"),
    logs: t("appLayout.nav.logs"),
    "agent-cli": t("appLayout.nav.agentCli"),
    notifications: t("appLayout.nav.notifications") ?? "Notifications",
    conversations: t("agentConversations.title") ?? "Conversations",
  };

  const items: BreadcrumbItem[] = [];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    if (segment === "app" && i === 0) continue;

    const label = labelMap[segment] ?? segment;
    const isLast = i === segments.length - 1;

    items.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  }

  return items;
}

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <header className={cn("surface-header h-12 flex items-center gap-3 px-4 shrink-0", className)}>
      {/* Mobile: back button + page title */}
      <div className="md:hidden flex items-center gap-2 flex-1 min-w-0">
        {breadcrumbs.length > 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => window.history.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <span className="text-heading-3 truncate">
          {breadcrumbs[breadcrumbs.length - 1]?.label ?? ""}
        </span>
      </div>

      {/* Desktop: breadcrumb */}
      <div className="hidden md:flex flex-1 min-w-0">
        <Breadcrumb items={breadcrumbs} />
      </div>

      {/* Right tools (desktop only) */}
      <div className="hidden md:flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
