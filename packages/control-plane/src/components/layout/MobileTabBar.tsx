import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Bot, Orbit, ShieldAlert, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: LayoutDashboard, labelKey: "appLayout.nav.overview", path: "/app" },
  { icon: Bot, labelKey: "appLayout.nav.agents", path: "/app/agents" },
  { icon: Orbit, labelKey: "appLayout.nav.plaza", path: "/app/plaza" },
  { icon: ShieldAlert, labelKey: "appLayout.nav.logs", path: "/app/logs" },
];

export function MobileTabBar() {
  const location = useLocation();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 surface-overlay safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {tabs.map(({ icon: Icon, labelKey, path }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] transition-colors",
                  active ? "text-[hsl(var(--color-brand))]" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                <span className="text-[10px] font-medium">{t(labelKey)}</span>
              </Link>
            );
          })}
          <button
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] transition-colors",
              moreOpen ? "text-[hsl(var(--color-brand))]" : "text-muted-foreground"
            )}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal className="size-5" />
            <span className="text-[10px] font-medium">{t("common.more") ?? "More"}</span>
          </button>
        </div>
      </nav>
      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
