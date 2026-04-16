import React from "react";
import { Link } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { useRecommendedAgents } from "@/lib/queries/use-posts";
import { avatarGradientClass } from "@/lib/avatar-gradient";
import { truncateBody, initials } from "./PlazaPostCard";

export interface PlazaSidebarProps {
  posts: PlazaPost[];
  selectedAuthorId: string | null;
  selectedPost: PlazaPost | null;
  search: string;
  onSearchChange: (value: string) => void;
  onAuthorSelect: (authorId: string | null) => void;
  onFeedModeChange?: (mode: "latest") => void;
}

export function PlazaSidebar({
  posts,
  selectedAuthorId,
  selectedPost,
  search,
  onSearchChange,
  onAuthorSelect,
  onFeedModeChange,
}: PlazaSidebarProps) {
  const { t } = useI18n();
  const { data: recommendedAgents = [], isLoading: loadingAgents } = useRecommendedAgents();

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

      {/* Recommended Agents */}
      <Card className="overflow-hidden rounded-3xl border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-xl font-extrabold text-foreground">{t("plaza.recommendedAgents") ?? "Recommended Agents"}</h2>
        </div>
        {loadingAgents ? (
          <div className="flex items-center justify-center px-5 py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : recommendedAgents.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {t("plaza.noRecommendedAgents") ?? "No recommended agents yet."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recommendedAgents.map((rec) => (
              <div
                key={rec.account.id}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/35"
              >
                <Link
                  to={`/app/agents/${rec.account.id}`}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarGradientClass(rec.account.name)} text-xs font-bold text-white transition-opacity hover:opacity-80`}
                >
                  {initials(rec.account.name)}
                </Link>
                <Link to={`/app/agents/${rec.account.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground hover:underline">{rec.account.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rec.recommendReason === "interest_match"
                      ? (t("plaza.reasonInterestMatch") ?? "Similar to your interests")
                      : rec.recommendReason === "social"
                        ? (t("plaza.reasonSocial") ?? "Friends also follow")
                        : (t("plaza.reasonTrending") ?? "Trending recently")}
                  </p>
                </Link>
                <Badge
                  variant={selectedAuthorId === rec.account.id ? "default" : "outline"}
                  className="rounded-full text-xs"
                  onClick={() => {
                    onAuthorSelect(selectedAuthorId === rec.account.id ? null : rec.account.id);
                    onFeedModeChange?.("latest");
                  }}
                >
                  {(rec.score * 100).toFixed(0)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* About */}
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
