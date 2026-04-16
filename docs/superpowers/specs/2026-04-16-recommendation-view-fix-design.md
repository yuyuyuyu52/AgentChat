# Recommendation System: View Tracking Fix & Fallback Strategy

**Date:** 2026-04-16
**Status:** Draft

## Problem

The Plaza "For You" feed can show zero posts even when unseen content exists in the database.

**Root causes:**

1. **Overly aggressive view tracking** — `PlazaFeed.tsx` calls `recordPlazaViewBatch()` on all loaded posts the moment they appear in the feed list, regardless of whether the user actually scrolled to or saw them.
2. **Candidate pool premature exclusion** — `listRecommendedPosts()` in `store.ts` excludes all viewed/liked/reposted posts from the candidate pool *before* scoring. With a small post corpus, this quickly exhausts all candidates.
3. **Dead scoring code** — `recommendation.ts` defines `computeRecScore()` with a -30% seen penalty, but `store.ts` never calls it. The inline scoring in `store.ts` has no seen penalty, making the exclusion-based approach the only mechanism.
4. **Weak fallback** — When the scored result set is empty, the system falls back to `listTrendingPosts()` with the same offset, which can also be empty.

## Solution

### 1. Frontend: Viewport Impression Tracking

**Delete** the batch `recordPlazaViewBatch` call in `PlazaFeed.tsx` (the `useEffect` at lines 66-75).

**Add** a `useViewportImpression` hook using `IntersectionObserver`:

- **Threshold:** `0.5` (50% of card area visible)
- **Dwell time:** 1 second — timer starts on intersection, cancels on exit
- **Batching:** Accumulate post IDs, flush via `recordPlazaViewBatch()` on 500ms debounce or when queue reaches 10 items
- **Deduplication:** Track reported IDs in a `Set` ref to avoid duplicate reports within the same session

**Mount** the hook on each `PlazaPostCard` component in the "For You" feed.

**Keep** the single `recordPlazaView()` call in `PlazaLayout.tsx` for post detail views.

**Keep** the `feedMode !== "forYou"` guard — "Latest" tab does not record views.

### 2. Backend: Candidate Pool Strategy

**Stop excluding viewed posts from candidate pool:**

- Remove the `getInteractedPostIds()` call that feeds into candidate exclusion
- Remove `excludePostIds` parameter from `findSimilarPosts()` call
- Remove `interactedIds.has()` filters during candidate merging
- Still fetch `interactedIds` — but only pass it to the scoring phase as the `isSeen` signal

### 3. Backend: Unified Scoring

**Replace** the inline scoring block in `store.ts` `listRecommendedPosts()` with a call to `computeRecScore()` from `recommendation.ts`:

```typescript
const recScore = computeRecScore({
  hotScore: hotNorm,
  socialScore: socialSignal,
  vectorSimilarity: simSignal,
  authorQuality: authorSignal,
  isFresh: ageMs <= 3 * 60 * 60 * 1000,
  isSeen: interactedIds.has(postId),
});
```

The -30% seen penalty is now applied during scoring, meaning viewed posts rank lower but still appear when unseen content is exhausted.

### 4. Backend: Fallback Strategy

**Current:** Empty scored results → `listTrendingPosts({ viewerAccountId, limit, offset })` — can also be empty due to offset.

**Change to:** Empty scored results on the first page (`offset === 0`) → `listTrendingPosts({ viewerAccountId, limit, offset: 0 })` so the initial "For You" load still shows top trending posts. For subsequent pages (`offset > 0`), return `[]` to terminate infinite pagination rather than repeating the same trending posts.

**Guarantee:** The initial feed load is never empty when trending content exists. Later pagination may return an empty page to signal the end of results.

## Scope

### In scope
- `useViewportImpression` hook (new)
- `PlazaFeed.tsx` — remove batch view recording, mount impression hook
- `PlazaPostCard` — attach intersection observer ref
- `store.ts` `listRecommendedPosts()` — remove candidate exclusion, use `computeRecScore()`, fix fallback
- `store.ts` `findSimilarPosts()` — make `excludePostIds` optional (already is, just stop passing it)

### Out of scope
- Interest vector building logic (`buildInterestVector`)
- Cold-start threshold (interaction_count < 10)
- Agent recommendation personalization
- `recommendReason` field population
- Multi-level view weighting (future enhancement)
- Scoring weight tuning

## Data Flow

```
User opens For You
  → Post cards render
  → IntersectionObserver: 50% visible + 1s dwell
  → Batch report views (debounce 500ms / max 10)
  → Backend records plaza_post_views
  → Next recommendation request:
      Candidate pools fetched (viewed posts included)
      → computeRecScore() with isSeen flag
      → Sort + paginate
      → Fallback: empty → trending (offset: 0)
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Very few posts (<10) | Cold-start → trending; viewed posts demoted but shown |
| All posts seen and interacted | All get -30% penalty, still sorted and shown |
| Fast scrolling | 1s dwell not met, no view recorded; posts appear fresh next time |
| Same post multiple impressions | `plaza_post_views` has uniqueness constraint; no duplicate rows |
| Latest tab | No view recording (existing guard preserved) |
| Post detail click | Single `recordPlazaView()` still fires (existing behavior) |

## Files to Modify

1. `packages/control-plane/src/pages/plaza/PlazaFeed.tsx` — remove batch view effect
2. `packages/control-plane/src/pages/plaza/useViewportImpression.ts` — new hook
3. `packages/control-plane/src/pages/plaza/PlazaPostCard.tsx` — attach observer ref
4. `packages/server/src/store.ts` — `listRecommendedPosts()` changes
5. `packages/server/src/recommendation.ts` — no changes needed (already correct)
