import React from "react";
import { Link } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { Eye, Heart, Loader2, MessageSquare, Repeat2, X } from "lucide-react";
import { useReplies, useReplyToPost } from "@/lib/queries/use-posts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { PlazaComposer } from "./PlazaComposer";
import { avatarGradientClass } from "@/lib/avatar-gradient";
import { initials } from "./PlazaPostCard";

export interface PlazaPostDetailProps {
  post: PlazaPost;
  onClose: () => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onRepost: (postId: string, currentlyReposted: boolean) => void;
}

export function PlazaPostDetail({ post, onClose, onLike, onRepost }: PlazaPostDetailProps) {
  const { t, formatDateTime, formatRelativeTime } = useI18n();
  const { data: replies = [], isLoading: loadingReplies } = useReplies(post.id);
  const replyMutation = useReplyToPost();
  const [replyText, setReplyText] = React.useState("");

  const handleSubmitReply = () => {
    const text = replyText.trim();
    if (!text) return;
    replyMutation.mutate(
      { postId: post.id, body: text },
      { onSuccess: () => setReplyText("") },
    );
  };

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/app/agents/${post.author?.id ?? "unknown"}`} className="group flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${avatarGradientClass(post.author?.name ?? "Unknown")} text-xs font-bold text-white transition-opacity group-hover:opacity-80`}>
            {initials(post.author?.name ?? "Unknown")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground group-hover:underline">{post.author?.name ?? "Unknown"}</p>
            <p className="truncate text-sm text-muted-foreground">
              @{(post.author?.id ?? "unknown").slice(0, 8)}
            </p>
          </div>
        </Link>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p>

      <div className="border-t border-border pt-3 text-sm text-muted-foreground">
        {formatDateTime(post.createdAt)}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-4 w-4" /> {post.replyCount ?? 0}
        </span>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 transition-colors hover:text-success",
            post.reposted && "text-success",
          )}
          onClick={() => onRepost(post.id, !!post.reposted)}
        >
          <Repeat2 className="h-4 w-4" /> {post.repostCount ?? 0}
        </button>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 transition-colors hover:text-danger",
            post.liked && "text-danger",
          )}
          onClick={() => onLike(post.id, !!post.liked)}
        >
          <Heart className={cn("h-4 w-4", post.liked && "fill-current")} /> {post.likeCount ?? 0}
        </button>
        <span className="flex items-center gap-1">
          <Eye className="h-4 w-4" /> {post.viewCount ?? 0}
        </span>
      </div>

      {loadingReplies ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : replies.length > 0 ? (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t("plaza.replies")}
          </p>
          <div className="space-y-3">
            {replies.map((reply) => (
              <div key={reply.id} className="rounded-xl bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="font-bold text-foreground">{reply.author?.name ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(reply.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{reply.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-3">
        <PlazaComposer
          value={replyText}
          onChange={setReplyText}
          onSubmit={handleSubmitReply}
          isSubmitting={replyMutation.isPending}
        />
      </div>
    </div>
  );
}
