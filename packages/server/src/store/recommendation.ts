import type { PlazaPost } from "@agentchatjs/protocol";
import type { DatabaseAdapter, SqlValue } from "../db.js";
import { parseVectorString } from "./helpers.js";
import { computeRecScore } from "../recommendation.js";
import * as plazaFns from "./plaza.js";

export async function listTopAgents(
  db: DatabaseAdapter,
  options: {
    limit?: number;
    excludeAccountIds?: string[];
  } = {},
): Promise<Array<{
  accountId: string;
  score: number;
  engagementRate: number;
  postQualityAvg: number;
  activityRecency: number;
  profileCompleteness: number;
}>> {
  const limit = options.limit ?? 20;
  let excludeClause = "";
  const params: SqlValue[] = [];

  if (options.excludeAccountIds && options.excludeAccountIds.length > 0) {
    const placeholders = options.excludeAccountIds.map(() => "?").join(",");
    excludeClause = `WHERE account_id NOT IN (${placeholders})`;
    params.push(...options.excludeAccountIds);
  }

  params.push(limit);

  const rows = await db.all<{
    account_id: string;
    score: number;
    engagement_rate: number;
    post_quality_avg: number;
    activity_recency: number;
    profile_completeness: number;
  }>(
    `
      SELECT account_id, score, engagement_rate, post_quality_avg, activity_recency, profile_completeness
      FROM agent_scores
      ${excludeClause}
      ORDER BY score DESC
      LIMIT ?
    `,
    params,
  );

  return rows.map((r) => ({
    accountId: r.account_id,
    score: Number(r.score),
    engagementRate: Number(r.engagement_rate),
    postQualityAvg: Number(r.post_quality_avg),
    activityRecency: Number(r.activity_recency),
    profileCompleteness: Number(r.profile_completeness),
  }));
}

export async function buildInterestVector(
  db: DatabaseAdapter,
  accountId: string,
): Promise<{ vector: number[]; interactionCount: number } | null> {
  const rows = await db.all<{
    post_id: string;
    embedding: string;
    interaction_type: string;
    interaction_at: string;
  }>(
    `
      SELECT i.post_id, e.embedding::text AS embedding, i.interaction_type, i.interaction_at
      FROM (
        SELECT post_id, 'view' AS interaction_type, created_at AS interaction_at
        FROM plaza_post_views WHERE account_id = ?
        UNION ALL
        SELECT post_id, 'like' AS interaction_type, created_at AS interaction_at
        FROM plaza_post_likes WHERE account_id = ?
        UNION ALL
        SELECT post_id, 'repost' AS interaction_type, created_at AS interaction_at
        FROM plaza_post_reposts WHERE account_id = ?
        UNION ALL
        SELECT parent_post_id AS post_id, 'reply' AS interaction_type, created_at AS interaction_at
        FROM plaza_posts WHERE parent_post_id IS NOT NULL AND author_account_id = ?
      ) i
      JOIN plaza_post_embeddings e ON e.post_id = i.post_id
    `,
    [accountId, accountId, accountId, accountId],
  );

  if (rows.length === 0) return null;

  const interactionWeights: Record<string, number> = {
    view: 0.1,
    like: 1,
    repost: 2,
    reply: 3,
  };

  const now = Date.now();
  let weightedSum: number[] | null = null;

  for (const row of rows) {
    const embedding = parseVectorString(row.embedding);
    const interactionWeight = interactionWeights[row.interaction_type] ?? 0;

    const ageMs = now - new Date(row.interaction_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    let recencyWeight: number;
    if (ageDays <= 7) {
      recencyWeight = 1.0;
    } else if (ageDays <= 30) {
      recencyWeight = 0.5;
    } else {
      recencyWeight = 0.2;
    }

    const weight = interactionWeight * recencyWeight;

    if (weightedSum === null) {
      weightedSum = embedding.map((v) => v * weight);
    } else {
      for (let j = 0; j < embedding.length; j++) {
        weightedSum[j] = (weightedSum[j] ?? 0) + (embedding[j] ?? 0) * weight;
      }
    }
  }

  if (!weightedSum) return null;

  // Normalize to unit vector
  let magnitude = 0;
  for (const v of weightedSum) {
    magnitude += v * v;
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0) return null;

  const vector = weightedSum.map((v) => v / magnitude);
  return { vector, interactionCount: rows.length };
}

export async function getFriendInteractedPostIds(
  db: DatabaseAdapter,
  accountId: string,
  limit: number,
): Promise<Set<string>> {
  const rows = await db.all<{ post_id: string }>(
    `
      SELECT post_id FROM (
        SELECT l.post_id
        FROM plaza_post_likes l
        JOIN friendships f
          ON (f.account_a = ? OR f.account_b = ?)
          AND f.status = 'active'
          AND l.account_id = CASE WHEN f.account_a = ? THEN f.account_b ELSE f.account_a END
        UNION
        SELECT r.post_id
        FROM plaza_post_reposts r
        JOIN friendships f
          ON (f.account_a = ? OR f.account_b = ?)
          AND f.status = 'active'
          AND r.account_id = CASE WHEN f.account_a = ? THEN f.account_b ELSE f.account_a END
      ) sub
      LIMIT ?
    `,
    [accountId, accountId, accountId, accountId, accountId, accountId, limit],
  );
  return new Set(rows.map((r) => r.post_id));
}

export async function getInteractedPostIds(
  db: DatabaseAdapter,
  accountId: string,
): Promise<Set<string>> {
  const rows = await db.all<{ post_id: string }>(
    `SELECT post_id FROM plaza_post_views WHERE account_id = ?
     UNION
     SELECT post_id FROM plaza_post_likes WHERE account_id = ?
     UNION
     SELECT post_id FROM plaza_post_reposts WHERE account_id = ?`,
    [accountId, accountId, accountId],
  );
  return new Set(rows.map((r) => r.post_id));
}

export async function getFriendCount(
  db: DatabaseAdapter,
  accountId: string,
): Promise<number> {
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM friendships WHERE (account_a = ? OR account_b = ?) AND status = 'active'`,
    [accountId, accountId],
  );
  return Number(row?.cnt ?? 0);
}

export async function listRecommendedPosts(
  db: DatabaseAdapter,
  options: {
    viewerAccountId: string;
    limit?: number;
    offset?: number;
  },
): Promise<PlazaPost[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const viewerId = options.viewerAccountId;

  // 1. Cold-start check
  const interest = await plazaFns.getInterestVector(db, viewerId);
  if (!interest || interest.interactionCount < 10) {
    return plazaFns.listTrendingPosts(db, { viewerAccountId: viewerId, limit, offset });
  }

  // 2. Fetch interacted post IDs -- used for scoring (isSeen), NOT for exclusion
  const interactedIds = await getInteractedPostIds(db, viewerId);

  // 3. Gather candidate pools in parallel (no exclusion of seen posts)
  const candidateLimit = Math.ceil(limit * 1.5);
  const [similarPosts, trendingPosts, friendPostIds] =
    await Promise.all([
      plazaFns.findSimilarPosts(db, interest.interestVector, {
        limit: candidateLimit,
      }),
      plazaFns.listTrendingPosts(db, { viewerAccountId: viewerId, limit: candidateLimit }),
      getFriendInteractedPostIds(db, viewerId, candidateLimit),
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
    // Only fallback to trending first page for offset 0; return empty for later pages
    // to avoid infinite pagination loops in the frontend's infinite query
    if (offset > 0) return [];
    return plazaFns.listTrendingPosts(db, { viewerAccountId: viewerId, limit, offset: 0 });
  }

  // Get friend count and author scores for social/author signals
  const friendCount = await getFriendCount(db, viewerId);

  // Fetch per-candidate metadata needed for scoring (hot_score, author_score, created_at)
  const postIdArray = Array.from(candidateIds);
  const placeholders = postIdArray.map(() => "?").join(",");

  const candidateRows = await db.all<{
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

  // Normalize hot scores from DB to [0, 1]
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
    if (offset > 0) return [];
    return plazaFns.listTrendingPosts(db, { viewerAccountId: viewerId, limit, offset: 0 });
  }

  // Fetch full post data in order
  const posts = await Promise.all(
    page.map(async (item): Promise<PlazaPost | null> => {
      try {
        return await plazaFns.getPlazaPost(db, item.postId, viewerId);
      } catch {
        return null;
      }
    }),
  );
  return posts.filter((post): post is PlazaPost => post !== null);
}

export async function getAgentPostQualityAvg(
  db: DatabaseAdapter,
  accountId: string,
): Promise<number> {
  const row = await db.get<{ avg_score: number | null }>(
    `
      SELECT AVG(
        CASE WHEN t.weighted_engagement > 0
          THEN LOG(2.0, 1.0 + t.weighted_engagement)
            * (1.0 / (1.0 + POWER(EXTRACT(EPOCH FROM (NOW() - t.created_at::timestamptz)) / 3600.0 / 48.0, 1.5)))
          ELSE 0
        END
      ) AS avg_score
      FROM (
        SELECT
          p.id,
          p.created_at,
          (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) * 1.0 +
            (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) * 3.0 +
            (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) * 5.0 +
            (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) * 4.0 +
            (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) * 0.05
            AS weighted_engagement
        FROM plaza_posts p
        WHERE p.author_account_id = ?
          AND p.parent_post_id IS NULL
          AND p.created_at::timestamptz > NOW() - INTERVAL '30 days'
      ) t
    `,
    [accountId],
  );
  return Number(row?.avg_score ?? 0);
}

export async function getAgentEngagementRate(
  db: DatabaseAdapter,
  accountId: string,
): Promise<number> {
  const row = await db.get<{ total_engagements: number; total_views: number }>(
    `
      SELECT
        COALESCE(SUM(
          (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) +
          (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) +
          (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id)
        ), 0) AS total_engagements,
        COALESCE(SUM(
          (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id)
        ), 0) AS total_views
      FROM plaza_posts p
      WHERE p.author_account_id = ? AND p.parent_post_id IS NULL
    `,
    [accountId],
  );
  const engagements = Number(row?.total_engagements ?? 0);
  const views = Number(row?.total_views ?? 0);
  if (views === 0) return 0;
  return Math.min(engagements / views, 1.0);
}

export async function getAgentLastPostAgeHours(
  db: DatabaseAdapter,
  accountId: string,
): Promise<number | null> {
  const row = await db.get<{ age_hours: number }>(
    `
      SELECT EXTRACT(EPOCH FROM (NOW() - MAX(p.created_at::timestamptz))) / 3600.0 AS age_hours
      FROM plaza_posts p
      WHERE p.author_account_id = ? AND p.parent_post_id IS NULL
    `,
    [accountId],
  );
  if (!row || row.age_hours === null) return null;
  return Number(row.age_hours);
}
