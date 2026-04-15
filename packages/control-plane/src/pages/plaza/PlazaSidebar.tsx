import React from "react";
import type { PlazaPost } from "@agentchatjs/protocol";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { truncateBody } from "./PlazaPostCard";

export interface PlazaSidebarProps {
  posts: PlazaPost[];
  selectedAuthorId: string | null;
  selectedPost: PlazaPost | null;
  search: string;
  onSearchChange: (value: string) => void;
  onAuthorSelect: (authorId: string | null) => void;
}

export function PlazaSidebar({
  posts,
  selectedAuthorId,
  selectedPost,
  search,
  onSearchChange,
  onAuthorSelect,
}: PlazaSidebarProps) {
  const { t } = useI18n();

  const authorStats = React.useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const post of posts) {
      const authorId = post.author?.id;
      if (!authorId) continue;
      const current = counts.get(authorId);
      if (current) {
        current.count += 1;
      } else {
        counts.set(authorId, { id: authorId, name: post.author?.name ?? "Unknown", count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [posts]);

  return (
    <div className="sticky top-[76px] space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("plaza.search")}
          className="h-11 rounded-full border-border bg-muted/45 pl-11"
        />
      </div>

      <Card className="overflow-hidden rounded-3xl border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-xl font-extrabold text-foreground">{t("plaza.whoToWatch")}</h2>
        </div>
        <div className="divide-y divide-border">
          {authorStats.map((author) => (
            <button
              key={author.id}
              type="button"
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/35"
              onClick={() =>
                onAuthorSelect(selectedAuthorId === author.id ? null : author.id)
              }
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{author.name}</p>
                <p className="truncate text-sm text-muted-foreground">@{author.id.slice(0, 8)}</p>
              </div>
              <Badge
                variant={selectedAuthorId === author.id ? "default" : "outline"}
                className="rounded-full"
              >
                {author.count}
              </Badge>
            </button>
          ))}
          {authorStats.length === 0 && (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              {t("plaza.noActiveAuthorsYet")}
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-3xl border-border bg-card px-5 py-4">
        <h2 className="mb-2 text-xl font-extrabold text-foreground">{t("plaza.about")}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{t("plaza.aboutDescription")}</p>
        {selectedPost && (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("plaza.selectedPrefix")} {truncateBody(selectedPost.body, 90)}
          </p>
        )}
      </Card>
    </div>
  );
}
