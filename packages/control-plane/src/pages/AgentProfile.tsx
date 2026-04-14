import React from "react";
import { Link, useParams } from "react-router-dom";
import type { Account, PlazaPost } from "@agentchatjs/protocol";
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Heart,
  LinkIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Repeat2,
} from "lucide-react";
import {
  getAccountProfile,
  listWorkspacePlazaPosts,
} from "@/lib/app-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function PostItem({
  post,
  formatRelativeTime,
}: {
  post: PlazaPost;
  formatRelativeTime: (value: string | number | Date) => string;
}) {
  return (
    <article className="border-b border-border px-5 py-4 transition-colors hover:bg-muted/35">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {initials(post.author.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-bold text-foreground">{post.author.name}</span>
            <span className="text-muted-foreground">@{post.author.id.slice(0, 8)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p>

          {post.quotedPost && (
            <div className="mt-3 rounded-xl border border-border p-3">
              <div className="mb-1 flex items-center gap-2 text-sm">
                <span className="font-bold text-foreground">{post.quotedPost.author.name}</span>
                <span className="text-muted-foreground">@{post.quotedPost.author.id.slice(0, 8)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{post.quotedPost.body.length > 140 ? `${post.quotedPost.body.slice(0, 139)}…` : post.quotedPost.body}</p>
            </div>
          )}

          <div className="mt-2 flex items-center gap-6 text-muted-foreground">
            <span className="flex items-center gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" /> {post.replyCount ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Repeat2 className="h-3.5 w-3.5" /> {post.repostCount ?? 0}
            </span>
            <span className={cn("flex items-center gap-1.5 text-xs", post.liked && "text-red-500")}>
              <Heart className={cn("h-3.5 w-3.5", post.liked && "fill-current")} /> {post.likeCount ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" /> {post.viewCount ?? 0}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AgentProfile() {
  const { t, formatDate, formatRelativeTime } = useI18n();
  const { agentId } = useParams<{ agentId: string }>();

  const [account, setAccount] = React.useState<Account | null>(null);
  const [posts, setPosts] = React.useState<PlazaPost[]>([]);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [loadingPosts, setLoadingPosts] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [postsError, setPostsError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);

  React.useEffect(() => {
    if (!agentId) return;
    let active = true;

    void (async () => {
      try {
        setLoadingProfile(true);
        const data = await getAccountProfile(agentId);
        if (active) {
          setAccount(data);
          setProfileError(null);
        }
      } catch (err) {
        if (active) {
          setProfileError(err instanceof Error ? err.message : t("agentProfile.loadProfileFailed"));
        }
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();

    return () => { active = false; };
  }, [agentId]);

  React.useEffect(() => {
    if (!agentId) return;
    let active = true;

    void (async () => {
      try {
        setLoadingPosts(true);
        const data = await listWorkspacePlazaPosts({ authorAccountId: agentId, limit: PAGE_SIZE });
        if (active) {
          setPosts(data);
          setHasMore(data.length === PAGE_SIZE);
          setPostsError(null);
        }
      } catch (err) {
        if (active) {
          setPostsError(err instanceof Error ? err.message : t("agentProfile.loadPostsFailed"));
        }
      } finally {
        if (active) setLoadingPosts(false);
      }
    })();

    return () => { active = false; };
  }, [agentId]);

  const handleLoadMore = async () => {
    const cursor = posts.at(-1);
    if (!agentId || !cursor) return;
    setLoadingMore(true);
    try {
      const next = await listWorkspacePlazaPosts({
        authorAccountId: agentId,
        beforeCreatedAt: cursor.createdAt,
        beforeId: cursor.id,
        limit: PAGE_SIZE,
      });
      setPosts((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : t("agentProfile.loadPostsFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("agentProfile.loadingProfile")}
      </div>
    );
  }

  if (profileError || !account) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-red-400">{profileError ?? t("agentProfile.profileNotFound")}</p>
        <Link to="/app/agents">
          <Button variant="outline" className="rounded-full">{t("agentProfile.back")}</Button>
        </Link>
      </div>
    );
  }

  const profile = account.profile as Record<string, string>;
  const displayName = profile.displayName || account.name;
  const avatarUrl = profile.avatarUrl;
  const bio = profile.bio;
  const location = profile.location;
  const website = profile.website;
  const capabilities = Array.isArray((account.profile as Record<string, unknown>).capabilities)
    ? (account.profile as Record<string, unknown>).capabilities as string[]
    : [];
  const skills = Array.isArray((account.profile as Record<string, unknown>).skills)
    ? (account.profile as Record<string, unknown>).skills as Array<{ id: string; name: string; description?: string }>
    : [];

  return (
    <div className="mx-auto max-w-[700px]">
      {/* Banner */}
      <div className="relative h-48 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_80%,rgba(255,255,255,0.12),transparent_60%)]" />
      </div>

      {/* Profile header */}
      <div className="relative border-x border-b border-border bg-background px-5 pb-4">
        {/* Avatar */}
        <div className="-mt-16 mb-3 flex items-end justify-between">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-32 w-32 rounded-full border-4 border-background bg-muted object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-background bg-blue-600 text-3xl font-bold text-white">
              {initials(displayName)}
            </div>
          )}
          <Link to="/app/agents" className="mb-2">
            <Button variant="outline" size="sm" className="rounded-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("agentProfile.back")}
            </Button>
          </Link>
        </div>

        {/* Name + handle */}
        <div className="mb-2">
          <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
          <p className="text-sm text-muted-foreground">@{account.id.slice(0, 8)}</p>
        </div>

        {/* Bio */}
        {bio && (
          <p className="mb-3 text-[15px] leading-6 text-foreground">{bio}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {location}
            </span>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:underline"
            >
              <LinkIcon className="h-4 w-4" />
              {website.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {t("agentProfile.joinedDate")} {formatDate(account.createdAt)}
          </span>
        </div>

        {/* Capabilities */}
        {capabilities.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("agentProfile.capabilities")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {capabilities.map((cap) => (
                <Badge key={cap} variant="secondary" className="rounded-full text-xs">
                  {cap}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("agentProfile.skills")}
            </p>
            <div className="space-y-1">
              {skills.map((skill) => (
                <div key={skill.id} className="text-sm">
                  <span className="font-medium text-foreground">{skill.name}</span>
                  {skill.description && (
                    <span className="text-muted-foreground"> — {skill.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="mt-3">
          <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-tighter">
            {account.type}
          </Badge>
        </div>
      </div>

      {/* Posts tab header */}
      <div className="border-x border-b border-border bg-background">
        <div className="flex justify-center border-b-2 border-blue-500 py-3 text-sm font-semibold text-foreground">
          {t("agentProfile.posts")}
        </div>
      </div>

      {/* Posts feed */}
      <div className="border-x border-border bg-background">
        {loadingPosts ? (
          <div className="flex min-h-[200px] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : postsError ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-red-400">{postsError}</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            {t("agentProfile.noPosts")}
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostItem key={post.id} post={post} formatRelativeTime={formatRelativeTime} />
            ))}
            <div className="border-t border-border px-4 py-5">
              <Button
                variant="ghost"
                className="w-full rounded-full text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                onClick={() => void handleLoadMore()}
                disabled={!hasMore || loadingMore}
              >
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {hasMore ? t("agentProfile.showMorePosts") : t("agentProfile.nothingMoreToShow")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
