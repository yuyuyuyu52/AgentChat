import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { usePost, useLikePost, useRepostPost } from "@/lib/queries/use-posts";
import { recordPlazaView } from "@/lib/app-api";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { PlazaFeed, type FeedMode } from "./PlazaFeed";
import { PlazaPostDetail } from "./PlazaPostDetail";
import { PlazaSidebar } from "./PlazaSidebar";

export default function PlazaLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { postId } = useParams<{ postId?: string }>();

  const [allPosts, setAllPosts] = React.useState<PlazaPost[]>([]);
  const [selectedAuthorId, setSelectedAuthorId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [feedMode, setFeedMode] = React.useState<FeedMode>("forYou");

  // Load selected post from URL param — try from feed cache first
  const postFromFeed = allPosts.find((p) => p.id === postId) ?? null;
  const { data: postFromQuery } = usePost(postId && !postFromFeed ? postId : undefined);
  const selectedPost: PlazaPost | null = postFromFeed ?? postFromQuery ?? null;

  // Record view when a post becomes selected
  React.useEffect(() => {
    if (selectedPost?.id) {
      void recordPlazaView(selectedPost.id).catch(() => {});
    }
  }, [selectedPost?.id]);

  const likeMutation = useLikePost();
  const repostMutation = useRepostPost();

  const handleLike = (postId: string, currentlyLiked: boolean) => {
    likeMutation.mutate({ postId, liked: currentlyLiked });
  };

  const handleRepost = (postId: string, currentlyReposted: boolean) => {
    repostMutation.mutate({ postId, reposted: currentlyReposted });
  };

  const handleClose = () => {
    void navigate("/app/plaza");
  };

  const handleAuthorClick = (authorId: string) => {
    setSelectedAuthorId(authorId);
  };

  const handleClearAuthor = () => {
    setSelectedAuthorId(null);
  };

  return (
    <div className="mx-auto flex max-w-[1100px] gap-0 xl:px-4">
      {/* Feed column — always visible */}
      <PlazaFeed
        activePostId={postId}
        selectedAuthorId={selectedAuthorId}
        onAuthorClick={handleAuthorClick}
        onClearAuthor={handleClearAuthor}
        feedMode={feedMode}
        onFeedModeChange={setFeedMode}
        search={search}
        onPostsLoaded={setAllPosts}
      />

      {/* Sidebar — desktop only */}
      <aside className="hidden w-[350px] shrink-0 px-6 py-3 xl:block">
        {/* Post detail panel */}
        {selectedPost ? (
          <Card className="mb-4 overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">{t("plaza.post")}</h2>
            </div>
            <PlazaPostDetail
              post={selectedPost}
              onClose={handleClose}
              onLike={handleLike}
              onRepost={handleRepost}
            />
          </Card>
        ) : (
          <Card className="mb-4 overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">{t("plaza.post")}</h2>
            </div>
            <div className="px-5 py-10 text-sm text-muted-foreground">
              {t("plaza.selectPostToInspect")}
            </div>
          </Card>
        )}

        <PlazaSidebar
          posts={allPosts}
          selectedAuthorId={selectedAuthorId}
          selectedPost={selectedPost}
          search={search}
          onSearchChange={setSearch}
          onAuthorSelect={setSelectedAuthorId}
        />
      </aside>
    </div>
  );
}
