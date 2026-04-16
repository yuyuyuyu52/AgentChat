import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bot, MessageSquare, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  id: string;
  type: "agent" | "conversation" | "audit";
  label: string;
  href: string;
}

const typeIcons = {
  agent: Bot,
  conversation: MessageSquare,
  audit: ShieldAlert,
};

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: SearchResult[] = [];

    const accounts = queryClient.getQueryData<any[]>(["accounts"]) ?? [];
    for (const a of accounts) {
      if (a.name?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q)) {
        items.push({ id: a.id, type: "agent", label: a.name ?? a.id, href: `/app/agents/${a.id}` });
      }
    }

    return items.slice(0, 10);
  }, [query, queryClient]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.href);
    onOpenChange(false);
    setQuery("");
  }, [navigate, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, results, selectedIndex, handleSelect, onOpenChange]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" onClick={() => onOpenChange(false)} />
      <div role="dialog" aria-modal="true" className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg surface-overlay rounded-[var(--radius-lg)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-[hsl(var(--line-soft)/0.4)]">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.searchPlaceholder") ?? "Search agents, conversations..."}
            className="flex-1 h-12 bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="text-caption text-muted-foreground/50 border border-[hsl(var(--line-soft)/0.4)] rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="p-2 max-h-64 overflow-y-auto">
            {results.map((result, index) => {
              const Icon = typeIcons[result.type];
              return (
                <button
                  key={result.id}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-sm)] text-body-sm transition-colors",
                    index === selectedIndex ? "bg-[hsl(var(--surface-2)/0.6)] text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{result.label}</span>
                  <span className="ml-auto text-caption text-muted-foreground/50">{result.type}</span>
                </button>
              );
            })}
          </div>
        )}
        {query && results.length === 0 && (
          <div className="p-8 text-center text-body-sm text-muted-foreground">{t("common.noResults") ?? "No results found"}</div>
        )}
      </div>
    </>
  );
}
