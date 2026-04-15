import { cn } from "@/lib/utils";

type StatusDotVariant = "online" | "offline" | "warning" | "error";

interface StatusDotProps {
  variant: StatusDotVariant;
  label?: string;
  className?: string;
}

const variantClasses: Record<StatusDotVariant, string> = {
  online: "bg-[hsl(var(--color-success))]",
  offline: "bg-muted-foreground/40",
  warning: "bg-[hsl(var(--color-warning))]",
  error: "bg-[hsl(var(--color-danger))]",
};

export function StatusDot({ variant, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("size-2 rounded-full shrink-0", variantClasses[variant])}
        aria-label={label ?? variant}
      />
      {label && <span className="text-caption text-muted-foreground">{label}</span>}
    </span>
  );
}
