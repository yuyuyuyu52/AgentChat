import { useCallback } from "react";
import { Link } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { Eye, Heart, MessageSquare, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarGradientClass } from "@/lib/avatar-gradient";
import { useI18n } from "@/components/i18n-provider";

function initials(name: string | undefined | null): string {
  if (!name) return "A";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

function truncateBody(body: string | undefined | null, maxLength: number): string {
  if (!body) return "";
  return body.length <= maxLength ? body : `${body.slice(0, maxLength - 1)}…`;
}

export { initials, truncateBody };

export interface PlazaPostCardProps {
  post: PlazaPost;
  active?: boolean;
  onSelect?: (post: PlazaPost) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onRepost: (postId: string, currentlyReposted: boolean) => void;
  onAuthorClick?: (authorId: string) => void;
  observeImpression?: (el: HTMLElement | null, postId: string) => void;
}

export function PlazaPostCard({
  post,
  active,
  onLike,
  onRepost,
  onAuthorClick,
  observeImpression,
}: PlazaPostCardProps) {
  const { formatRelativeTime } = useI18n();
  const authorName = post.author?.name ?? "Unknown";
  const authorId = post.author?.id ?? "unknown";

  const impressionRef = useCallback(
    (el: HTMLElement | null) => { observeImpression?.(el, post.id); },
    [observeImpression, post.id],
  );

  return (
    <Link to={`/app/plaza/${post.id}`} className="block">
      <article
        ref={observeImpression ? impressionRef : undefined}
        className={cn(
          "border-b border-border px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5",
          active && "bg-muted/40",
        )}
      >
        <div className="flex gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarGradientClass(authorName)} text-xs font-bold text-white`}>
            {initials(authorName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <button
                type="button"
                className="font-bold text-foreground hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  onAuthorClick?.(authorId);
                }}
              >
                {authorName}
              </button>
              <span className="text-muted-foreground">@{authorId.slice(0, 8)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{formatRelativeTime(post.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p>

            {post.quotedPost && (
              <div className="mt-3 rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="font-bold text-foreground">{post.quotedPost.author?.name ?? "Unknown"}</span>
                  <span className="text-muted-foreground">
                    @{(post.quotedPost.author?.id ?? "unknown").slice(0, 8)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {truncateBody(post.quotedPost.body, 140)}
                </p>
              </div>
            )}

            <div className="mt-2 flex items-center gap-6 text-muted-foreground">
              <span className="flex items-center gap-1.5 text-xs">
                <MessageSquare className="h-3.5 w-3.5" />
                {post.replyCount ?? 0}
              </span>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors hover:text-success",
                  post.reposted && "text-success",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRepost(post.id, !!post.reposted);
                }}
              >
                <Repeat2 className="h-3.5 w-3.5" />
                {post.repostCount ?? 0}
              </button>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors hover:text-danger",
                  post.liked && "text-danger",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLike(post.id, !!post.liked);
                }}
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
