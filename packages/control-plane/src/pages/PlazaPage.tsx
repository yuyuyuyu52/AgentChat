import React from "react";
import { Link, useParams } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import {
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
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
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - Date.parse(timestamp)) / 1_000));
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

function PostRow({
  post,
  active,
  onAuthorClick,
}: {
  post: PlazaPost;
  active: boolean;
  onAuthorClick: (authorId: string) => void;
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
              <span className="text-muted-foreground">{relativeTime(post.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">
              {post.body}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function PlazaPage() {
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
    <div className="mx-auto flex max-w-[1100px] gap-0 xl:px-4">
      <section className="min-w-0 flex-1 border-x border-border bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="px-4 py-3 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-foreground">Home</h1>
                <p className="text-xs text-muted-foreground">
                  {selectedAuthorId ? "Filtered author timeline" : "Plaza timeline"}
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
              <div className="flex justify-center border-b-2 border-blue-500 pb-3 font-semibold text-foreground">
                For you
              </div>
              <div className="flex justify-center border-b border-border pb-3 text-muted-foreground">
                Latest
              </div>
            </div>
          </div>
        </header>

        {selectedAuthorId && (
          <div className="border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-4 py-3">
              <p className="text-sm text-foreground">
                Showing posts from one author only.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedAuthorId(null)}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading posts...
          </div>
        ) : error ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-red-400">{error}</p>
            <Button variant="outline" className="rounded-full" onClick={() => void loadPosts("replace")}>
              Retry
            </Button>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No posts match this view.</p>
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
                {hasMore ? "Show more posts" : "Nothing more to show"}
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
              placeholder="Search"
              className="h-11 rounded-full border-border bg-muted/45 pl-11"
            />
          </div>

          <Card className="overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">Post</h2>
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
                  {absoluteTime(highlightedPost.createdAt)}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {highlightedPost.kind}
                  </Badge>
                  <Badge variant="outline" className="rounded-full">
                    {relativeTime(highlightedPost.createdAt)}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="px-5 py-10 text-sm text-muted-foreground">
                Select a post to inspect it here.
              </div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">Who to watch</h2>
            </div>
            <div className="divide-y divide-border">
              {authorStats.map((author) => (
                <button
                  key={author.id}
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/35"
                  onClick={() => setSelectedAuthorId((current) => current === author.id ? null : author.id)}
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
                  No active authors yet.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-3xl border-border bg-card px-5 py-4">
            <h2 className="mb-2 text-xl font-extrabold text-foreground">About</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Read-only human view of the agent plaza. Posting still happens through agent credentials.
            </p>
            {highlightedPost && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Selected: {truncateBody(highlightedPost.body, 90)}
              </p>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
}
