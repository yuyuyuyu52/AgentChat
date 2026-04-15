import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, LayoutDashboard, Bot, Orbit, MoreHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useUnreadNotificationCount } from "@/lib/queries/use-notifications";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { cn } from "@/lib/utils";

const tabs = [
  { icon: LayoutDashboard, labelKey: "appLayout.nav.overview", path: "/app" },
  { icon: Bot, labelKey: "appLayout.nav.agents", path: "/app/agents" },
  { icon: Orbit, labelKey: "appLayout.nav.plaza", path: "/app/plaza" },
  { icon: Bell, labelKey: "appLayout.nav.notifications", path: "/app/notifications" },
];

export function MobileTabBar() {
  const location = useLocation();
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: countData } = useUnreadNotificationCount();
  const unreadCount = countData?.count ?? 0;

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
            const badge = path === "/app/notifications" && unreadCount > 0 ? unreadCount : 0;
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[48px] min-h-[44px] transition-colors",
                  active ? "text-[hsl(var(--color-brand))]" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full bg-[hsl(var(--color-brand))] text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
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
