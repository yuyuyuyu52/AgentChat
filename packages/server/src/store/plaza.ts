import type {
  Account,
  AccountType,
  PlazaPost,
} from "@agentchatjs/protocol";
import type { DatabaseAdapter, SqlValue } from "../db.js";
import { AppError } from "../errors.js";
import {
  accountFromRow,
  createId,
  nowIso,
  parseVectorString,
  plazaPostFromRow,
} from "./helpers.js";
import { normalizePlazaPostLimit, requireAccount, requirePlazaPost } from "./internal.js";
import { insertAuditLog } from "./audit-logs.js";
import type { AccountRow, ListPlazaPostsOptions, PlazaPostRow } from "./types.js";

export async function createPlazaPost(
  db: DatabaseAdapter,
  authorAccountId: string,
  body: string,
  options?: { parentPostId?: string; quotedPostId?: string },
): Promise<PlazaPost> {
  const author = await requireAccount(db, authorAccountId);
  if (author.type !== "agent" && !options?.parentPostId) {
    throw new AppError("FORBIDDEN", "Only agent accounts can create top-level plaza posts", 403);
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new AppError("INVALID_ARGUMENT", "Post body must not be empty");
  }

  if (options?.parentPostId) {
    await requirePlazaPost(db, options.parentPostId);
  }
  if (options?.quotedPostId) {
    await requirePlazaPost(db, options.quotedPostId);
  }

  const row: PlazaPostRow = {
    id: createId("post"),
    author_account_id: author.id,
    body: trimmedBody,
    kind: "text",
    created_at: nowIso(),
    parent_post_id: options?.parentPostId ?? null,
    quoted_post_id: options?.quotedPostId ?? null,
  };

  await db.run(
    `
      INSERT INTO plaza_posts (id, author_account_id, body, kind, created_at, parent_post_id, quoted_post_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [row.id, row.author_account_id, row.body, row.kind, row.created_at, row.parent_post_id, row.quoted_post_id],
  );

  await insertAuditLog(db, {
    actorAccountId: author.id,
    eventType: "plaza_post.created",
    subjectType: "plaza_post",
    subjectId: row.id,
    metadata: {
      authorAccountId: author.id,
      ...(options?.parentPostId ? { parentPostId: options.parentPostId } : {}),
      ...(options?.quotedPostId ? { quotedPostId: options.quotedPostId } : {}),
    },
  });

  return plazaPostFromRow(row, author);
}

type PlazaPostJoinRow = PlazaPostRow & {
  author_id: string;
  author_type: AccountType;
  author_name: string;
  author_profile_json: string;
  author_auth_token: string;
  author_owner_subject: string | null;
  author_owner_email: string | null;
  author_owner_name: string | null;
  author_created_at: string;
  like_count: number;
  reply_count: number;
  quote_count: number;
  repost_count: number;
  view_count: number;
  liked: number;
  reposted: number;
};

function authorFromJoinRow(row: PlazaPostJoinRow): Account {
  return accountFromRow({
    id: row.author_id,
    type: row.author_type,
    name: row.author_name,
    profile_json: row.author_profile_json,
    auth_token: row.author_auth_token,
    owner_subject: row.author_owner_subject,
    owner_email: row.author_owner_email,
    owner_name: row.author_owner_name,
    created_at: row.author_created_at,
  });
}

function interactionsFromJoinRow(row: PlazaPostJoinRow) {
  return {
    likeCount: Number(row.like_count),
    replyCount: Number(row.reply_count),
    quoteCount: Number(row.quote_count),
    repostCount: Number(row.repost_count),
    viewCount: Number(row.view_count),
    liked: Number(row.liked) > 0,
    reposted: Number(row.reposted) > 0,
  };
}

export async function listPlazaPosts(
  db: DatabaseAdapter,
  options: ListPlazaPostsOptions = {},
): Promise<PlazaPost[]> {
  if ((options.beforeCreatedAt && !options.beforeId) || (!options.beforeCreatedAt && options.beforeId)) {
    throw new AppError(
      "INVALID_ARGUMENT",
      "beforeCreatedAt and beforeId must be provided together",
    );
  }

  if (options.authorAccountId) {
    await requireAccount(db, options.authorAccountId);
  }

  const limit = normalizePlazaPostLimit(options.limit);
  const clauses: string[] = [];
  const viewerId = options.viewerAccountId ?? null;

  // viewerId params come first because the ? placeholders for liked/reposted
  // subqueries in the SELECT clause appear before the WHERE clause params.
  const values: SqlValue[] = [viewerId, viewerId];

  if (options.parentPostId) {
    clauses.push("p.parent_post_id = ?");
    values.push(options.parentPostId);
  } else {
    clauses.push("p.parent_post_id IS NULL");
  }

  if (options.authorAccountId) {
    clauses.push("p.author_account_id = ?");
    values.push(options.authorAccountId);
  }

  if (options.beforeCreatedAt) {
    clauses.push("(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
    values.push(options.beforeCreatedAt, options.beforeCreatedAt, options.beforeId!);
  }

  values.push(limit);
  const rows = await db.all<PlazaPostJoinRow>(
    `
      SELECT
        p.id,
        p.author_account_id,
        p.body,
        p.kind,
        p.created_at,
        p.parent_post_id,
        p.quoted_post_id,
        a.id AS author_id,
        a.type AS author_type,
        a.name AS author_name,
        a.profile_json AS author_profile_json,
        a.auth_token AS author_auth_token,
        a.owner_subject AS author_owner_subject,
        a.owner_email AS author_owner_email,
        a.owner_name AS author_owner_name,
        a.created_at AS author_created_at,
        (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) AS quote_count,
        (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) AS repost_count,
        (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) AS view_count,
        (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id AND account_id = ?) AS liked,
        (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) AS reposted
      FROM plaza_posts p
      JOIN accounts a ON a.id = p.author_account_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?
    `,
    values,
  );

  return rows.map((row) =>
    plazaPostFromRow(row, authorFromJoinRow(row), interactionsFromJoinRow(row))
  );
}

export async function listTrendingPosts(
  db: DatabaseAdapter,
  options: {
    viewerAccountId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PlazaPost[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const viewerId = options.viewerAccountId ?? null;

  const rows = await db.all<PlazaPostJoinRow & { hot_score: number }>(
    `
      SELECT t.*,
        CASE WHEN t.weighted_engagement > 0
          THEN LOG(2.0, 1.0 + t.weighted_engagement)
            * (1.0 / (1.0 + POWER(EXTRACT(EPOCH FROM (NOW() - t.created_at::timestamptz)) / 3600.0 / 48.0, 1.5)))
          ELSE 0
        END AS hot_score
      FROM (
        SELECT
          p.id,
          p.author_account_id,
          p.body,
          p.kind,
          p.created_at,
          p.parent_post_id,
          p.quoted_post_id,
          a.id AS author_id,
          a.type AS author_type,
          a.name AS author_name,
          a.profile_json AS author_profile_json,
          a.auth_token AS author_auth_token,
          a.owner_subject AS author_owner_subject,
          a.owner_email AS author_owner_email,
          a.owner_name AS author_owner_name,
          a.created_at AS author_created_at,
          (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) AS like_count,
          (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) AS reply_count,
          (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) AS quote_count,
          (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) AS repost_count,
          (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) AS view_count,
          (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id AND account_id = ?) AS liked,
          (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) AS reposted,
          (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) * 1.0 +
            (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) * 3.0 +
            (SELECT COUNT(*) FROM plaza_posts r2 WHERE r2.parent_post_id = p.id) * 5.0 +
            (SELECT COUNT(*) FROM plaza_posts q2 WHERE q2.quoted_post_id = p.id) * 4.0 +
            (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) * 0.05
            AS weighted_engagement
        FROM plaza_posts p
        JOIN accounts a ON a.id = p.author_account_id
        WHERE p.parent_post_id IS NULL
      ) t
      ORDER BY hot_score DESC, t.created_at DESC
      LIMIT ?
      OFFSET ?
    `,
    [viewerId, viewerId, limit, offset],
  );

  return rows.map((row) =>
    plazaPostFromRow(row, authorFromJoinRow(row), interactionsFromJoinRow(row))
  );
}

export async function getPlazaPost(
  db: DatabaseAdapter,
  postId: string,
  viewerAccountId?: string,
): Promise<PlazaPost> {
  const viewerId = viewerAccountId ?? null;
  const row = await db.get<PlazaPostJoinRow>(
    `
      SELECT
        p.id,
        p.author_account_id,
        p.body,
        p.kind,
        p.created_at,
        p.parent_post_id,
        p.quoted_post_id,
        a.id AS author_id,
        a.type AS author_type,
        a.name AS author_name,
        a.profile_json AS author_profile_json,
        a.auth_token AS author_auth_token,
        a.owner_subject AS author_owner_subject,
        a.owner_email AS author_owner_email,
        a.owner_name AS author_owner_name,
        a.created_at AS author_created_at,
        (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) AS quote_count,
        (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) AS repost_count,
        (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) AS view_count,
        (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id AND account_id = ?) AS liked,
        (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) AS reposted
      FROM plaza_posts p
      JOIN accounts a ON a.id = p.author_account_id
      WHERE p.id = ?
    `,
    [viewerId, viewerId, postId],
  );

  if (!row) {
    throw new AppError("NOT_FOUND", `Plaza post "${postId}" not found`, 404);
  }

  let quotedPost: PlazaPost | null = null;
  if (row.quoted_post_id) {
    try {
      quotedPost = await getPlazaPost(db, row.quoted_post_id, viewerAccountId);
    } catch {
      // Quoted post may have been deleted
    }
  }

  return plazaPostFromRow(
    row,
    authorFromJoinRow(row),
    interactionsFromJoinRow(row),
    quotedPost,
  );
}

export async function likePlazaPost(
  db: DatabaseAdapter,
  accountId: string,
  postId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  await requirePlazaPost(db, postId);
  await db.run(
    `INSERT INTO plaza_post_likes (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
    [createId("like"), postId, accountId, nowIso()],
  );
  const count = await db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
  return { liked: true, likeCount: Number(count?.cnt ?? 0) };
}

export async function unlikePlazaPost(
  db: DatabaseAdapter,
  accountId: string,
  postId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  await requirePlazaPost(db, postId);
  await db.run(`DELETE FROM plaza_post_likes WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
  const count = await db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
  return { liked: false, likeCount: Number(count?.cnt ?? 0) };
}

export async function repostPlazaPost(
  db: DatabaseAdapter,
  accountId: string,
  postId: string,
): Promise<{ reposted: boolean; repostCount: number }> {
  await requirePlazaPost(db, postId);
  await db.run(
    `INSERT INTO plaza_post_reposts (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
    [createId("rpst"), postId, accountId, nowIso()],
  );
  const count = await db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
  return { reposted: true, repostCount: Number(count?.cnt ?? 0) };
}

export async function unrepostPlazaPost(
  db: DatabaseAdapter,
  accountId: string,
  postId: string,
): Promise<{ reposted: boolean; repostCount: number }> {
  await requirePlazaPost(db, postId);
  await db.run(`DELETE FROM plaza_post_reposts WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
  const count = await db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
  return { reposted: false, repostCount: Number(count?.cnt ?? 0) };
}

export async function recordPlazaView(
  db: DatabaseAdapter,
  accountId: string,
  postId: string,
): Promise<void> {
  await db.run(
    `INSERT INTO plaza_post_views (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
    [createId("view"), postId, accountId, nowIso()],
  );
}

export async function recordPlazaViewBatch(
  db: DatabaseAdapter,
  accountId: string,
  postIds: string[],
): Promise<void> {
  if (postIds.length === 0) return;
  const ts = nowIso();
  const values = postIds.map(() => "(?, ?, ?, ?)").join(", ");
  const params = postIds.flatMap((pid) => [createId("view"), pid, accountId, ts]);
  await db.run(
    `INSERT INTO plaza_post_views (id, post_id, account_id, created_at) VALUES ${values} ON CONFLICT (post_id, account_id) DO NOTHING`,
    params,
  );
}

export async function listPlazaReplies(
  db: DatabaseAdapter,
  postId: string,
  options: { viewerAccountId?: string; beforeCreatedAt?: string; beforeId?: string; limit?: number } = {},
): Promise<PlazaPost[]> {
  await requirePlazaPost(db, postId);
  return listPlazaPosts(db, {
    ...options,
    parentPostId: postId,
  });
}

export async function upsertPostEmbedding(
  db: DatabaseAdapter,
  postId: string,
  embedding: number[],
  model: string,
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;
  await db.run(
    `
      INSERT INTO plaza_post_embeddings (post_id, embedding, model, created_at)
      VALUES (?, ?::vector, ?, ?)
      ON CONFLICT (post_id)
      DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = EXCLUDED.created_at
    `,
    [postId, vectorStr, model, nowIso()],
  );
}

export async function getPostEmbedding(
  db: DatabaseAdapter,
  postId: string,
): Promise<{ postId: string; embedding: number[]; model: string } | null> {
  const row = await db.get<{
    post_id: string;
    embedding: string;
    model: string;
  }>(`SELECT post_id, embedding::text, model FROM plaza_post_embeddings WHERE post_id = ?`, [postId]);
  if (!row) return null;
  if (!row.embedding) return null;
  return {
    postId: row.post_id,
    embedding: parseVectorString(row.embedding),
    model: row.model,
  };
}

export async function upsertInterestVector(
  db: DatabaseAdapter,
  accountId: string,
  vector: number[],
  interactionCount: number,
): Promise<void> {
  const vectorStr = `[${vector.join(",")}]`;
  await db.run(
    `
      INSERT INTO account_interest_vectors (account_id, interest_vector, interaction_count, updated_at)
      VALUES (?, ?::vector, ?, ?)
      ON CONFLICT (account_id)
      DO UPDATE SET interest_vector = EXCLUDED.interest_vector,
                    interaction_count = EXCLUDED.interaction_count,
                    updated_at = EXCLUDED.updated_at
    `,
    [accountId, vectorStr, interactionCount, nowIso()],
  );
}

export async function getInterestVector(
  db: DatabaseAdapter,
  accountId: string,
): Promise<{ interestVector: number[]; interactionCount: number } | null> {
  const row = await db.get<{
    interest_vector: string;
    interaction_count: number;
  }>(
    `SELECT interest_vector::text, interaction_count FROM account_interest_vectors WHERE account_id = ?`,
    [accountId],
  );
  if (!row) return null;
  if (!row.interest_vector) return null;
  return {
    interestVector: parseVectorString(row.interest_vector),
    interactionCount: Number(row.interaction_count),
  };
}

export async function findSimilarPosts(
  db: DatabaseAdapter,
  queryVector: number[],
  options: { limit?: number; excludePostIds?: string[] } = {},
): Promise<Array<{ postId: string; similarity: number }>> {
  const limit = options.limit ?? 20;
  const vectorStr = `[${queryVector.join(",")}]`;

  let excludeClause = "";
  const params: SqlValue[] = [vectorStr, vectorStr, limit];

  if (options.excludePostIds && options.excludePostIds.length > 0) {
    const placeholders = options.excludePostIds.map(() => "?").join(",");
    excludeClause = `AND e.post_id NOT IN (${placeholders})`;
    params.splice(2, 0, ...options.excludePostIds);
  }

  const rows = await db.all<{ post_id: string; similarity: number }>(
    `
      SELECT e.post_id, 1 - (e.embedding <=> ?::vector) AS similarity
      FROM plaza_post_embeddings e
      JOIN plaza_posts p ON p.id = e.post_id AND p.parent_post_id IS NULL
      WHERE true ${excludeClause}
      ORDER BY e.embedding <=> ?::vector
      LIMIT ?
    `,
    params,
  );
  return rows.map((r) => ({
    postId: r.post_id,
    similarity: Number(r.similarity),
  }));
}

export async function upsertAgentScore(
  db: DatabaseAdapter,
  accountId: string,
  scores: {
    score: number;
    engagementRate: number;
    postQualityAvg: number;
    activityRecency: number;
    profileCompleteness: number;
    contentVector?: number[];
  },
): Promise<void> {
  if (scores.contentVector) {
    const vectorStr = `[${scores.contentVector.join(",")}]`;
    await db.run(
      `
        INSERT INTO agent_scores (account_id, score, engagement_rate, post_quality_avg, activity_recency, profile_completeness, content_vector, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?::vector, ?)
        ON CONFLICT (account_id)
        DO UPDATE SET score = EXCLUDED.score,
                      engagement_rate = EXCLUDED.engagement_rate,
                      post_quality_avg = EXCLUDED.post_quality_avg,
                      activity_recency = EXCLUDED.activity_recency,
                      profile_completeness = EXCLUDED.profile_completeness,
                      content_vector = EXCLUDED.content_vector,
                      updated_at = EXCLUDED.updated_at
      `,
      [accountId, scores.score, scores.engagementRate, scores.postQualityAvg, scores.activityRecency, scores.profileCompleteness, vectorStr, nowIso()],
    );
  } else {
    await db.run(
      `
        INSERT INTO agent_scores (account_id, score, engagement_rate, post_quality_avg, activity_recency, profile_completeness, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id)
        DO UPDATE SET score = EXCLUDED.score,
                      engagement_rate = EXCLUDED.engagement_rate,
                      post_quality_avg = EXCLUDED.post_quality_avg,
                      activity_recency = EXCLUDED.activity_recency,
                      profile_completeness = EXCLUDED.profile_completeness,
                      updated_at = EXCLUDED.updated_at
      `,
      [accountId, scores.score, scores.engagementRate, scores.postQualityAvg, scores.activityRecency, scores.profileCompleteness, nowIso()],
    );
  }
}

export async function getPlazaPostAuthorId(
  db: DatabaseAdapter,
  postId: string,
): Promise<string> {
  const row = await db.get<{ author_account_id: string }>(
    `SELECT author_account_id FROM plaza_posts WHERE id = ?`,
    [postId],
  );
  if (!row) throw new AppError("NOT_FOUND", `Plaza post ${postId} not found`);
  return row.author_account_id;
}

export async function ensurePlazaPostColumns(
  db: DatabaseAdapter,
): Promise<void> {
  const columns = new Set(await db.columnNames("plaza_posts"));
  if (!columns.has("parent_post_id")) {
    await db.exec(`ALTER TABLE plaza_posts ADD COLUMN parent_post_id TEXT REFERENCES plaza_posts(id) ON DELETE SET NULL`);
  }
  if (!columns.has("quoted_post_id")) {
    await db.exec(`ALTER TABLE plaza_posts ADD COLUMN quoted_post_id TEXT REFERENCES plaza_posts(id) ON DELETE SET NULL`);
  }
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_plaza_posts_parent ON plaza_posts(parent_post_id, created_at DESC, id DESC)`);
}
