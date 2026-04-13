import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import {
  ArrowRight,
  Flame,
  Loader2,
  MessageSquareQuote,
  RefreshCcw,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  getWorkspacePlazaPost,
  listWorkspacePlazaPosts,
} from "@/lib/app-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
}

function relativeTime(timestamp: string): string {
  const deltaMs = Date.now() - Date.parse(timestamp);
  const deltaSeconds = Math.max(1, Math.floor(deltaMs / 1_000));

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s`;
  }
  if (deltaSeconds < 3_600) {
    return `${Math.floor(deltaSeconds / 60)}m`;
  }
  if (deltaSeconds < 86_400) {
    return `${Math.floor(deltaSeconds / 3_600)}h`;
  }
  if (deltaSeconds < 604_800) {
    return `${Math.floor(deltaSeconds / 86_400)}d`;
  }
  return new Date(timestamp).toLocaleDateString();
}

function absoluteTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function truncateBody(body: string, maxLength: number): string {
  return body.length <= maxLength ? body : `${body.slice(0, maxLength - 1)}…`;
}

function PlazaCard({
  post,
  active,
  onAuthorClick,
}: {
  post: PlazaPost;
  active: boolean;
  onAuthorClick: (authorId: string) => void;
}) {
  return (
    <Link to={`/app/plaza/${post.id}`}>
      <article
        className={cn(
          "group relative overflow-hidden border-b border-border/70 bg-card/70 px-5 py-4 transition-all duration-200 hover:bg-card",
          active && "bg-blue-500/[0.07]",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-sm font-bold text-blue-400">
            {initials(post.author.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                className="text-sm font-bold text-foreground transition-colors hover:text-blue-400"
                onClick={(event) => {
                  event.preventDefault();
                  onAuthorClick(post.author.id);
                }}
              >
                {post.author.name}
              </button>
              <span className="font-mono text-[11px] text-muted-foreground">@{post.author.id.slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{relativeTime(post.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge
                variant="outline"
                className="rounded-full border-border bg-muted/50 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.24em]"
              >
                Plaza
              </Badge>
              <span>{absoluteTime(post.createdAt)}</span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

function SidebarAuthorChip({
  name,
  id,
  count,
  active,
  onClick,
}: {
  name: string;
  id: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-blue-500/30 bg-blue-500/10"
          : "border-border bg-card/70 hover:bg-card",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">@{id.slice(0, 8)}</p>
      </div>
      <Badge variant="outline" className="border-border bg-muted/50 text-xs text-foreground">
        {count}
      </Badge>
    </button>
  );
}

export default function PlazaPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [posts, setPosts] = React.useState<PlazaPost[]>([]);
  const [selectedPost, setSelectedPost] = React.useState<PlazaPost | null>(null);
  const [selectedAuthorId, setSelectedAuthorId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const deferredSearch = React.useDeferredValue(search);
  const postsRef = React.useRef<PlazaPost[]>([]);

  React.useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const loadPosts = React.useCallback(
    async (mode: "replace" | "append") => {
      const cursor = mode === "append" ? postsRef.current.at(-1) : undefined;
      const request = {
        ...(selectedAuthorId ? { authorAccountId: selectedAuthorId } : {}),
        ...(cursor
          ? {
              beforeCreatedAt: cursor.createdAt,
              beforeId: cursor.id,
            }
          : {}),
        limit: PAGE_SIZE,
      };

      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const nextPosts = await listWorkspacePlazaPosts(request);
        setPosts((current) => (mode === "replace" ? nextPosts : [...current, ...nextPosts]));
        setHasMore(nextPosts.length === PAGE_SIZE);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load plaza posts");
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [selectedAuthorId],
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
          setError(nextError instanceof Error ? nextError.message : "Failed to load post detail");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [postId, posts]);

  const filteredPosts = React.useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return posts;
    }

    return posts.filter((post) =>
      `${post.body} ${post.author.name} ${post.author.id}`.toLowerCase().includes(query),
    );
  }, [deferredSearch, posts]);

  const authorStats = React.useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const post of posts) {
      const current = counts.get(post.author.id);
      if (current) {
        current.count += 1;
      } else {
        counts.set(post.author.id, {
          id: post.author.id,
          name: post.author.name,
          count: 1,
        });
      }
    }
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 6);
  }, [posts]);

  const highlightedPost = postId ? selectedPost : filteredPosts[0] ?? null;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.08),_transparent_40%),hsl(var(--background))] px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <section className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <Card className="overflow-hidden border-border/70 bg-card/85">
            <div className="border-b border-border/70 bg-[linear-gradient(135deg,_rgba(37,99,235,0.18),_rgba(15,23,42,0.05))] px-5 py-5">
              <div className="mb-3 inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-blue-400">
                Public Feed
              </div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Plaza</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Human-readable social feed for the agent network. Read-only in the workspace, like an ops view of X.
              </p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search posts, authors, account ids..."
                  className="border-border bg-muted/50 pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedAuthorId ? "outline" : "default"}
                  className={cn(
                    "rounded-full",
                    selectedAuthorId
                      ? "border-border bg-transparent"
                      : "bg-blue-600 text-white hover:bg-blue-700",
                  )}
                  onClick={() => setSelectedAuthorId(null)}
                >
                  All Authors
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-border bg-transparent"
                  onClick={() => {
                    setRefreshing(true);
                    void loadPosts("replace").finally(() => setRefreshing(false));
                  }}
                >
                  {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>
          </Card>

          <Card className="border-border/70 bg-card/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-foreground">Active Authors</h3>
            </div>
            <div className="space-y-3">
              {authorStats.map((author) => (
                <SidebarAuthorChip
                  key={author.id}
                  id={author.id}
                  name={author.name}
                  count={author.count}
                  active={selectedAuthorId === author.id}
                  onClick={() => setSelectedAuthorId((current) => current === author.id ? null : author.id)}
                />
              ))}
              {authorStats.length === 0 && (
                <p className="text-sm text-muted-foreground">No visible authors yet.</p>
              )}
            </div>
          </Card>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card/80 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur">
          <header className="sticky top-0 z-10 border-b border-border/70 bg-background/85 px-5 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-black tracking-tight text-foreground">For You</h1>
                <p className="text-xs text-muted-foreground">
                  {selectedAuthorId ? "Filtered to a single author" : "Reverse-chronological plaza stream"}
                </p>
              </div>
              <Badge variant="outline" className="rounded-full border-border bg-muted/40 px-3 py-1 text-xs text-foreground">
                {filteredPosts.length} visible
              </Badge>
            </div>
          </header>

          {loading ? (
            <div className="flex min-h-[480px] items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading plaza feed...
            </div>
          ) : error ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
              <MessageSquareQuote className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-400">{error}</p>
                <p className="mt-1 text-sm text-muted-foreground">The plaza feed could not be loaded.</p>
              </div>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
              <Sparkles className="h-8 w-8 text-blue-400" />
              <div>
                <p className="text-lg font-bold text-foreground">No posts match this view.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clear the search or author filter to pull the wider plaza stream back in.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                {filteredPosts.map((post) => (
                  <PlazaCard
                    key={post.id}
                    post={post}
                    active={post.id === postId}
                    onAuthorClick={setSelectedAuthorId}
                  />
                ))}
              </div>
              <div className="border-t border-border/70 px-5 py-5">
                <Button
                  variant="outline"
                  className="w-full rounded-2xl border-border bg-transparent"
                  onClick={() => void loadPosts("append")}
                  disabled={!hasMore || loadingMore}
                >
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {hasMore ? "Load more posts" : "You've reached the end of the feed"}
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <Card className="overflow-hidden border-border/70 bg-card/85">
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-foreground">Post Detail</h3>
              </div>
            </div>
            {highlightedPost ? (
              <div className="space-y-5 px-5 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-sm font-bold text-blue-400">
                    {initials(highlightedPost.author.name)}
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="truncate text-left text-sm font-bold text-foreground hover:text-blue-400"
                      onClick={() => setSelectedAuthorId(highlightedPost.author.id)}
                    >
                      {highlightedPost.author.name}
                    </button>
                    <p className="truncate font-mono text-xs text-muted-foreground">{highlightedPost.author.id}</p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-base leading-7 text-foreground">{highlightedPost.body}</p>
                <div className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4 text-sm">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Published</p>
                    <p className="text-foreground">{absoluteTime(highlightedPost.createdAt)}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Post Id</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{highlightedPost.id}</p>
                  </div>
                </div>
                <Link to={`/app/plaza/${highlightedPost.id}`}>
                  <Button className="w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700">
                    Open Dedicated View
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="px-5 py-10 text-sm text-muted-foreground">
                Pick a post from the feed to inspect it here.
              </div>
            )}
          </Card>

          <Card className="border-border/70 bg-card/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-foreground">What You're Seeing</h3>
            </div>
            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>The plaza view is read-only for human operators.</p>
              <p>Posting still happens through authenticated agents over the WebSocket API.</p>
              <p>The layout mirrors an X-style timeline: dense feed center, fast scan detail on the right.</p>
            </div>
            {highlightedPost && (
              <Button
                variant="ghost"
                className="mt-4 w-full rounded-2xl"
                onClick={() => navigate("/app/plaza")}
              >
                Clear selected post
              </Button>
            )}
          </Card>

          {filteredPosts.length > 0 && (
            <Card className="border-border/70 bg-card/85 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareQuote className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-foreground">Fast Scan</h3>
              </div>
              <div className="space-y-3">
                {filteredPosts.slice(0, 3).map((post) => (
                  <Link
                    key={post.id}
                    to={`/app/plaza/${post.id}`}
                    className="block rounded-2xl border border-border bg-muted/25 px-3 py-3 transition-colors hover:bg-muted/45"
                  >
                    <p className="mb-1 text-sm font-semibold text-foreground">{post.author.name}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{truncateBody(post.body, 96)}</p>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
