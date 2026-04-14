import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "./theme-provider";
import { useI18n } from "./i18n-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";
  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={className}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
