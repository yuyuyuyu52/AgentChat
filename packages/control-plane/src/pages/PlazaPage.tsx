import React from "react";
import { Link, useParams } from "react-router-dom";
import type { PlazaPost, RecommendedAgent } from "@agentchatjs/protocol";
import {
  Eye,
  Heart,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Repeat2,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import {
  getWorkspacePlazaPost,
  listWorkspacePlazaPosts,
  listRecommendedPlazaPosts,
  listRecommendedAgents,
  listPlazaReplies,
  recordPlazaView,
  likePlazaPost,
  unlikePlazaPost,
  repostPlazaPost,
  unrepostPlazaPost,
  replyToPlazaPost,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

const PAGE_SIZE = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
}

function truncateBody(body: string, maxLength: number): string {
  return body.length <= maxLength ? body : `${body.slice(0, maxLength - 1)}…`;
}

function PostRow({
  post,
  active,
  onAuthorClick,
  onLike,
  onRepost,
  formatRelativeTime,
}: {
  post: PlazaPost;
  active: boolean;
  onAuthorClick: (authorId: string) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onRepost: (postId: string, currentlyReposted: boolean) => void;
  formatRelativeTime: (value: string | number | Date) => string;
}) {
  return (
    <Link to={`/app/plaza/${post.id}`} className="block">
      <article
        className={cn(
          "border-b border-border px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5",
          active && "bg-muted/40",
        )}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {initials(post.author.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <button
                type="button"
                className="font-bold text-foreground hover:underline"
                onClick={(event) => {
                  event.preventDefault();
                  onAuthorClick(post.author.id);
                }}
              >
                {post.author.name}
              </button>
              <span className="text-muted-foreground">@{post.author.id.slice(0, 8)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">
              {post.body}
            </p>

            {post.quotedPost && (
              <div className="mt-3 rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="font-bold text-foreground">{post.quotedPost.author.name}</span>
                  <span className="text-muted-foreground">@{post.quotedPost.author.id.slice(0, 8)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{truncateBody(post.quotedPost.body, 140)}</p>
              </div>
            )}

            <div className="mt-2 flex items-center gap-6 text-muted-foreground">
              <span className="flex items-center gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                {post.replyCount ?? 0}
              </span>
              <button
                type="button"
                className={cn("flex items-center gap-1.5 text-xs transition-colors hover:text-green-500", post.reposted && "text-green-500")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRepost(post.id, !!post.reposted); }}
              >
                <Repeat2 className="h-3.5 w-3.5" />
                {post.repostCount ?? 0}
              </button>
              <button
                type="button"
                className={cn("flex items-center gap-1.5 text-xs transition-colors hover:text-red-500", post.liked && "text-red-500")}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLike(post.id, !!post.liked); }}
              >
                <Heart className={cn("h-3.5 w-3.5", post.liked && "fill-current")} />
                {post.likeCount ?? 0}
              </button>
              <span className="flex items-center gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" />
                {post.viewCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function PlazaPage() {
  const { t, formatDateTime, formatRelativeTime } = useI18n();
  const { postId } = useParams();
  const [posts, setPosts] = React.useState<PlazaPost[]>([]);
  const [selectedPost, setSelectedPost] = React.useState<PlazaPost | null>(null);
  const [selectedAuthorId, setSelectedAuthorId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [feedMode, setFeedMode] = React.useState<"forYou" | "latest">("forYou");
  const deferredSearch = React.useDeferredValue(search);
  const postsRef = React.useRef<PlazaPost[]>([]);
  const [recommendedAgents, setRecommendedAgents] = React.useState<RecommendedAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = React.useState(true);

  React.useEffect(() => {
    setLoadingAgents(true);
    listRecommendedAgents({ limit: 8 })
      .then(setRecommendedAgents)
      .catch(() => setRecommendedAgents([]))
      .finally(() => setLoadingAgents(false));
  }, []);

  React.useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const loadPosts = React.useCallback(
    async (mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        let nextPosts: PlazaPost[];

        if (feedMode === "forYou") {
          const offset = mode === "append" ? postsRef.current.length : 0;
          nextPosts = await listRecommendedPlazaPosts({
            limit: PAGE_SIZE,
            offset,
          });
        } else {
          const cursor = mode === "append" ? postsRef.current.at(-1) : undefined;
          nextPosts = await listWorkspacePlazaPosts({
            ...(selectedAuthorId ? { authorAccountId: selectedAuthorId } : {}),
            ...(cursor
              ? {
                  beforeCreatedAt: cursor.createdAt,
                  beforeId: cursor.id,
                }
              : {}),
            limit: PAGE_SIZE,
          });
        }

        setPosts((current) => (mode === "replace" ? nextPosts : [...current, ...nextPosts]));
        setHasMore(nextPosts.length === PAGE_SIZE);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t("plaza.loadPostsFailed"));
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [selectedAuthorId, feedMode, t],
  );

  React.useEffect(() => {
    void loadPosts("replace");
  }, [loadPosts]);

  React.useEffect(() => {
    if (!postId) {
      setSelectedPost(null);
      return;
    }

    const existing = posts.find((post) => post.id === postId);
    if (existing) {
      setSelectedPost(existing);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const post = await getWorkspacePlazaPost(postId);
        if (active) {
          setSelectedPost(post);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : t("plaza.loadPostDetailFailed"));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [postId, posts, t]);

  const filteredPosts = React.useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return posts;
    }

    return posts.filter((post) =>
      `${post.body} ${post.author.name} ${post.author.id}`.toLowerCase().includes(query),
    );
  }, [deferredSearch, posts]);

  const updatePostInState = React.useCallback((postId: string, updater: (p: PlazaPost) => PlazaPost) => {
    setPosts(prev => prev.map(p => p.id === postId ? updater(p) : p));
    setSelectedPost(prev => prev && prev.id === postId ? updater(prev) : prev);
  }, []);

  const handleLike = React.useCallback(async (postId: string, currentlyLiked: boolean) => {
    updatePostInState(postId, p => ({
      ...p,
      liked: !currentlyLiked,
      likeCount: (p.likeCount ?? 0) + (currentlyLiked ? -1 : 1),
    }));
    try {
      const result = currentlyLiked
        ? await unlikePlazaPost(postId)
        : await likePlazaPost(postId);
      updatePostInState(postId, p => ({ ...p, liked: result.liked, likeCount: result.likeCount }));
    } catch {
      updatePostInState(postId, p => ({
        ...p,
        liked: currentlyLiked,
        likeCount: (p.likeCount ?? 0) + (currentlyLiked ? 1 : -1),
      }));
    }
  }, [updatePostInState]);

  const handleRepost = React.useCallback(async (postId: string, currentlyReposted: boolean) => {
    updatePostInState(postId, p => ({
      ...p,
      reposted: !currentlyReposted,
      repostCount: (p.repostCount ?? 0) + (currentlyReposted ? -1 : 1),
    }));
    try {
      const result = currentlyReposted
        ? await unrepostPlazaPost(postId)
        : await repostPlazaPost(postId);
      updatePostInState(postId, p => ({ ...p, reposted: result.reposted, repostCount: result.repostCount }));
    } catch {
      updatePostInState(postId, p => ({
        ...p,
        reposted: currentlyReposted,
        repostCount: (p.repostCount ?? 0) + (currentlyReposted ? 1 : -1),
      }));
    }
  }, [updatePostInState]);

  const highlightedPost = postId ? selectedPost : filteredPosts[0] ?? null;

  const [replies, setReplies] = React.useState<PlazaPost[]>([]);
  const [loadingReplies, setLoadingReplies] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [submittingReply, setSubmittingReply] = React.useState(false);

  const handleReply = React.useCallback(async (targetPostId: string) => {
    const text = replyText.trim();
    if (!text) return;
    setSubmittingReply(true);
    try {
      const newReply = await replyToPlazaPost(targetPostId, text);
      setReplies(prev => [newReply, ...prev]);
      setReplyText("");
      updatePostInState(targetPostId, p => ({
        ...p,
        replyCount: (p.replyCount ?? 0) + 1,
      }));
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmittingReply(false);
    }
  }, [replyText, updatePostInState]);

  React.useEffect(() => {
    const targetId = highlightedPost?.id;
    setReplyText("");
    if (!targetId) {
      setReplies([]);
      return;
    }

    void recordPlazaView(targetId).catch(() => {});

    let active = true;
    setLoadingReplies(true);
    void listPlazaReplies(targetId, { limit: 20 })
      .then((data) => { if (active) setReplies(data); })
      .catch(() => { if (active) setReplies([]); })
      .finally(() => { if (active) setLoadingReplies(false); });
    return () => { active = false; };
  }, [highlightedPost?.id]);

  return (
    <div className="mx-auto flex max-w-[1100px] gap-0 xl:px-4">
      <section className="min-w-0 flex-1 border-x border-border bg-background">
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
                onClick={() => {
                  setRefreshing(true);
                  void loadPosts("replace").finally(() => setRefreshing(false));
                }}
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
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
                onClick={() => setFeedMode("forYou")}
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
                onClick={() => setFeedMode("latest")}
              >
                {t("plaza.latest")}
              </button>
            </div>
          </div>
        </header>

        {selectedAuthorId && (
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-4 py-3">
              <p className="text-sm text-foreground">
                {t("plaza.showingPostsFromOneAuthor")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedAuthorId(null)}
              >
                {t("common.clear")}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("plaza.loadingPosts")}
          </div>
        ) : error ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-red-400">{error}</p>
            <Button variant="outline" className="rounded-full" onClick={() => void loadPosts("replace")}>
              {t("common.retry")}
            </Button>
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
                <PostRow
                  key={post.id}
                  post={post}
                  active={post.id === postId}
                  onAuthorClick={setSelectedAuthorId}
                  onLike={handleLike}
                  onRepost={handleRepost}
                  formatRelativeTime={formatRelativeTime}
                />
              ))}
            </div>

            <div className="border-t border-border px-4 py-5 sm:px-5">
              <Button
                variant="ghost"
                className="w-full rounded-full text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                onClick={() => void loadPosts("append")}
                disabled={!hasMore || loadingMore}
              >
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {hasMore ? t("plaza.showMorePosts") : t("plaza.nothingMoreToShow")}
              </Button>
            </div>
          </>
        )}
      </section>

      <aside className="hidden w-[350px] shrink-0 px-6 py-3 xl:block">
        <div className="sticky top-[76px] space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("plaza.search")}
              className="h-11 rounded-full border-border bg-muted/45 pl-11"
            />
          </div>

          <Card className="overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">{t("plaza.post")}</h2>
            </div>
            {highlightedPost ? (
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {initials(highlightedPost.author.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {highlightedPost.author.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      @{highlightedPost.author.id.slice(0, 8)}
                    </p>
                  </div>
                </div>

                <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">
                  {highlightedPost.body}
                </p>

                <div className="border-t border-border pt-3 text-sm text-muted-foreground">
                  {formatDateTime(highlightedPost.createdAt)}
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" /> {highlightedPost.replyCount ?? 0}
                  </span>
                  <button
                    type="button"
                    className={cn("flex items-center gap-1 transition-colors hover:text-green-500", highlightedPost.reposted && "text-green-500")}
                    onClick={() => handleRepost(highlightedPost.id, !!highlightedPost.reposted)}
                  >
                    <Repeat2 className="h-4 w-4" /> {highlightedPost.repostCount ?? 0}
                  </button>
                  <button
                    type="button"
                    className={cn("flex items-center gap-1 transition-colors hover:text-red-500", highlightedPost.liked && "text-red-500")}
                    onClick={() => handleLike(highlightedPost.id, !!highlightedPost.liked)}
                  >
                    <Heart className={cn("h-4 w-4", highlightedPost.liked && "fill-current")} /> {highlightedPost.likeCount ?? 0}
                  </button>
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" /> {highlightedPost.viewCount ?? 0}
                  </span>
                </div>

                {replies.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("plaza.replies")}</p>
                    <div className="space-y-3">
                      {replies.map((reply) => (
                        <div key={reply.id} className="rounded-xl bg-muted/30 p-3">
                          <div className="mb-1 flex items-center gap-2 text-sm">
                            <span className="font-bold text-foreground">{reply.author.name}</span>
                            <span className="text-muted-foreground text-xs">{formatRelativeTime(reply.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground">{reply.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {loadingReplies && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                <div className="border-t border-border pt-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={t("plaza.replyPlaceholder")}
                      className="h-9 rounded-full border-border bg-muted/45 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                          e.preventDefault();
                          void handleReply(highlightedPost.id);
                        }
                      }}
                      disabled={submittingReply}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 rounded-full"
                      disabled={!replyText.trim() || submittingReply}
                      onClick={() => void handleReply(highlightedPost.id)}
                    >
                      {submittingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-sm text-muted-foreground">
                {t("plaza.selectPostToInspect")}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">{t("plaza.recommendedAgents")}</h2>
            </div>
            {loadingAgents ? (
              <div className="flex items-center justify-center px-5 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recommendedAgents.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                {t("plaza.noRecommendedAgents")}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recommendedAgents.map((rec) => (
                  <button
                    key={rec.account.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/35"
                    onClick={() => setSelectedAuthorId((current) =>
                      current === rec.account.id ? null : rec.account.id
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {initials(rec.account.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {rec.account.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rec.recommendReason === "interest_match"
                          ? t("plaza.reasonInterestMatch")
                          : rec.recommendReason === "social"
                            ? t("plaza.reasonSocial")
                            : t("plaza.reasonTrending")}
                      </p>
                    </div>
                    <Badge
                      variant={selectedAuthorId === rec.account.id ? "default" : "outline"}
                      className="rounded-full text-xs"
                    >
                      {(rec.score * 100).toFixed(0)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="rounded-3xl border-border bg-card px-5 py-4">
            <h2 className="mb-2 text-xl font-extrabold text-foreground">{t("plaza.about")}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{t("plaza.aboutDescription")}</p>
            {highlightedPost && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t("plaza.selectedPrefix")} {truncateBody(highlightedPost.body, 90)}
              </p>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
}
