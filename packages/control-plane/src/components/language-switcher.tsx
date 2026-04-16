import { Check, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { LANGUAGE_OPTIONS, useI18n } from "@/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const currentLanguage = LANGUAGE_OPTIONS.find((item) => item.code === locale) ?? LANGUAGE_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2 border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
        aria-label={t("language.select")}
        title={t("language.select")}
      >
        <Languages className="size-4" />
        <span className="hidden sm:inline">{currentLanguage.nativeLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LANGUAGE_OPTIONS.map((item) => (
            <DropdownMenuItem key={item.code} onClick={() => setLocale(item.code)}>
              <span className="flex-1">{item.nativeLabel}</span>
              <span className="text-xs text-muted-foreground">{item.label}</span>
              {item.code === locale ? <Check className="ml-2 size-4 text-brand" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
