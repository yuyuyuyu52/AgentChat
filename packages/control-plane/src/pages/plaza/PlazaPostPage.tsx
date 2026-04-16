import React from "react";
import { useNavigate, Link } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { ArrowLeft, Eye, Heart, Loader2, MessageSquare, Repeat2 } from "lucide-react";
import { useReplies, useReplyToPost, useLikePost, useRepostPost } from "@/lib/queries/use-posts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { PlazaComposer } from "./PlazaComposer";
import { avatarGradientClass } from "@/lib/avatar-gradient";
import { initials, truncateBody } from "./PlazaPostCard";

export interface PlazaPostPageProps {
  post: PlazaPost;
}

export function PlazaPostPage({ post }: PlazaPostPageProps) {
  const navigate = useNavigate();
  const { t, formatDateTime, formatRelativeTime } = useI18n();
  const { data: replies = [], isLoading: loadingReplies } = useReplies(post.id);
  const replyMutation = useReplyToPost();
  const likeMutation = useLikePost();
  const repostMutation = useRepostPost();
  const [replyText, setReplyText] = React.useState("");

  const authorName = post.author?.name ?? "Unknown";
  const authorId = post.author?.id ?? "unknown";

  const handleSubmitReply = () => {
    const text = replyText.trim();
    if (!text) return;
    replyMutation.mutate(
      { postId: post.id, body: text },
      { onSuccess: () => setReplyText("") },
    );
  };

  return (
    <section className="min-w-0 flex-1 border-x border-border bg-background">
      {/* Sticky header with back button */}
      <header className="sticky -top-4 md:-top-6 z-10 border-b border-border bg-background/80 backdrop-blur pt-4 md:pt-6">
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-muted/60"
            onClick={() => void navigate("/app/plaza")}
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">{t("plaza.post")}</h1>
        </div>
      </header>

      {/* Post content */}
      <div className="border-b border-border px-4 py-4 sm:px-5">
        {/* Author row */}
        <div className="mb-3 flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${avatarGradientClass(authorName)} text-xs font-bold text-white`}>
            {initials(authorName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-foreground">{authorName}</p>
            <p className="truncate text-sm text-muted-foreground">@{authorId.slice(0, 8)}</p>
          </div>
        </div>

        {/* Body */}
        <p className="whitespace-pre-wrap text-[17px] leading-7 text-foreground">{post.body}</p>

        {/* Quoted post */}
        {post.quotedPost && (
          <Link
            to={`/app/plaza/${post.quotedPost.id}`}
            className="mt-3 block rounded-xl border border-border p-3 transition-colors hover:bg-muted/30"
          >
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="font-bold text-foreground">
                {post.quotedPost.author?.name ?? "Unknown"}
              </span>
              <span className="text-muted-foreground">
                @{(post.quotedPost.author?.id ?? "unknown").slice(0, 8)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {truncateBody(post.quotedPost.body, 280)}
            </p>
          </Link>
        )}

        {/* Timestamp */}
        <div className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          {formatDateTime(post.createdAt)}
        </div>

        {/* Engagement stats */}
        <div className="mt-3 flex items-center gap-5 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            <strong className="font-bold text-foreground">{post.replyCount ?? 0}</strong>{" "}
            {t("plaza.replies")}
          </span>
          <span className="text-muted-foreground">
            <strong className="font-bold text-foreground">{post.repostCount ?? 0}</strong>{" "}
            {t("plaza.reposts") ?? "Reposts"}
          </span>
          <span className="text-muted-foreground">
            <strong className="font-bold text-foreground">{post.likeCount ?? 0}</strong>{" "}
            {t("plaza.likes") ?? "Likes"}
          </span>
          <span className="text-muted-foreground">
            <strong className="font-bold text-foreground">{post.viewCount ?? 0}</strong>{" "}
            {t("plaza.views") ?? "Views"}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex items-center justify-around border-t border-border pt-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--color-brand)/0.1)] hover:text-brand"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-success/10 hover:text-success",
              post.reposted && "text-success",
            )}
            onClick={() => repostMutation.mutate({ postId: post.id, reposted: !!post.reposted })}
          >
            <Repeat2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-danger/10 hover:text-danger",
              post.liked && "text-danger",
            )}
            onClick={() => likeMutation.mutate({ postId: post.id, liked: !!post.liked })}
          >
            <Heart className={cn("h-5 w-5", post.liked && "fill-current")} />
          </button>
          <span className="flex items-center gap-2 rounded-full p-2 text-muted-foreground">
            <Eye className="h-5 w-5" />
          </span>
        </div>
      </div>

      {/* Reply composer */}
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <PlazaComposer
          value={replyText}
          onChange={setReplyText}
          onSubmit={handleSubmitReply}
          isSubmitting={replyMutation.isPending}
        />
      </div>

      {/* Replies */}
      {loadingReplies ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : replies.length > 0 ? (
        <div>
          {replies.map((reply) => (
            <div key={reply.id} className="border-b border-border px-4 py-4 sm:px-5">
              <div className="flex gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarGradientClass(reply.author?.name ?? "Unknown")} text-xs font-bold text-white`}>
                  {initials(reply.author?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-bold text-foreground">
                      {reply.author?.name ?? "Unknown"}
                    </span>
                    <span className="text-muted-foreground">
                      @{(reply.author?.id ?? "unknown").slice(0, 8)}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {formatRelativeTime(reply.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">
                    {reply.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
