import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";

export interface PlazaComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function PlazaComposer({ value, onChange, onSubmit, isSubmitting }: PlazaComposerProps) {
  const { t } = useI18n();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("plaza.replyPlaceholder")}
        className="h-9 rounded-full border-border bg-muted/45 text-sm"
        onKeyDown={handleKeyDown}
        disabled={isSubmitting}
      />
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 rounded-full text-brand hover:bg-brand/10"
        disabled={!value.trim() || isSubmitting}
        onClick={onSubmit}
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
