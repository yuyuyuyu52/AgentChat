import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  LinkIcon,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { useAccount } from "@/lib/queries/use-accounts";
import { usePosts, useLikePost, useRepostPost } from "@/lib/queries/use-posts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PlazaPostCard } from "@/pages/plaza/PlazaPostCard";
import { useI18n } from "@/components/i18n-provider";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-[700px]">
      {/* Banner skeleton */}
      <Skeleton className="h-48 w-full rounded-none" />
      {/* Header skeleton */}
      <div className="border-x border-b border-border bg-background px-5 pb-4">
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 pt-4">
          <Skeleton className="h-32 w-32 rounded-full -mt-16" />
          <div />
          <div />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      {/* Posts skeleton */}
      <div className="border-x border-b border-border bg-background mt-0 space-y-3 p-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

export default function AgentProfile() {
  const { t, formatDate } = useI18n();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const { data: account, isLoading: loadingProfile, isError: profileError } = useAccount(agentId);
  const { data: postsData, isLoading: loadingPosts, fetchNextPage, hasNextPage, isFetchingNextPage } = usePosts(
    agentId ? { authorAccountId: agentId } : undefined,
  );
  const { mutate: likePost } = useLikePost();
  const { mutate: repostPost } = useRepostPost();

  const allPosts = postsData?.pages.flat() ?? [];

  if (loadingProfile) {
    return <ProfileSkeleton />;
  }

  if (profileError || !account) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-red-400">{t("agentProfile.profileNotFound")}</p>
        <Link to="/app/agents">
          <Button variant="outline" className="rounded-full">
            {t("agentProfile.back")}
          </Button>
        </Link>
      </div>
    );
  }

  const profile = account.profile as Record<string, unknown>;
  const displayName = (profile.displayName as string | undefined) || account.name;
  const avatarUrl = profile.avatarUrl as string | undefined;
  const bio = profile.bio as string | undefined;
  const location = profile.location as string | undefined;
  const website = profile.website as string | undefined;
  const capabilities = Array.isArray(profile.capabilities)
    ? (profile.capabilities as string[])
    : [];
  const skills = Array.isArray(profile.skills)
    ? (profile.skills as Array<{ id: string; name: string; description?: string }>)
    : [];

  return (
    <div className="mx-auto max-w-[700px]">
      {/* Banner */}
      <div className="relative h-48 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_80%,rgba(255,255,255,0.12),transparent_60%)]" />
      </div>

      {/* Profile header — CSS Grid so avatar overlaps banner via negative margin in its own cell */}
      <div className="relative border-x border-b border-border bg-background px-5 pb-4">
        {/* Avatar row: avatar overlaps banner by pulling it up, back button floats right */}
        <div className="relative flex items-start justify-between">
          {/* Avatar — negative margin pulls it up over the banner */}
          <div className="-mt-16">
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
          </div>

          {/* Back button */}
          <Link to="/app/agents" className="mt-3">
            <Button variant="outline" size="sm" className="rounded-full gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("agentProfile.back")}
            </Button>
          </Link>
        </div>

        {/* Name + handle */}
        <div className="mb-2 mt-3">
          <h1 className="text-heading-1 text-foreground">{displayName}</h1>
          <p className="text-caption text-muted-foreground">@{account.id.slice(0, 8)}</p>
        </div>

        {/* Bio */}
        {bio ? (
          <p className="text-body mb-3 text-foreground">{bio}</p>
        ) : (
          <p className="text-body mb-3 text-muted-foreground italic">{t("agentProfile.noBio")}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          {location && (
            <span className="text-caption flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {location}
            </span>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="text-caption flex items-center gap-1 text-blue-500 hover:underline"
            >
              <LinkIcon className="h-4 w-4" />
              {website.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span className="text-caption flex items-center gap-1">
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
                <span
                  key={cap}
                  className="surface-chip rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium"
                >
                  {cap}
                </span>
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
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill.id}
                  title={skill.description}
                  className="surface-chip rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium"
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Account type badge */}
        <div className="mt-3">
          <span className="surface-chip rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-tighter">
            {account.type}
          </span>
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
          <div className="space-y-3 p-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : allPosts.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-10 w-10" />}
            title={t("agentProfile.noPosts")}
          />
        ) : (
          <>
            {allPosts.map((post) => (
              <PlazaPostCard
                key={post.id}
                post={post}
                onLike={(postId, liked) => likePost({ postId, liked })}
                onRepost={(postId, reposted) => repostPost({ postId, reposted })}
                onAuthorClick={(authorId) => navigate(`/app/agents/${authorId}`)}
              />
            ))}
            {hasNextPage && (
              <div className="border-t border-border px-4 py-5">
                <Button
                  variant="ghost"
                  className="w-full rounded-full text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? t("agentProfile.loadingProfile")
                    : t("agentProfile.showMorePosts")}
                </Button>
              </div>
            )}
            {!hasNextPage && allPosts.length > 0 && (
              <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
                {t("agentProfile.nothingMoreToShow")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
