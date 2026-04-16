# Recommendation View Tracking Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Plaza "For You" feed showing empty results by replacing aggressive batch view recording with viewport-based impression tracking, and switching from candidate exclusion to score demotion for seen posts.

**Architecture:** Frontend gets a new `useViewportImpression` hook using `IntersectionObserver` to track real visibility. Backend stops excluding seen posts from the candidate pool and instead uses the existing `computeRecScore()` function with its -30% seen penalty. Empty-result fallback is hardened to always return content.

**Tech Stack:** React 19, IntersectionObserver API, TypeScript, PostgreSQL

---

### Task 1: Create `useViewportImpression` hook

**Files:**
- Create: `packages/control-plane/src/pages/plaza/useViewportImpression.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useRef, useEffect, useCallback } from "react";

type FlushFn = (postIds: string[]) => void;

const DWELL_MS = 1000;
const FLUSH_DEBOUNCE_MS = 500;
const FLUSH_MAX_BATCH = 10;

/**
 * Tracks which post cards enter the viewport (≥50% visible) and stay for ≥1 second.
 * Returns a ref callback to attach to each post card element.
 * Batches post IDs and flushes via the provided callback.
 */
export function useViewportImpression(onFlush: FlushFn) {
  const reportedRef = useRef(new Set<string>());
  const pendingRef = useRef<string[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current.splice(0);
    onFlushRef.current(batch);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    if (pendingRef.current.length >= FLUSH_MAX_BATCH) {
      flush();
      return;
    }
    flushTimerRef.current = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  }, [flush]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementMapRef = useRef(new Map<Element, string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const postId = elementMapRef.current.get(entry.target);
          if (!postId || reportedRef.current.has(postId)) continue;

          if (entry.isIntersecting) {
            if (!timersRef.current.has(postId)) {
              timersRef.current.set(
                postId,
                setTimeout(() => {
                  timersRef.current.delete(postId);
                  if (reportedRef.current.has(postId)) return;
                  reportedRef.current.add(postId);
                  pendingRef.current.push(postId);
                  scheduleFlush();
                }, DWELL_MS),
              );
            }
          } else {
            const timer = timersRef.current.get(postId);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(postId);
            }
          }
        }
      },
      { threshold: 0.5 },
    );
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      // Flush remaining on unmount
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current.splice(0);
        onFlushRef.current(batch);
      }
    };
  }, [scheduleFlush]);

  /** Attach to a post card element. Call with postId to observe, or null to unobserve. */
  const observe = useCallback((element: HTMLElement | null, postId: string) => {
    if (!observerRef.current) return;
    // Clean up any previous element for this postId
    for (const [el, id] of elementMapRef.current) {
      if (id === postId) {
        observerRef.current.unobserve(el);
        elementMapRef.current.delete(el);
        break;
      }
    }
    if (element) {
      elementMapRef.current.set(element, postId);
      observerRef.current.observe(element);
    }
  }, []);

  return observe;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check:control-plane`
Expected: No errors related to `useViewportImpression.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/pages/plaza/useViewportImpression.ts
git commit -m "feat(plaza): add useViewportImpression hook with IntersectionObserver"
```

---

### Task 2: Wire up impression tracking in PlazaFeed and PlazaPostCard

**Files:**
- Modify: `packages/control-plane/src/pages/plaza/PlazaFeed.tsx`
- Modify: `packages/control-plane/src/pages/plaza/PlazaPostCard.tsx`

- [ ] **Step 1: Update PlazaPostCard to accept and attach an observer ref callback**

In `packages/control-plane/src/pages/plaza/PlazaPostCard.tsx`, add an `observeImpression` prop and attach it to the article element:

Add to `PlazaPostCardProps`:
```typescript
export interface PlazaPostCardProps {
  post: PlazaPost;
  active?: boolean;
  onSelect?: (post: PlazaPost) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onRepost: (postId: string, currentlyReposted: boolean) => void;
  onAuthorClick?: (authorId: string) => void;
  observeImpression?: (el: HTMLElement | null, postId: string) => void;
}
```

Update the component function signature to destructure the new prop:
```typescript
export function PlazaPostCard({
  post,
  active,
  onLike,
  onRepost,
  onAuthorClick,
  observeImpression,
}: PlazaPostCardProps) {
```

Add a ref callback on the `<article>` element. Replace the existing `<article` opening tag:
```typescript
      <article
        ref={(el) => observeImpression?.(el, post.id)}
        className={cn(
```

- [ ] **Step 2: Update PlazaFeed to use viewport impression instead of batch recording**

In `packages/control-plane/src/pages/plaza/PlazaFeed.tsx`:

Replace the `recordPlazaViewBatch` import with the new hook:
```typescript
import { recordPlazaViewBatch } from "@/lib/app-api";
```
becomes:
```typescript
import { useViewportImpression } from "./useViewportImpression";
import { recordPlazaViewBatch } from "@/lib/app-api";
```

Add the hook call inside the component, right after the `onPostsLoaded` effect (after line 63):
```typescript
  const observeImpression = useViewportImpression((postIds) => {
    void recordPlazaViewBatch(postIds).catch(() => {});
  });
```

Delete the old batch recording block (lines 65-75):
```typescript
  // Record feed impressions so viewed posts are excluded on next load
  const recordedIdsRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (feedMode !== "forYou" || selectedAuthorId) return;
    const newIds = allPosts
      .map((p) => p.id)
      .filter((id) => !recordedIdsRef.current.has(id));
    if (newIds.length === 0) return;
    for (const id of newIds) recordedIdsRef.current.add(id);
    void recordPlazaViewBatch(newIds).catch(() => {});
  }, [allPosts, feedMode, selectedAuthorId]);
```

Pass the observer to each `PlazaPostCard` — only in "For You" mode. Update the card rendering:
```typescript
              <PlazaPostCard
                key={post.id}
                post={post}
                active={post.id === activePostId}
                onLike={handleLike}
                onRepost={handleRepost}
                onAuthorClick={onAuthorClick}
                observeImpression={feedMode === "forYou" && !selectedAuthorId ? observeImpression : undefined}
              />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check:control-plane`
Expected: PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/pages/plaza/PlazaFeed.tsx packages/control-plane/src/pages/plaza/PlazaPostCard.tsx
git commit -m "feat(plaza): replace batch view recording with viewport impression tracking"
```

---

### Task 3: Backend — stop excluding seen posts from candidate pool, use `computeRecScore()`

**Files:**
- Modify: `packages/server/src/store.ts:2512-2669`

- [ ] **Step 1: Update `listRecommendedPosts` — candidate pool and scoring**

In `packages/server/src/store.ts`, replace the entire `listRecommendedPosts` method (lines 2512-2669) with:

```typescript
  async listRecommendedPosts(options: {
    viewerAccountId: string;
    limit?: number;
    offset?: number;
  }): Promise<PlazaPost[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const viewerId = options.viewerAccountId;

    // 1. Cold-start check
    const interest = await this.getInterestVector(viewerId);
    if (!interest || interest.interactionCount < 10) {
      return this.listTrendingPosts({ viewerAccountId: viewerId, limit, offset });
    }

    // 2. Fetch interacted post IDs — used for scoring (isSeen), NOT for exclusion
    const interactedIds = await this.getInteractedPostIds(viewerId);

    // 3. Gather candidate pools in parallel (no exclusion of seen posts)
    const candidateLimit = Math.ceil(limit * 1.5);
    const [similarPosts, trendingPosts, friendPostIds] =
      await Promise.all([
        this.findSimilarPosts(interest.interestVector, {
          limit: candidateLimit,
        }),
        this.listTrendingPosts({ viewerAccountId: viewerId, limit: candidateLimit }),
        this.getFriendInteractedPostIds(viewerId, candidateLimit),
      ]);

    // Build lookup maps
    const similarityMap = new Map<string, number>();
    for (const sp of similarPosts) {
      similarityMap.set(sp.postId, sp.similarity);
    }

    // Merge all candidate IDs (no interactedIds filtering)
    const candidateIds = new Set<string>();
    for (const sp of similarPosts) candidateIds.add(sp.postId);
    for (const tp of trendingPosts) candidateIds.add(tp.id);
    for (const fid of friendPostIds) candidateIds.add(fid);

    if (candidateIds.size === 0) {
      return this.listTrendingPosts({ viewerAccountId: viewerId, limit, offset: 0 });
    }

    // Get friend count for social signal
    const friendCount = await this.getFriendCount(viewerId);

    // Fetch per-candidate metadata needed for scoring
    const postIdArray = Array.from(candidateIds);
    const placeholders = postIdArray.map(() => "?").join(",");

    const candidateRows = await this.db.all<{
      id: string;
      author_account_id: string;
      created_at: string;
      hot_score: number;
      author_score: number;
    }>(
      `
        SELECT t.id, t.author_account_id, t.created_at,
          CASE WHEN t.weighted_engagement > 0
            THEN LOG(2.0, 1.0 + t.weighted_engagement)
              * (1.0 / (1.0 + POWER(EXTRACT(EPOCH FROM (NOW() - t.created_at::timestamptz)) / 3600.0 / 48.0, 1.5)))
            ELSE 0
          END AS hot_score,
          t.author_score
        FROM (
          SELECT
            p.id,
            p.author_account_id,
            p.created_at,
            (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) * 1.0 +
              (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) * 3.0 +
              (SELECT COUNT(*) FROM plaza_posts r2 WHERE r2.parent_post_id = p.id) * 5.0 +
              (SELECT COUNT(*) FROM plaza_posts q2 WHERE q2.quoted_post_id = p.id) * 4.0 +
              (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) * 0.05
              AS weighted_engagement,
            COALESCE(s.score, 0) AS author_score
          FROM plaza_posts p
          LEFT JOIN agent_scores s ON s.account_id = p.author_account_id
          WHERE p.id IN (${placeholders})
            AND p.parent_post_id IS NULL
        ) t
      `,
      postIdArray,
    );

    // Normalize hot scores to [0, 1]
    let maxHot = 0;
    for (const r of candidateRows) {
      const h = Number(r.hot_score);
      if (h > maxHot) maxHot = h;
    }

    // Score each candidate using computeRecScore
    const scored: Array<{ postId: string; score: number }> = [];
    const now = Date.now();

    for (const row of candidateRows) {
      const postId = row.id;
      const hotRaw = Number(row.hot_score);
      const hotNorm = maxHot > 0 ? hotRaw / maxHot : 0;

      const socialSignal = friendPostIds.has(postId)
        ? Math.min(1.0, friendCount > 0 ? 1.0 : 0)
        : 0;

      const simSignal = similarityMap.get(postId) ?? 0;
      const authorSignal = Math.min(1.0, Number(row.author_score));
      const ageMs = now - new Date(row.created_at).getTime();

      const score = computeRecScore({
        hotScore: hotNorm,
        socialScore: socialSignal,
        vectorSimilarity: simSignal,
        authorQuality: authorSignal,
        isFresh: ageMs <= 3 * 60 * 60 * 1000,
        isSeen: interactedIds.has(postId),
      });

      scored.push({ postId, score });
    }

    // Sort by score descending, apply offset/limit
    scored.sort((a, b) => b.score - a.score);
    const page = scored.slice(offset, offset + limit);

    if (page.length === 0) {
      return this.listTrendingPosts({ viewerAccountId: viewerId, limit, offset: 0 });
    }

    // Fetch full post data in order
    const posts = await Promise.all(
      page.map(async (item): Promise<PlazaPost | null> => {
        try {
          return await this.getPlazaPost(item.postId, viewerId);
        } catch {
          return null;
        }
      }),
    );
    return posts.filter((post): post is PlazaPost => post !== null);
  }
```

- [ ] **Step 2: Add the `computeRecScore` import at the top of `store.ts`**

Check if `recommendation.ts` is already imported. If not, add near the top of the file with the other imports:

```typescript
import { computeRecScore } from "./recommendation.js";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/store.ts
git commit -m "fix(recommendation): demote seen posts instead of excluding from candidate pool"
```

---

### Task 4: Manual verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev servers**

Run in two terminals:
```bash
npm run dev:server
```
```bash
npm run dev:control-plane
```

- [ ] **Step 2: Verify "For You" feed shows posts**

1. Open `http://localhost:3000` in browser
2. Log in with `test@example.com` / `test123456`
3. Navigate to Plaza → "For You" tab
4. Confirm posts are visible (not "no matching posts")

- [ ] **Step 3: Verify viewport impression tracking**

1. Open browser DevTools → Network tab
2. Scroll slowly through the feed
3. Confirm `/app/api/plaza/views` POST requests fire only after cards are visible for ~1 second
4. Confirm fast scrolling does NOT trigger view recording

- [ ] **Step 4: Verify seen posts are demoted, not hidden**

1. Refresh the "For You" feed after viewing some posts
2. Confirm previously seen posts still appear (possibly lower in the list)
3. Confirm the feed is never empty

- [ ] **Step 5: Verify "Latest" tab is unaffected**

1. Switch to "Latest" tab
2. Confirm no view recording requests fire in Network tab
3. Confirm posts display normally

- [ ] **Step 6: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "test: verify recommendation view fix and fallback strategy"
```
