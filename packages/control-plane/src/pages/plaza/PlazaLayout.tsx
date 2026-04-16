import React from "react";
import { useParams } from "react-router-dom";
import type { PlazaPost } from "@agentchatjs/protocol";
import { usePost } from "@/lib/queries/use-posts";
import { recordPlazaView } from "@/lib/app-api";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { PlazaFeed, type FeedMode } from "./PlazaFeed";
import { PlazaPostPage } from "./PlazaPostPage";
import { PlazaSidebar } from "./PlazaSidebar";

export default function PlazaLayout() {
  const { t } = useI18n();
  const { postId } = useParams<{ postId?: string }>();

  const [allPosts, setAllPosts] = React.useState<PlazaPost[]>([]);
  const [selectedAuthorId, setSelectedAuthorId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [feedMode, setFeedMode] = React.useState<FeedMode>("forYou");

  // Load selected post from URL param — try from feed cache first
  const postFromFeed = allPosts.find((p) => p.id === postId) ?? null;
  const { data: postFromQuery, isLoading: postLoading } = usePost(postId && !postFromFeed ? postId : undefined);
  const selectedPost: PlazaPost | null = postFromFeed ?? postFromQuery ?? null;

  // Record view when a post becomes selected
  React.useEffect(() => {
    if (selectedPost?.id) {
      void recordPlazaView(selectedPost.id).catch(() => {});
    }
  }, [selectedPost?.id]);

  const handleAuthorClick = (authorId: string) => {
    setSelectedAuthorId(authorId);
  };

  const handleClearAuthor = () => {
    setSelectedAuthorId(null);
  };

  // Post detail page — replaces feed when viewing a single post (like X)
  if (postId) {
    return (
      <div className="-mx-4 -mt-4 mb-[-5rem] md:-mx-6 md:-mt-6 md:mb-[-1.5rem]">
      <div className="mx-auto flex max-w-[1100px] gap-0 xl:px-4">
        {selectedPost ? (
          <PlazaPostPage post={selectedPost} />
        ) : (
          <section className="flex min-h-[400px] min-w-0 flex-1 items-center justify-center border-x border-border bg-background">
            {postLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("plaza.loadPostDetailFailed")}</p>
            )}
          </section>
        )}

        {/* Sidebar — desktop only */}
        <aside className="hidden w-[350px] shrink-0 px-6 py-3 xl:block">
          <PlazaSidebar
            posts={allPosts}
            selectedAuthorId={selectedAuthorId}
            selectedPost={null}
            search={search}
            onSearchChange={setSearch}
            onAuthorSelect={setSelectedAuthorId}
            onFeedModeChange={setFeedMode}
          />
        </aside>
      </div>
      </div>
    );
  }

  // Feed view — default
  return (
    <div className="-mx-4 -mt-4 mb-[-5rem] md:-mx-6 md:-mt-6 md:mb-[-1.5rem]">
      <div className="mx-auto flex max-w-[1100px] gap-0 xl:px-4">
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
          <PlazaSidebar
            posts={allPosts}
            selectedAuthorId={selectedAuthorId}
            selectedPost={null}
            search={search}
            onSearchChange={setSearch}
            onAuthorSelect={setSelectedAuthorId}
            onFeedModeChange={setFeedMode}
          />
        </aside>
      </div>
    </div>
  );
}
