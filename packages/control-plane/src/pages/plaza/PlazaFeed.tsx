import React from "react";
import type { PlazaPost } from "@agentchatjs/protocol";
import { Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { usePosts, useLikePost, useRepostPost } from "@/lib/queries/use-posts";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { PlazaPostCard } from "./PlazaPostCard";

export type FeedMode = "forYou" | "latest";

export interface PlazaFeedProps {
  activePostId?: string;
  selectedAuthorId: string | null;
  onAuthorClick: (authorId: string) => void;
  onClearAuthor: () => void;
  feedMode: FeedMode;
  onFeedModeChange: (mode: FeedMode) => void;
  search: string;
  /** Callback to expose the flat post list to the parent for sidebar/detail use */
  onPostsLoaded?: (posts: PlazaPost[]) => void;
}

export function PlazaFeed({
  activePostId,
  selectedAuthorId,
  onAuthorClick,
  onClearAuthor,
  feedMode,
  onFeedModeChange,
  search,
  onPostsLoaded,
}: PlazaFeedProps) {
  const { t } = useI18n();
  const deferredSearch = React.useDeferredValue(search);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching, refetch } =
    usePosts(selectedAuthorId ? { authorAccountId: selectedAuthorId } : undefined);

  const allPosts = React.useMemo(() => {
    const pages = data?.pages ?? [];
    let flat = pages.flat();
    if (feedMode === "latest") {
      flat = [...flat].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return flat;
  }, [data, feedMode]);

  const filteredPosts = React.useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return allPosts;
    return allPosts.filter((post) =>
      `${post.body ?? ""} ${post.author?.name ?? ""} ${post.author?.id ?? ""}`.toLowerCase().includes(query),
    );
  }, [deferredSearch, allPosts]);

  // Notify parent of loaded posts so sidebar and detail can use them
  const onPostsLoadedRef = React.useRef(onPostsLoaded);
  onPostsLoadedRef.current = onPostsLoaded;
  React.useEffect(() => {
    onPostsLoadedRef.current?.(allPosts);
  }, [allPosts]);

  const likeMutation = useLikePost();
  const repostMutation = useRepostPost();

  const handleLike = (postId: string, currentlyLiked: boolean) => {
    likeMutation.mutate({ postId, liked: currentlyLiked });
  };

  const handleRepost = (postId: string, currentlyReposted: boolean) => {
    repostMutation.mutate({ postId, reposted: currentlyReposted });
  };

  return (
    <section className="min-w-0 flex-1 border-x border-border bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="px-4 py-3 sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">{t("plaza.home")}</h1>
              <p className="text-xs text-muted-foreground">
                {selectedAuthorId ? t("plaza.filteredAuthorTimeline") : t("plaza.plazaTimeline")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => void refetch()}
            >
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-2 text-sm">
            <button
              type="button"
              className={cn(
                "flex justify-center pb-3 transition-colors",
                feedMode === "forYou"
                  ? "border-b-2 border-blue-500 font-semibold text-foreground"
                  : "border-b border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onFeedModeChange("forYou")}
            >
              {t("plaza.forYou")}
            </button>
            <button
              type="button"
              className={cn(
                "flex justify-center pb-3 transition-colors",
                feedMode === "latest"
                  ? "border-b-2 border-blue-500 font-semibold text-foreground"
                  : "border-b border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onFeedModeChange("latest")}
            >
              {t("plaza.latest")}
            </button>
          </div>
        </div>
      </header>

      {/* Author filter banner */}
      {selectedAuthorId && (
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-4 py-3">
            <p className="text-sm text-foreground">{t("plaza.showingPostsFromOneAuthor")}</p>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onClearAuthor}>
              {t("common.clear")}
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex min-h-[420px] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("plaza.loadingPosts")}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("plaza.noPostsMatchView")}</p>
        </div>
      ) : (
        <>
          <div>
            {filteredPosts.map((post) => (
              <PlazaPostCard
                key={post.id}
                post={post}
                active={post.id === activePostId}
                onLike={handleLike}
                onRepost={handleRepost}
                onAuthorClick={onAuthorClick}
              />
            ))}
          </div>

          <div className="border-t border-border px-4 py-5 sm:px-5">
            <Button
              variant="ghost"
              className="w-full rounded-full text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
              onClick={() => void fetchNextPage()}
              disabled={!hasNextPage || isFetchingNextPage}
            >
              {isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {hasNextPage ? t("plaza.showMorePosts") : t("plaza.nothingMoreToShow")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
