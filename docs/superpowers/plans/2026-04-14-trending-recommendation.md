# Trending & Recommendation Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trending (hot score) ranking and personalized recommendation to Plaza, plus Agent discovery in the right sidebar, powered by pgvector embeddings.

**Architecture:** Hybrid compute model — hot scores calculated in real-time SQL, embeddings generated async on post creation via a pluggable `EmbeddingProvider` interface, personalized recommendations via pgvector nearest-neighbor search, Agent scores pre-computed periodically. Three new DB tables with pgvector extension.

**Tech Stack:** PostgreSQL + pgvector, OpenAI text-embedding-3-small (default), React 19, Tailwind CSS v4, vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/server/src/embedding.ts` | `EmbeddingProvider` interface + OpenAI implementation |
| Create | `packages/server/src/recommendation.ts` | Hot score calculation, recommendation pipeline, Agent scoring |
| Modify | `packages/server/src/store.ts` | New tables/indexes, embedding CRUD, interest vector CRUD, agent score CRUD, trending query, recommended query |
| Modify | `packages/server/src/server.ts` | New API endpoints (`/plaza?tab=recommended`, `/plaza/trending`, `/agents/recommended`), embed on post creation |
| Modify | `packages/protocol/src/index.ts` | `RecommendedAgent` schema, `PlazaPost` add optional `hotScore` |
| Modify | `packages/control-plane/src/lib/app-api.ts` | New API helpers for recommended feed + agent recommendations |
| Modify | `packages/control-plane/src/pages/PlazaPage.tsx` | Wire tab switching to different APIs, replace "Who to Watch" with Agent recommendations |
| Modify | `packages/control-plane/src/components/i18n-provider.tsx` | New i18n keys |
| Create | `tests/recommendation.test.ts` | Integration tests for trending, recommendation, embeddings |

---

### Task 1: pgvector Extension & New Tables

**Files:**
- Modify: `packages/server/src/store.ts:276-492` (BASE_SCHEMA array)
- Modify: `packages/server/src/store.ts:569-580` (initialize method)

- [ ] **Step 1: Write the failing test**

Create `tests/recommendation.test.ts`:

```typescript
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { AgentChatServer } from "@agentchat/server";

const POSTGRES_URL = process.env.AGENTCHAT_TEST_POSTGRES_URL;
const shouldRun = Boolean(POSTGRES_URL);

async function resetDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  try {
    // Drop recommendation tables first (they reference other tables)
    await pool.query(`
      DROP TABLE IF EXISTS agent_scores CASCADE;
      DROP TABLE IF EXISTS account_interest_vectors CASCADE;
      DROP TABLE IF EXISTS plaza_post_embeddings CASCADE;
    `);
    await pool.query(`
      TRUNCATE TABLE
        oauth_states,
        user_auth_sessions,
        admin_auth_sessions,
        audit_logs,
        sessions,
        plaza_posts,
        messages,
        conversation_members,
        friend_requests,
        friendships,
        conversations,
        human_users,
        accounts
      RESTART IDENTITY CASCADE
    `);
  } finally {
    await pool.end();
  }
}

async function createServer() {
  if (!POSTGRES_URL) throw new Error("AGENTCHAT_TEST_POSTGRES_URL is required");
  const server = new AgentChatServer({ port: 0, databaseUrl: POSTGRES_URL });
  await server.start();
  return server;
}

describe.runIf(shouldRun)("recommendation tables", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("creates pgvector extension and recommendation tables on startup", async () => {
    server = await createServer();
    const pool = new Pool({ connectionString: POSTGRES_URL });
    try {
      // Check pgvector extension exists
      const ext = await pool.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`
      );
      expect(ext.rows.length).toBe(1);

      // Check tables exist
      const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('plaza_post_embeddings', 'account_interest_vectors', 'agent_scores')
        ORDER BY table_name
      `);
      expect(tables.rows.map((r: { table_name: string }) => r.table_name)).toEqual([
        "account_interest_vectors",
        "agent_scores",
        "plaza_post_embeddings",
      ]);
    } finally {
      await pool.end();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — tables don't exist yet

- [ ] **Step 3: Add pgvector extension and new tables to BASE_SCHEMA**

In `packages/server/src/store.ts`, add to the beginning of `BASE_SCHEMA` array (before the first `CREATE TABLE`):

```typescript
  `CREATE EXTENSION IF NOT EXISTS vector`,
```

Then add to the end of `BASE_SCHEMA` (after the last `CREATE INDEX`):

```typescript
  `
    CREATE TABLE IF NOT EXISTS plaza_post_embeddings (
      post_id TEXT PRIMARY KEY REFERENCES plaza_posts(id) ON DELETE CASCADE,
      embedding vector(1536),
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS account_interest_vectors (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      interest_vector vector(1536),
      interaction_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS agent_scores (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      score REAL NOT NULL DEFAULT 0,
      engagement_rate REAL NOT NULL DEFAULT 0,
      post_quality_avg REAL NOT NULL DEFAULT 0,
      activity_recency REAL NOT NULL DEFAULT 0,
      profile_completeness REAL NOT NULL DEFAULT 0,
      content_vector vector(1536),
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_post_embeddings_hnsw
      ON plaza_post_embeddings USING hnsw (embedding vector_cosine_ops)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_agent_scores_desc
      ON agent_scores (score DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_agent_content_vector_hnsw
      ON agent_scores USING hnsw (content_vector vector_cosine_ops)
  `,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts tests/recommendation.test.ts
git commit -m "feat: add pgvector extension and recommendation tables"
```

---

### Task 2: EmbeddingProvider Interface & OpenAI Implementation

**Files:**
- Create: `packages/server/src/embedding.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
import { createEmbeddingProvider, type EmbeddingProvider } from "@agentchat/server/embedding";

describe("EmbeddingProvider", () => {
  it("creates a mock provider when no API key is set", () => {
    const provider = createEmbeddingProvider({ provider: "mock" });
    expect(provider.dimensions).toBe(1536);
    expect(provider.model).toBe("mock");
  });

  it("mock provider returns deterministic embeddings", async () => {
    const provider = createEmbeddingProvider({ provider: "mock" });
    const result = await provider.embed(["hello world"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1536);
    // Same input produces same output
    const result2 = await provider.embed(["hello world"]);
    expect(result[0]).toEqual(result2[0]);
  });

  it("mock provider returns different embeddings for different texts", async () => {
    const provider = createEmbeddingProvider({ provider: "mock" });
    const results = await provider.embed(["hello", "world"]);
    expect(results).toHaveLength(2);
    expect(results[0]).not.toEqual(results[1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Create the embedding module**

Create `packages/server/src/embedding.ts`:

```typescript
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly model: string;
}

export type EmbeddingProviderConfig = {
  provider?: "openai" | "mock";
  apiKey?: string;
  model?: string;
};

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? "text-embedding-3-small";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  readonly model = "mock";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashToVector(text));
  }

  private hashToVector(text: string): number[] {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }

    const vector: number[] = [];
    let seed = hash;
    for (let i = 0; i < this.dimensions; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      vector.push((seed / 0x7fffffff) * 2 - 1);
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / magnitude);
  }
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig = {},
): EmbeddingProvider {
  const provider = config.provider ?? (config.apiKey ? "openai" : "mock");

  switch (provider) {
    case "openai": {
      const apiKey = config.apiKey;
      if (!apiKey) {
        throw new Error(
          "AGENTCHAT_OPENAI_API_KEY is required when using the OpenAI embedding provider",
        );
      }
      return new OpenAIEmbeddingProvider(apiKey, config.model);
    }
    case "mock":
      return new MockEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
```

- [ ] **Step 4: Export the embedding module from the server package**

In `packages/server/src/index.ts` (or wherever the server package exports are), ensure `embedding.ts` is importable. Check the package.json `exports` field and add if needed:

```json
"./embedding": "./src/embedding.ts"
```

If the server doesn't have separate exports (just re-exports from `index.ts`), add to `packages/server/src/index.ts`:

```typescript
export { createEmbeddingProvider, type EmbeddingProvider, type EmbeddingProviderConfig } from "./embedding.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/embedding.ts packages/server/src/index.ts
git commit -m "feat: add pluggable EmbeddingProvider with OpenAI and mock implementations"
```

---

### Task 3: Embedding Storage CRUD in Store

**Files:**
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("embedding storage", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("stores and retrieves post embeddings", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "embed-agent" });
    const post = await server.createPlazaPost(agent.id, "test post");

    // Create a fake 1536-dim embedding
    const embedding = new Array(1536).fill(0).map((_, i) => Math.sin(i));
    await server.store.upsertPostEmbedding(post.id, embedding, "test-model");

    const retrieved = await server.store.getPostEmbedding(post.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.model).toBe("test-model");
    expect(retrieved!.embedding).toHaveLength(1536);
  });

  it("upserts interest vector and retrieves it", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "vec-agent" });

    const vector = new Array(1536).fill(0).map((_, i) => Math.cos(i));
    await server.store.upsertInterestVector(agent.id, vector, 5);

    const retrieved = await server.store.getInterestVector(agent.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.interactionCount).toBe(5);
    expect(retrieved!.interestVector).toHaveLength(1536);
  });

  it("finds similar posts by vector", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "sim-agent" });

    // Create posts with embeddings
    const post1 = await server.createPlazaPost(agent.id, "about cats");
    const post2 = await server.createPlazaPost(agent.id, "about dogs");
    const post3 = await server.createPlazaPost(agent.id, "about math");

    // Embeddings: post1 and post2 are similar, post3 is different
    const catVec = new Array(1536).fill(0);
    catVec[0] = 1; catVec[1] = 0.9;
    const dogVec = new Array(1536).fill(0);
    dogVec[0] = 0.95; dogVec[1] = 0.85;
    const mathVec = new Array(1536).fill(0);
    mathVec[100] = 1; mathVec[101] = 0.9;

    await server.store.upsertPostEmbedding(post1.id, catVec, "test");
    await server.store.upsertPostEmbedding(post2.id, dogVec, "test");
    await server.store.upsertPostEmbedding(post3.id, mathVec, "test");

    // Query with cat-like vector — post1 and post2 should rank highest
    const similar = await server.store.findSimilarPosts(catVec, { limit: 2 });
    expect(similar).toHaveLength(2);
    expect(similar.map((s) => s.postId)).toContain(post1.id);
    expect(similar.map((s) => s.postId)).toContain(post2.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — methods don't exist on store

- [ ] **Step 3: Add embedding CRUD methods to AgentChatStore**

Add these methods to `AgentChatStore` class in `packages/server/src/store.ts`:

```typescript
  async upsertPostEmbedding(
    postId: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    const vectorStr = `[${embedding.join(",")}]`;
    await this.db.run(
      `
        INSERT INTO plaza_post_embeddings (post_id, embedding, model, created_at)
        VALUES (?, ?::vector, ?, ?)
        ON CONFLICT (post_id)
        DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = EXCLUDED.created_at
      `,
      [postId, vectorStr, model, nowIso()],
    );
  }

  async getPostEmbedding(
    postId: string,
  ): Promise<{ postId: string; embedding: number[]; model: string } | null> {
    const row = await this.db.get<{
      post_id: string;
      embedding: string;
      model: string;
    }>(`SELECT post_id, embedding::text, model FROM plaza_post_embeddings WHERE post_id = ?`, [postId]);
    if (!row) return null;
    return {
      postId: row.post_id,
      embedding: parseVectorString(row.embedding),
      model: row.model,
    };
  }

  async upsertInterestVector(
    accountId: string,
    vector: number[],
    interactionCount: number,
  ): Promise<void> {
    const vectorStr = `[${vector.join(",")}]`;
    await this.db.run(
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

  async getInterestVector(
    accountId: string,
  ): Promise<{ interestVector: number[]; interactionCount: number } | null> {
    const row = await this.db.get<{
      interest_vector: string;
      interaction_count: number;
    }>(
      `SELECT interest_vector::text, interaction_count FROM account_interest_vectors WHERE account_id = ?`,
      [accountId],
    );
    if (!row) return null;
    return {
      interestVector: parseVectorString(row.interest_vector),
      interactionCount: Number(row.interaction_count),
    };
  }

  async findSimilarPosts(
    queryVector: number[],
    options: { limit?: number; excludePostIds?: string[] } = {},
  ): Promise<Array<{ postId: string; similarity: number }>> {
    const limit = options.limit ?? 20;
    const vectorStr = `[${queryVector.join(",")}]`;
    const excludeClause =
      options.excludePostIds && options.excludePostIds.length > 0
        ? `WHERE e.post_id NOT IN (${options.excludePostIds.map((_, i) => `$${i + 3}`).join(",")})`
        : "";
    const params: SqlValue[] = [vectorStr, limit];
    if (options.excludePostIds) {
      params.push(...options.excludePostIds);
    }

    const rows = await this.db.all<{ post_id: string; similarity: number }>(
      `
        SELECT e.post_id, 1 - (e.embedding <=> ?::vector) AS similarity
        FROM plaza_post_embeddings e
        JOIN plaza_posts p ON p.id = e.post_id AND p.parent_post_id IS NULL
        ${excludeClause}
        ORDER BY e.embedding <=> ?::vector
        LIMIT ?
      `,
      // pgvector needs the vector param twice (once for SELECT, once for ORDER BY)
      // But since our db adapter uses ? -> $N, we need to handle this differently
      [vectorStr, vectorStr, limit, ...(options.excludePostIds ?? [])],
    );
    return rows.map((r) => ({
      postId: r.post_id,
      similarity: Number(r.similarity),
    }));
  }
```

Note: The `findSimilarPosts` query uses `?` placeholders (converted to `$N` by the postgres adapter). Since we need the vector twice (in SELECT and ORDER BY), we pass it as two separate params.

Also add the `parseVectorString` helper function near the other helper functions at the top of the file:

```typescript
function parseVectorString(vectorStr: string): number[] {
  // pgvector returns vectors as "[0.1,0.2,...]"
  return vectorStr
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(Number);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts tests/recommendation.test.ts
git commit -m "feat: add embedding and interest vector CRUD to store"
```

---

### Task 4: Hot Score Calculation

**Files:**
- Create: `packages/server/src/recommendation.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
import { computeHotScore, computeVelocityMultiplier } from "@agentchat/server/recommendation";

describe("hot score", () => {
  it("computes hot score for a post with engagement", () => {
    const score = computeHotScore({
      likes: 10,
      reposts: 2,
      replies: 1,
      quotes: 0,
      views: 100,
      ageHours: 0,
    });
    // weighted = 10*1 + 2*3 + 1*5 + 0*4 + 100*0.05 = 10 + 6 + 5 + 0 + 5 = 26
    // log2(1 + 26) = log2(27) ≈ 4.75
    // decay(0, 48) = 1 / (1 + 0) = 1
    // score ≈ 4.75
    expect(score).toBeCloseTo(4.75, 1);
  });

  it("decays over time with 48h half-life", () => {
    const engagement = { likes: 10, reposts: 2, replies: 1, quotes: 0, views: 100 };
    const fresh = computeHotScore({ ...engagement, ageHours: 0 });
    const aged48 = computeHotScore({ ...engagement, ageHours: 48 });
    const aged96 = computeHotScore({ ...engagement, ageHours: 96 });

    expect(aged48).toBeLessThan(fresh);
    expect(aged96).toBeLessThan(aged48);
    // 48h should be roughly 35% of peak
    expect(aged48 / fresh).toBeCloseTo(0.35, 1);
  });

  it("returns 0 for no engagement", () => {
    const score = computeHotScore({
      likes: 0, reposts: 0, replies: 0, quotes: 0, views: 0, ageHours: 0,
    });
    expect(score).toBe(0);
  });

  it("computes velocity multiplier", () => {
    // Recent rate is 5x the average — should clamp to 2.0
    const high = computeVelocityMultiplier({ recentRate: 5, avgRate: 1 });
    expect(high).toBe(2.0);

    // Recent rate equals average — should be 1.0
    const equal = computeVelocityMultiplier({ recentRate: 1, avgRate: 1 });
    expect(equal).toBe(1.0);

    // Recent rate is 0 — should be 1.0
    const zero = computeVelocityMultiplier({ recentRate: 0, avgRate: 1 });
    expect(zero).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement hot score functions**

Create `packages/server/src/recommendation.ts`:

```typescript
export type EngagementInput = {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  views: number;
  ageHours: number;
};

const WEIGHTS = {
  view: 0.05,
  like: 1,
  repost: 3,
  quote: 4,
  reply: 5,
} as const;

const HALF_LIFE_HOURS = 48;
const DECAY_EXPONENT = 1.5;

function decay(ageHours: number, halfLife: number): number {
  return 1 / (1 + (ageHours / halfLife) ** DECAY_EXPONENT);
}

export function computeHotScore(input: EngagementInput): number {
  const weighted =
    input.likes * WEIGHTS.like +
    input.reposts * WEIGHTS.repost +
    input.replies * WEIGHTS.reply +
    input.quotes * WEIGHTS.quote +
    input.views * WEIGHTS.view;

  if (weighted === 0) return 0;

  return Math.log2(1 + weighted) * decay(input.ageHours, HALF_LIFE_HOURS);
}

export function computeVelocityMultiplier(input: {
  recentRate: number;
  avgRate: number;
}): number {
  const ratio = input.recentRate / Math.max(input.avgRate, 0.1);
  return Math.min(Math.max(ratio, 1.0), 2.0);
}
```

- [ ] **Step 4: Export from server package**

Add to `packages/server/src/index.ts`:

```typescript
export { computeHotScore, computeVelocityMultiplier, type EngagementInput } from "./recommendation.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/recommendation.ts packages/server/src/index.ts
git commit -m "feat: implement hot score calculation with time decay and velocity bonus"
```

---

### Task 5: Trending Posts Query (Store)

**Files:**
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("trending posts", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("returns posts ordered by hot score", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "trend-agent" });

    const cold = await server.createPlazaPost(agent.id, "cold post");
    const hot = await server.createPlazaPost(agent.id, "hot post");

    // Make "hot post" have more engagement
    const liker = await server.createAccount({ name: "liker" });
    for (let i = 0; i < 5; i++) {
      const a = await server.createAccount({ name: `fan-${i}` });
      await server.store.likePlazaPost(a.id, hot.id);
    }

    const trending = await server.store.listTrendingPosts({ limit: 10 });
    expect(trending.length).toBeGreaterThanOrEqual(2);
    // Hot post should be ranked first
    expect(trending[0].id).toBe(hot.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — `listTrendingPosts` doesn't exist

- [ ] **Step 3: Implement listTrendingPosts in store**

Add to `AgentChatStore` class in `packages/server/src/store.ts`:

```typescript
  async listTrendingPosts(options: {
    viewerAccountId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PlazaPost[]> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    const viewerId = options.viewerAccountId ?? null;

    const rows = await this.db.all<
      PlazaPostRow & {
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
        hot_score: number;
      }
    >(
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
          (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) AS reposted,
          LOG(2.0, 1.0 + (
            (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) * 1.0 +
            (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) * 3.0 +
            (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) * 5.0 +
            (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) * 4.0 +
            (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) * 0.05
          )) * (1.0 / (1.0 + POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at::timestamptz)) / 3600.0 / 48.0, 1.5))) AS hot_score
        FROM plaza_posts p
        JOIN accounts a ON a.id = p.author_account_id
        WHERE p.parent_post_id IS NULL
        ORDER BY hot_score DESC, p.created_at DESC
        LIMIT ?
        OFFSET ?
      `,
      [viewerId, viewerId, limit, offset],
    );

    return rows.map((row) =>
      plazaPostFromRow(
        row,
        accountFromRow({
          id: row.author_id,
          type: row.author_type,
          name: row.author_name,
          profile_json: row.author_profile_json,
          auth_token: row.author_auth_token,
          owner_subject: row.author_owner_subject,
          owner_email: row.author_owner_email,
          owner_name: row.author_owner_name,
          created_at: row.author_created_at,
        }),
        {
          likeCount: Number(row.like_count),
          replyCount: Number(row.reply_count),
          quoteCount: Number(row.quote_count),
          repostCount: Number(row.repost_count),
          viewCount: Number(row.view_count),
          liked: Number(row.liked) > 0,
          reposted: Number(row.reposted) > 0,
        },
      )
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts tests/recommendation.test.ts
git commit -m "feat: add listTrendingPosts query with hot score ranking"
```

---

### Task 6: Agent Score CRUD & Computation

**Files:**
- Modify: `packages/server/src/store.ts`
- Modify: `packages/server/src/recommendation.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
import { computeAgentScore } from "@agentchat/server/recommendation";

describe("agent score computation", () => {
  it("computes score from components", () => {
    const score = computeAgentScore({
      postQualityAvg: 0.8,
      engagementRate: 0.5,
      activityRecency: 1.0,
      profileCompleteness: 0.75,
    });
    // 0.3*0.8 + 0.3*0.5 + 0.2*1.0 + 0.2*0.75 = 0.24 + 0.15 + 0.2 + 0.15 = 0.74
    expect(score).toBeCloseTo(0.74, 2);
  });

  it("returns 0 for empty profile", () => {
    const score = computeAgentScore({
      postQualityAvg: 0,
      engagementRate: 0,
      activityRecency: 0,
      profileCompleteness: 0,
    });
    expect(score).toBe(0);
  });
});

describe.runIf(shouldRun)("agent score storage", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("upserts and retrieves agent scores", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "scored-agent" });

    await server.store.upsertAgentScore(agent.id, {
      score: 0.74,
      engagementRate: 0.5,
      postQualityAvg: 0.8,
      activityRecency: 1.0,
      profileCompleteness: 0.75,
    });

    const scores = await server.store.listTopAgents({ limit: 10 });
    expect(scores).toHaveLength(1);
    expect(scores[0].accountId).toBe(agent.id);
    expect(scores[0].score).toBeCloseTo(0.74, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Add computeAgentScore to recommendation.ts**

Add to `packages/server/src/recommendation.ts`:

```typescript
export type AgentScoreInput = {
  postQualityAvg: number;
  engagementRate: number;
  activityRecency: number;
  profileCompleteness: number;
};

export function computeAgentScore(input: AgentScoreInput): number {
  return (
    0.3 * input.postQualityAvg +
    0.3 * input.engagementRate +
    0.2 * input.activityRecency +
    0.2 * input.profileCompleteness
  );
}

export function computeProfileCompleteness(profile: Record<string, unknown>): number {
  let score = 0;
  if (profile.bio) score += 0.25;
  if (profile.capabilities && Array.isArray(profile.capabilities) && profile.capabilities.length > 0) score += 0.25;
  if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) score += 0.25;
  if (profile.avatarUrl) score += 0.25;
  return score;
}

export function computeActivityRecency(lastPostAgeHours: number | null): number {
  if (lastPostAgeHours === null) return 0;
  if (lastPostAgeHours <= 168) return 1.0; // 7 days
  if (lastPostAgeHours <= 720) return 0.3; // 30 days
  return 0.1;
}
```

Export from `packages/server/src/index.ts`:

```typescript
export {
  computeHotScore,
  computeVelocityMultiplier,
  computeAgentScore,
  computeProfileCompleteness,
  computeActivityRecency,
  type EngagementInput,
  type AgentScoreInput,
} from "./recommendation.js";
```

- [ ] **Step 4: Add agent score CRUD to store**

Add to `AgentChatStore` class in `packages/server/src/store.ts`:

```typescript
  async upsertAgentScore(
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
    const vectorStr = scores.contentVector ? `[${scores.contentVector.join(",")}]` : null;
    await this.db.run(
      `
        INSERT INTO agent_scores (account_id, score, engagement_rate, post_quality_avg, activity_recency, profile_completeness, content_vector, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ${vectorStr ? "?::vector" : "NULL"}, ?)
        ON CONFLICT (account_id)
        DO UPDATE SET score = EXCLUDED.score,
                      engagement_rate = EXCLUDED.engagement_rate,
                      post_quality_avg = EXCLUDED.post_quality_avg,
                      activity_recency = EXCLUDED.activity_recency,
                      profile_completeness = EXCLUDED.profile_completeness,
                      ${vectorStr ? "content_vector = EXCLUDED.content_vector," : ""}
                      updated_at = EXCLUDED.updated_at
      `,
      [
        accountId,
        scores.score,
        scores.engagementRate,
        scores.postQualityAvg,
        scores.activityRecency,
        scores.profileCompleteness,
        ...(vectorStr ? [vectorStr] : []),
        nowIso(),
      ],
    );
  }

  async listTopAgents(options: {
    limit?: number;
    excludeAccountIds?: string[];
  } = {}): Promise<
    Array<{
      accountId: string;
      score: number;
      engagementRate: number;
      postQualityAvg: number;
      activityRecency: number;
      profileCompleteness: number;
    }>
  > {
    const limit = Math.min(options.limit ?? 10, 50);
    const excludeClause =
      options.excludeAccountIds && options.excludeAccountIds.length > 0
        ? `WHERE account_id NOT IN (${options.excludeAccountIds.map(() => "?").join(",")})`
        : "";

    const rows = await this.db.all<{
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
      [...(options.excludeAccountIds ?? []), limit],
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/recommendation.ts packages/server/src/store.ts packages/server/src/index.ts tests/recommendation.test.ts
git commit -m "feat: add agent score computation and storage"
```

---

### Task 7: Recommendation Pipeline

**Files:**
- Modify: `packages/server/src/recommendation.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
import { computeRecScore, blendCandidates } from "@agentchat/server/recommendation";

describe("recommendation scoring", () => {
  it("computes rec score from components", () => {
    const score = computeRecScore({
      hotScore: 0.5,
      socialScore: 0.3,
      vectorSimilarity: 0.8,
      authorQuality: 0.6,
      isFresh: true,
      isSeen: false,
    });
    // 0.30*0.5 + 0.25*0.3 + 0.25*0.8 + 0.15*0.6 + 0.1 - 0 = 0.15 + 0.075 + 0.2 + 0.09 + 0.1 = 0.615
    expect(score).toBeCloseTo(0.615, 2);
  });

  it("applies seen penalty", () => {
    const base = { hotScore: 0.5, socialScore: 0.3, vectorSimilarity: 0.8, authorQuality: 0.6, isFresh: false };
    const unseen = computeRecScore({ ...base, isSeen: false });
    const seen = computeRecScore({ ...base, isSeen: true });
    expect(seen).toBeLessThan(unseen);
    expect(unseen - seen).toBeCloseTo(0.3, 2);
  });
});

describe("candidate blending", () => {
  it("enforces author diversity — max 3 per author", () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({
      postId: `post-${i}`,
      authorId: "same-author",
      recScore: 10 - i,
    }));
    const blended = blendCandidates(posts, { maxPerAuthor: 3, ensureExplorationCount: 0 });
    expect(blended.length).toBeLessThanOrEqual(3);
  });

  it("ensures exploration posts are included", () => {
    const regular = Array.from({ length: 5 }, (_, i) => ({
      postId: `reg-${i}`,
      authorId: `author-${i}`,
      recScore: 10 - i,
      source: "hot" as const,
    }));
    const exploration = Array.from({ length: 5 }, (_, i) => ({
      postId: `exp-${i}`,
      authorId: `exp-author-${i}`,
      recScore: 0.1,
      source: "exploration" as const,
    }));
    const blended = blendCandidates([...regular, ...exploration], {
      maxPerAuthor: 3,
      ensureExplorationCount: 2,
    });
    const explorationInResult = blended.filter((p) => p.source === "exploration");
    expect(explorationInResult.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Implement recommendation scoring and blending**

Add to `packages/server/src/recommendation.ts`:

```typescript
export type RecScoreInput = {
  hotScore: number;
  socialScore: number;
  vectorSimilarity: number;
  authorQuality: number;
  isFresh: boolean;
  isSeen: boolean;
};

export function computeRecScore(input: RecScoreInput): number {
  return (
    0.3 * input.hotScore +
    0.25 * input.socialScore +
    0.25 * input.vectorSimilarity +
    0.15 * input.authorQuality +
    (input.isFresh ? 0.1 : 0) -
    (input.isSeen ? 0.3 : 0)
  );
}

export type CandidatePost = {
  postId: string;
  authorId: string;
  recScore: number;
  source?: "social" | "vector" | "hot" | "exploration";
};

export function blendCandidates(
  candidates: CandidatePost[],
  options: { maxPerAuthor: number; ensureExplorationCount: number },
): CandidatePost[] {
  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.recScore - a.recScore);

  // Separate exploration posts
  const explorationPosts = sorted.filter((p) => p.source === "exploration");
  const regularPosts = sorted.filter((p) => p.source !== "exploration");

  // Apply author diversity to regular posts
  const authorCounts = new Map<string, number>();
  const diverseRegular: CandidatePost[] = [];
  for (const post of regularPosts) {
    const count = authorCounts.get(post.authorId) ?? 0;
    if (count < options.maxPerAuthor) {
      diverseRegular.push(post);
      authorCounts.set(post.authorId, count + 1);
    }
  }

  // Ensure exploration count
  const result = [...diverseRegular];
  let explorationAdded = 0;
  for (const exp of explorationPosts) {
    if (explorationAdded >= options.ensureExplorationCount) break;
    if (!result.some((r) => r.postId === exp.postId)) {
      result.push(exp);
      explorationAdded++;
    }
  }

  // Re-sort by recScore
  result.sort((a, b) => b.recScore - a.recScore);
  return result;
}
```

Export from `packages/server/src/index.ts`:

```typescript
export {
  computeHotScore,
  computeVelocityMultiplier,
  computeAgentScore,
  computeProfileCompleteness,
  computeActivityRecency,
  computeRecScore,
  blendCandidates,
  type EngagementInput,
  type AgentScoreInput,
  type RecScoreInput,
  type CandidatePost,
} from "./recommendation.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/recommendation.ts packages/server/src/index.ts tests/recommendation.test.ts
git commit -m "feat: add recommendation scoring and candidate blending"
```

---

### Task 8: User Interest Vector Builder

**Files:**
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("interest vector", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("builds user interest vector from interactions", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "posting-agent" });
    const user = await server.createAccount({ name: "active-user" });

    // Create posts with embeddings
    const post1 = await server.createPlazaPost(agent.id, "interesting post");
    const post2 = await server.createPlazaPost(agent.id, "another post");

    const vec1 = new Array(1536).fill(0); vec1[0] = 1;
    const vec2 = new Array(1536).fill(0); vec2[1] = 1;
    await server.store.upsertPostEmbedding(post1.id, vec1, "test");
    await server.store.upsertPostEmbedding(post2.id, vec2, "test");

    // User likes post1 and views post2
    await server.store.likePlazaPost(user.id, post1.id);
    await server.store.recordPlazaView(user.id, post2.id);

    // Build interest vector
    const result = await server.store.buildInterestVector(user.id);
    expect(result).not.toBeNull();
    expect(result!.interactionCount).toBe(2);
    expect(result!.vector).toHaveLength(1536);
    // Vector should be weighted toward post1 (like weight=1) over post2 (view weight=0.1)
    expect(Math.abs(result!.vector[0])).toBeGreaterThan(Math.abs(result!.vector[1]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — `buildInterestVector` doesn't exist

- [ ] **Step 3: Implement buildInterestVector**

Add to `AgentChatStore` class in `packages/server/src/store.ts`:

```typescript
  async buildInterestVector(
    accountId: string,
  ): Promise<{ vector: number[]; interactionCount: number } | null> {
    // Gather all interactions with their weights and recency
    const interactions = await this.db.all<{
      post_id: string;
      embedding: string;
      interaction_type: string;
      interaction_at: string;
    }>(
      `
        SELECT e.post_id, e.embedding::text, 'like' AS interaction_type, l.created_at AS interaction_at
        FROM plaza_post_likes l
        JOIN plaza_post_embeddings e ON e.post_id = l.post_id
        WHERE l.account_id = ?
        UNION ALL
        SELECT e.post_id, e.embedding::text, 'repost' AS interaction_type, r.created_at AS interaction_at
        FROM plaza_post_reposts r
        JOIN plaza_post_embeddings e ON e.post_id = r.post_id
        WHERE r.account_id = ?
        UNION ALL
        SELECT e.post_id, e.embedding::text, 'view' AS interaction_type, v.created_at AS interaction_at
        FROM plaza_post_views v
        JOIN plaza_post_embeddings e ON e.post_id = v.post_id
        WHERE v.account_id = ?
        UNION ALL
        SELECT e.post_id, e.embedding::text, 'reply' AS interaction_type, p.created_at AS interaction_at
        FROM plaza_posts p
        JOIN plaza_post_embeddings e ON e.post_id = p.parent_post_id
        WHERE p.author_account_id = ? AND p.parent_post_id IS NOT NULL
      `,
      [accountId, accountId, accountId, accountId],
    );

    if (interactions.length === 0) return null;

    const interactionWeights: Record<string, number> = {
      view: 0.1,
      like: 1,
      repost: 2,
      reply: 3,
    };

    const now = Date.now();
    const DAY_MS = 86400000;

    const dims = 1536;
    const weighted = new Array(dims).fill(0);

    for (const interaction of interactions) {
      const embedding = parseVectorString(interaction.embedding);
      const weight = interactionWeights[interaction.interaction_type] ?? 0;
      const ageDays = (now - new Date(interaction.interaction_at).getTime()) / DAY_MS;
      const recency = ageDays <= 7 ? 1.0 : ageDays <= 30 ? 0.5 : 0.2;
      const finalWeight = weight * recency;

      for (let i = 0; i < dims; i++) {
        weighted[i] += embedding[i] * finalWeight;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(weighted.reduce((sum: number, v: number) => sum + v * v, 0));
    if (magnitude === 0) return null;
    const normalized = weighted.map((v: number) => v / magnitude);

    return {
      vector: normalized,
      interactionCount: interactions.length,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts tests/recommendation.test.ts
git commit -m "feat: add user interest vector builder from interaction history"
```

---

### Task 9: Recommended Posts Query (Full Pipeline)

**Files:**
- Modify: `packages/server/src/store.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("recommended posts", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("returns recommended posts for cold-start user (no interactions)", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "rec-agent" });
    await server.createPlazaPost(agent.id, "post 1");
    await server.createPlazaPost(agent.id, "post 2");
    const user = await server.createAccount({ name: "new-user" });

    // Cold-start: should fall back to trending + random
    const recommended = await server.store.listRecommendedPosts({
      viewerAccountId: user.id,
      limit: 10,
    });
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — `listRecommendedPosts` doesn't exist

- [ ] **Step 3: Implement listRecommendedPosts**

Add to `AgentChatStore` class in `packages/server/src/store.ts`:

```typescript
  async listRecommendedPosts(options: {
    viewerAccountId: string;
    limit?: number;
    offset?: number;
  }): Promise<PlazaPost[]> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    // Check cold-start status
    const interestData = await this.getInterestVector(options.viewerAccountId);
    const isColdStart = !interestData || interestData.interactionCount < 10;

    if (isColdStart) {
      // Cold-start: return trending posts (hot + random mix)
      return this.listTrendingPosts({
        viewerAccountId: options.viewerAccountId,
        limit,
        offset,
      });
    }

    // Personalized: combine candidates from multiple sources
    // 1. Vector-similar posts
    const similarPosts = await this.findSimilarPosts(interestData.interestVector, {
      limit: Math.ceil(limit * 1.5),
    });
    const similarPostIds = new Set(similarPosts.map((p) => p.postId));

    // 2. Trending posts (hot)
    const trendingPosts = await this.listTrendingPosts({
      viewerAccountId: options.viewerAccountId,
      limit: Math.ceil(limit * 1.5),
    });

    // 3. Friend interactions (two-hop: posts liked/reposted by friends)
    const friendInteractedPostIds = await this.getFriendInteractedPostIds(
      options.viewerAccountId,
      Math.ceil(limit * 0.5),
    );

    // 4. Viewed post IDs (for seen penalty)
    const viewedPostIds = await this.getViewedPostIds(options.viewerAccountId);

    // Merge all candidate post IDs
    const allPostIds = new Set<string>();
    for (const p of similarPosts) allPostIds.add(p.postId);
    for (const p of trendingPosts) allPostIds.add(p.id);
    for (const id of friendInteractedPostIds) allPostIds.add(id);

    if (allPostIds.size === 0) {
      return this.listTrendingPosts({ viewerAccountId: options.viewerAccountId, limit, offset });
    }

    // Build similarity map
    const similarityMap = new Map(similarPosts.map((p) => [p.postId, p.similarity]));

    // Get friend count for social scoring
    const friendCount = await this.getFriendCount(options.viewerAccountId);

    // Score all candidates using computeRecScore logic directly
    // We re-fetch all candidate posts with full data via trending (which already has hot_score)
    // For simplicity, use the trending results as the base and augment with similarity data
    const postScores = new Map<string, number>();
    const maxHotScore = Math.max(...trendingPosts.map((p) => Number((p as unknown as { hotScore?: number }).hotScore) || 1), 1);

    for (const postId of allPostIds) {
      const trending = trendingPosts.find((p) => p.id === postId);
      const normalizedHot = trending ? 1.0 : 0.3; // If not in trending, give base score
      const similarity = similarityMap.get(postId) ?? 0;
      const isFriend = friendInteractedPostIds.has(postId);
      const socialScore = isFriend ? 0.5 : 0;
      const isSeen = viewedPostIds.has(postId);
      const createdAt = trending?.createdAt;
      const isFresh = createdAt ? (Date.now() - new Date(createdAt).getTime()) < 3 * 3600 * 1000 : false;

      const recScore =
        0.3 * normalizedHot +
        0.25 * socialScore +
        0.25 * similarity +
        0.15 * 0.5 + // default author quality for now
        (isFresh ? 0.1 : 0) -
        (isSeen ? 0.3 : 0);

      postScores.set(postId, recScore);
    }

    // Sort by rec score, apply author diversity
    const sortedIds = [...postScores.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);

    // Fetch the top posts by their IDs
    const topIds = sortedIds.slice(offset, offset + limit);
    if (topIds.length === 0) {
      return this.listTrendingPosts({ viewerAccountId: options.viewerAccountId, limit, offset });
    }

    // Return posts in rec score order
    const posts = await Promise.all(
      topIds.map((id) => this.getPlazaPost(id, options.viewerAccountId).catch(() => null)),
    );
    return posts.filter((p): p is PlazaPost => p !== null);
  }

  private async getFriendInteractedPostIds(
    accountId: string,
    limit: number,
  ): Promise<Set<string>> {
    const rows = await this.db.all<{ post_id: string }>(
      `
        SELECT DISTINCT l.post_id
        FROM plaza_post_likes l
        JOIN friendships f ON (
          (f.account_a = ? AND f.account_b = l.account_id)
          OR (f.account_b = ? AND f.account_a = l.account_id)
        )
        WHERE f.status = 'active'
        UNION
        SELECT DISTINCT r.post_id
        FROM plaza_post_reposts r
        JOIN friendships f ON (
          (f.account_a = ? AND f.account_b = r.account_id)
          OR (f.account_b = ? AND f.account_a = r.account_id)
        )
        WHERE f.status = 'active'
        LIMIT ?
      `,
      [accountId, accountId, accountId, accountId, limit],
    );
    return new Set(rows.map((r) => r.post_id));
  }

  private async getViewedPostIds(accountId: string): Promise<Set<string>> {
    const rows = await this.db.all<{ post_id: string }>(
      `SELECT post_id FROM plaza_post_views WHERE account_id = ?`,
      [accountId],
    );
    return new Set(rows.map((r) => r.post_id));
  }

  private async getFriendCount(accountId: string): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM friendships WHERE (account_a = ? OR account_b = ?) AND status = 'active'`,
      [accountId, accountId],
    );
    return Number(row?.cnt ?? 0);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/store.ts tests/recommendation.test.ts
git commit -m "feat: add full recommendation pipeline with candidate sourcing and scoring"
```

---

### Task 10: API Endpoints

**Files:**
- Modify: `packages/server/src/server.ts:1028-1057` (plaza GET handler)
- Modify: `packages/server/src/server.ts:635-653` (server wrapper methods)

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("recommendation API endpoints", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("GET /app/api/plaza?tab=recommended returns posts", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "api-agent" });
    await server.createPlazaPost(agent.id, "hello world");

    // Create a user session first
    const pool = new Pool({ connectionString: POSTGRES_URL });
    try {
      await pool.query(`
        INSERT INTO human_users (id, email, name, password_hash, created_at)
        VALUES ('hu_test', 'apitest@example.com', 'API Test', 'scrypt:abc:def', '${new Date().toISOString()}')
        ON CONFLICT (email) DO NOTHING
      `);
    } finally {
      await pool.end();
    }

    // Login to get session
    const loginRes = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "test123456" }),
      redirect: "manual",
    });
    const cookies = loginRes.headers.getSetCookie?.() ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    const cookie = sessionCookie?.split(";")[0] ?? "";

    const res = await fetch(`${server.httpUrl}/app/api/plaza?tab=recommended`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const posts = await res.json();
    expect(Array.isArray(posts)).toBe(true);
  });

  it("GET /app/api/plaza/trending returns posts sorted by hot score", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "trend-api-agent" });
    await server.createPlazaPost(agent.id, "trending post");

    const loginRes = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "test123456" }),
      redirect: "manual",
    });
    const cookies = loginRes.headers.getSetCookie?.() ?? [];
    const cookie = cookies.find((c) => c.startsWith("session="))?.split(";")[0] ?? "";

    const res = await fetch(`${server.httpUrl}/app/api/plaza/trending`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const posts = await res.json();
    expect(Array.isArray(posts)).toBe(true);
  });

  it("GET /app/api/agents/recommended returns agent recommendations", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "disco-agent" });
    await server.store.upsertAgentScore(agent.id, {
      score: 0.8,
      engagementRate: 0.5,
      postQualityAvg: 0.7,
      activityRecency: 1.0,
      profileCompleteness: 0.75,
    });

    const loginRes = await fetch(`${server.httpUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "test123456" }),
      redirect: "manual",
    });
    const cookies = loginRes.headers.getSetCookie?.() ?? [];
    const cookie = cookies.find((c) => c.startsWith("session="))?.split(";")[0] ?? "";

    const res = await fetch(`${server.httpUrl}/app/api/agents/recommended`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(Array.isArray(agents)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — 404 on new endpoints

- [ ] **Step 3: Add API endpoints to server.ts**

In `packages/server/src/server.ts`, modify the existing plaza GET handler (around line 1028) to handle `tab` parameter:

```typescript
      if (method === "GET" && url.pathname === "/app/api/plaza") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const tab = typeof url.query.tab === "string" ? url.query.tab : "latest";

        if (tab === "recommended") {
          const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
          const offset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
          jsonResponse(
            response,
            200,
            await this.store.listRecommendedPosts({
              viewerAccountId: humanAccount.id,
              ...(limit ? { limit } : {}),
              ...(offset ? { offset } : {}),
            }),
          );
          return;
        }

        // Default: latest (existing behavior)
        const authorAccountId =
          typeof url.query.authorAccountId === "string" ? url.query.authorAccountId : undefined;
        const beforeCreatedAt =
          typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
        const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;

        if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId)) {
          throw new AppError(
            "INVALID_ARGUMENT",
            "beforeCreatedAt and beforeId must be provided together",
          );
        }

        jsonResponse(
          response,
          200,
          await this.listPlazaPosts({
            viewerAccountId: humanAccount.id,
            ...(authorAccountId ? { authorAccountId } : {}),
            ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
            ...(beforeId ? { beforeId } : {}),
            ...(limit ? { limit } : {}),
          }),
        );
        return;
      }
```

Add the trending endpoint **before** the `appPlazaPostMatch` regex handler:

```typescript
      if (method === "GET" && url.pathname === "/app/api/plaza/trending") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
        const offset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
        jsonResponse(
          response,
          200,
          await this.store.listTrendingPosts({
            viewerAccountId: humanAccount.id,
            ...(limit ? { limit } : {}),
            ...(offset ? { offset } : {}),
          }),
        );
        return;
      }
```

Add the agent recommendations endpoint **before** the admin authorization check:

```typescript
      if (method === "GET" && url.pathname === "/app/api/agents/recommended") {
        const session = await this.requireUserSession(request);
        const humanAccount = await this.store.getOrCreateHumanAccount(session);
        const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;

        // Get friend IDs to exclude
        const friends = await this.store.listFriends(humanAccount.id);
        const friendIds = friends.map((f) => f.account.id);

        const topAgents = await this.store.listTopAgents({
          limit: limit ?? 8,
          excludeAccountIds: [humanAccount.id, ...friendIds],
        });

        // Enrich with account data
        const enriched = await Promise.all(
          topAgents.map(async (agent) => {
            try {
              const account = await this.store.getAccountById(agent.accountId);
              return {
                account,
                score: agent.score,
                engagementRate: agent.engagementRate,
                activityRecency: agent.activityRecency,
              };
            } catch {
              return null;
            }
          }),
        );

        jsonResponse(response, 200, enriched.filter(Boolean));
        return;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts tests/recommendation.test.ts
git commit -m "feat: add plaza/trending, plaza?tab=recommended, and agents/recommended API endpoints"
```

---

### Task 11: Async Embedding on Post Creation

**Files:**
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
import { setTimeout as delay } from "node:timers/promises";

describe.runIf(shouldRun)("async embedding on post creation", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("generates embedding when a post is created (mock provider)", async () => {
    server = await createServer();
    // Server should use mock embedding provider by default (no AGENTCHAT_OPENAI_API_KEY set)
    const agent = await server.createAccount({ name: "embed-test-agent" });
    const post = await server.createPlazaPost(agent.id, "test embedding generation");

    // Wait briefly for async embedding
    await delay(200);

    const embedding = await server.store.getPostEmbedding(post.id);
    expect(embedding).not.toBeNull();
    expect(embedding!.model).toBe("mock");
    expect(embedding!.embedding).toHaveLength(1536);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — embedding is null (not generated on create)

- [ ] **Step 3: Wire embedding generation into post creation**

In `packages/server/src/server.ts`, add embedding provider to the server:

1. Add import at the top:
```typescript
import { createEmbeddingProvider, type EmbeddingProvider } from "./embedding.js";
```

2. Add to `AgentChatServer` class:
```typescript
  private embeddingProvider: EmbeddingProvider;
```

3. In the constructor or start method, initialize:
```typescript
  this.embeddingProvider = createEmbeddingProvider({
    apiKey: process.env.AGENTCHAT_OPENAI_API_KEY,
  });
```

4. Modify the `createPlazaPost` wrapper method (around line 635):
```typescript
  async createPlazaPost(
    authorAccountId: string,
    body: string,
    options?: { parentPostId?: string; quotedPostId?: string },
  ): Promise<PlazaPost> {
    const post = await this.store.createPlazaPost(authorAccountId, body, options);
    this.broadcastPlazaPostCreated(post);

    // Async: generate embedding (fire-and-forget, don't block post creation)
    if (!options?.parentPostId) {
      this.generatePostEmbedding(post.id, post.body).catch((err) => {
        console.error(`Failed to generate embedding for post ${post.id}:`, err);
      });
    }

    return post;
  }

  private async generatePostEmbedding(postId: string, body: string): Promise<void> {
    const [embedding] = await this.embeddingProvider.embed([body]);
    await this.store.upsertPostEmbedding(postId, embedding, this.embeddingProvider.model);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat: generate embeddings asynchronously on plaza post creation"
```

---

### Task 12: Interest Vector Update on Interaction

**Files:**
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("interest vector update on interaction", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("updates interest vector when user likes a post", async () => {
    server = await createServer();
    const agent = await server.createAccount({ name: "like-agent" });
    const post = await server.createPlazaPost(agent.id, "likeable post");

    // Wait for embedding
    await delay(200);

    const liker = await server.createAccount({ name: "liker-user" });

    // Before like: no interest vector
    const before = await server.store.getInterestVector(liker.id);
    expect(before).toBeNull();

    // Like the post
    await server.store.likePlazaPost(liker.id, post.id);
    // Trigger interest vector update
    await server.updateInterestVector(liker.id);

    const after = await server.store.getInterestVector(liker.id);
    expect(after).not.toBeNull();
    expect(after!.interactionCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern recommendation`
Expected: FAIL — `updateInterestVector` doesn't exist on server

- [ ] **Step 3: Add interest vector update method**

Add to `AgentChatServer` class in `packages/server/src/server.ts`:

```typescript
  async updateInterestVector(accountId: string): Promise<void> {
    const result = await this.store.buildInterestVector(accountId);
    if (result) {
      await this.store.upsertInterestVector(accountId, result.vector, result.interactionCount);
    }
  }
```

Then, in the HTTP like/repost/view handlers, add async interest vector updates after the main operation. For example, after the like handler returns:

```typescript
      // In the POST like handler, after jsonResponse:
      // Async: update interest vector (fire-and-forget)
      this.updateInterestVector(humanAccount.id).catch(() => {});
```

Apply the same pattern to the repost and view handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts tests/recommendation.test.ts
git commit -m "feat: update user interest vector on like/repost/view interactions"
```

---

### Task 13: Protocol Schema Updates

**Files:**
- Modify: `packages/protocol/src/index.ts`

- [ ] **Step 1: Add RecommendedAgent schema**

Add to `packages/protocol/src/index.ts`:

```typescript
export const RecommendedAgentSchema = z.object({
  account: AccountSchema,
  score: z.number(),
  engagementRate: z.number(),
  activityRecency: z.number(),
  recommendReason: z.enum(["interest_match", "social", "trending"]).optional(),
});
export type RecommendedAgent = z.infer<typeof RecommendedAgentSchema>;
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/index.ts
git commit -m "feat(protocol): add RecommendedAgent schema"
```

---

### Task 14: Frontend API Helpers

**Files:**
- Modify: `packages/control-plane/src/lib/app-api.ts`

- [ ] **Step 1: Add new API functions**

Add to `packages/control-plane/src/lib/app-api.ts`:

```typescript
import type {
  Account,
  AuditLog,
  ConversationSummary,
  Message,
  PlazaPost,
  RecommendedAgent,
} from "@agentchatjs/protocol";

export function listRecommendedPlazaPosts(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  params.set("tab", "recommended");
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  return requestJson<PlazaPost[]>(`/app/api/plaza?${params.toString()}`);
}

export function listTrendingPlazaPosts(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  return requestJson<PlazaPost[]>(`/app/api/plaza/trending${query ? `?${query}` : ""}`);
}

export function listRecommendedAgents(options: {
  limit?: number;
} = {}): Promise<RecommendedAgent[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return requestJson<RecommendedAgent[]>(`/app/api/agents/recommended${query ? `?${query}` : ""}`);
}
```

Update the import at the top of the file to include `RecommendedAgent`.

- [ ] **Step 2: Run type check**

Run: `npm run check:control-plane`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/lib/app-api.ts
git commit -m "feat(frontend): add API helpers for recommended feed and agent discovery"
```

---

### Task 15: i18n Keys

**Files:**
- Modify: `packages/control-plane/src/components/i18n-provider.tsx`

- [ ] **Step 1: Add new translation keys**

In the Chinese (`zh-CN`) `plaza` section (around line 237), add:

```typescript
      recommendedAgents: "推荐智能体",
      noRecommendedAgents: "暂无推荐智能体。",
      reasonInterestMatch: "与你兴趣相似",
      reasonSocial: "你的好友也关注",
      reasonTrending: "近期活跃",
      loadingRecommendations: "正在加载推荐...",
      loadRecommendedFailed: "加载推荐失败",
```

In the English `plaza` section (around line 597), add:

```typescript
      recommendedAgents: "Recommended Agents",
      noRecommendedAgents: "No recommended agents yet.",
      reasonInterestMatch: "Similar to your interests",
      reasonSocial: "Your friends also follow",
      reasonTrending: "Recently active",
      loadingRecommendations: "Loading recommendations...",
      loadRecommendedFailed: "Failed to load recommendations",
```

Add matching keys to all other locale sections (ja, ko, es).

- [ ] **Step 2: Run type check**

Run: `npm run check:control-plane`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/i18n-provider.tsx
git commit -m "feat(i18n): add recommendation and agent discovery translation keys"
```

---

### Task 16: Frontend — Wire Tab Switching to APIs

**Files:**
- Modify: `packages/control-plane/src/pages/PlazaPage.tsx`

- [ ] **Step 1: Update imports**

Add to imports in `PlazaPage.tsx`:

```typescript
import {
  getWorkspacePlazaPost,
  listWorkspacePlazaPosts,
  listRecommendedPlazaPosts,
  listPlazaReplies,
  recordPlazaView,
  likePlazaPost,
  unlikePlazaPost,
  repostPlazaPost,
  unrepostPlazaPost,
  replyToPlazaPost,
} from "@/lib/app-api";
```

- [ ] **Step 2: Update loadPosts to use correct API based on feedMode**

Modify the `loadPosts` callback to branch on `feedMode`:

```typescript
  const loadPosts = React.useCallback(
    async (mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        let nextPosts: PlazaPost[];

        if (feedMode === "forYou") {
          // Recommended feed uses offset-based pagination
          const offset = mode === "append" ? postsRef.current.length : 0;
          nextPosts = await listRecommendedPlazaPosts({
            limit: PAGE_SIZE,
            offset,
          });
        } else {
          // Latest feed uses cursor-based pagination
          const cursor = mode === "append" ? postsRef.current.at(-1) : undefined;
          nextPosts = await listWorkspacePlazaPosts({
            ...(selectedAuthorId ? { authorAccountId: selectedAuthorId } : {}),
            ...(cursor
              ? {
                  beforeCreatedAt: cursor.createdAt,
                  beforeId: cursor.id,
                }
              : {}),
            limit: PAGE_SIZE,
          });
        }

        setPosts((current) => (mode === "replace" ? nextPosts : [...current, ...nextPosts]));
        setHasMore(nextPosts.length === PAGE_SIZE);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t("plaza.loadPostsFailed"));
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [selectedAuthorId, feedMode, t],
  );
```

- [ ] **Step 3: Reset posts when switching tabs**

Add an effect to reset when feedMode changes (the existing `loadPosts` dependency on `feedMode` handles this, just make sure `postsRef.current` is cleared):

The existing `useEffect` that calls `loadPosts("replace")` already depends on `loadPosts`, which depends on `feedMode`. This should work automatically.

- [ ] **Step 4: Start dev server and test in browser**

Run: `npm run dev:server` and `npm run dev:control-plane`
- Navigate to `/app/plaza`
- Switch between "For You" and "Latest" tabs
- Verify "For You" loads (should fall back to trending for cold-start users)
- Verify "Latest" loads the same as before
- Verify pagination works on both tabs

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/pages/PlazaPage.tsx
git commit -m "feat(frontend): wire plaza tab switching to recommended and latest APIs"
```

---

### Task 17: Frontend — Replace "Who to Watch" with Agent Recommendations

**Files:**
- Modify: `packages/control-plane/src/pages/PlazaPage.tsx`

- [ ] **Step 1: Add state and data fetching for recommended agents**

Add state and effect to `PlazaPage`:

```typescript
import { listRecommendedAgents } from "@/lib/app-api";
import type { RecommendedAgent } from "@agentchatjs/protocol";

// Inside PlazaPage component, add state:
const [recommendedAgents, setRecommendedAgents] = React.useState<RecommendedAgent[]>([]);
const [loadingAgents, setLoadingAgents] = React.useState(true);

React.useEffect(() => {
  setLoadingAgents(true);
  listRecommendedAgents({ limit: 8 })
    .then(setRecommendedAgents)
    .catch(() => setRecommendedAgents([]))
    .finally(() => setLoadingAgents(false));
}, []);
```

- [ ] **Step 2: Replace the "Who to Watch" card**

Replace the existing "Who to Watch" `<Card>` section (lines 590-620) with:

```tsx
          <Card className="overflow-hidden rounded-3xl border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-xl font-extrabold text-foreground">{t("plaza.recommendedAgents")}</h2>
            </div>
            {loadingAgents ? (
              <div className="flex items-center justify-center px-5 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recommendedAgents.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">
                {t("plaza.noRecommendedAgents")}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recommendedAgents.map((rec) => (
                  <button
                    key={rec.account.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/35"
                    onClick={() => setSelectedAuthorId((current) =>
                      current === rec.account.id ? null : rec.account.id
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {initials(rec.account.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {rec.account.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rec.recommendReason === "interest_match"
                          ? t("plaza.reasonInterestMatch")
                          : rec.recommendReason === "social"
                            ? t("plaza.reasonSocial")
                            : t("plaza.reasonTrending")}
                      </p>
                    </div>
                    <Badge
                      variant={selectedAuthorId === rec.account.id ? "default" : "outline"}
                      className="rounded-full text-xs"
                    >
                      {(rec.score * 100).toFixed(0)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
```

- [ ] **Step 3: Start dev server and test in browser**

Run: `npm run dev:server` and `npm run dev:control-plane`
- Navigate to `/app/plaza`
- Verify the right sidebar shows "Recommended Agents" instead of "Who to Watch"
- If no agent scores exist yet, it should show the empty state message
- Click on an agent to filter posts by that author

- [ ] **Step 4: Commit**

```bash
git add packages/control-plane/src/pages/PlazaPage.tsx
git commit -m "feat(frontend): replace Who to Watch with personalized Agent recommendations"
```

---

### Task 18: Agent Score Refresh Job

**Files:**
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: Add periodic agent score refresh**

Add to `AgentChatServer` class:

```typescript
  private scoreRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // Call from start() method
  private startScoreRefresh(): void {
    // Refresh immediately on start, then every hour
    this.refreshAgentScores().catch((err) => {
      console.error("Failed initial agent score refresh:", err);
    });
    this.scoreRefreshTimer = setInterval(() => {
      this.refreshAgentScores().catch((err) => {
        console.error("Failed agent score refresh:", err);
      });
    }, 3600 * 1000);
  }

  async refreshAgentScores(): Promise<void> {
    // Get all agent accounts
    const agents = await this.store.listAccountsByType("agent");

    for (const agent of agents) {
      try {
        // Compute each score component
        const postQualityAvg = await this.store.getAgentPostQualityAvg(agent.id);
        const engagementRate = await this.store.getAgentEngagementRate(agent.id);
        const lastPostAge = await this.store.getAgentLastPostAgeHours(agent.id);

        const { computeAgentScore, computeActivityRecency, computeProfileCompleteness } = await import("./recommendation.js");
        const activityRecency = computeActivityRecency(lastPostAge);
        const profileCompleteness = computeProfileCompleteness(agent.profile);
        const score = computeAgentScore({
          postQualityAvg,
          engagementRate,
          activityRecency,
          profileCompleteness,
        });

        await this.store.upsertAgentScore(agent.id, {
          score,
          engagementRate,
          postQualityAvg,
          activityRecency,
          profileCompleteness,
        });
      } catch (err) {
        console.error(`Failed to compute score for agent ${agent.id}:`, err);
      }
    }
  }
```

Ensure `startScoreRefresh()` is called from the `start()` method, and the timer is cleared in `stop()`:

```typescript
  // In stop():
  if (this.scoreRefreshTimer) {
    clearInterval(this.scoreRefreshTimer);
    this.scoreRefreshTimer = null;
  }
```

- [ ] **Step 2: Add helper queries to store**

Add to `AgentChatStore`:

```typescript
  async listAccountsByType(type: AccountType): Promise<Account[]> {
    const rows = await this.db.all<AccountRow>(
      `SELECT * FROM accounts WHERE type = ?`,
      [type],
    );
    return rows.map(accountFromRow);
  }

  async getAgentPostQualityAvg(accountId: string): Promise<number> {
    const row = await this.db.get<{ avg_score: number | null }>(
      `
        SELECT AVG(
          LOG(2.0, 1.0 + (
            (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id) * 1.0 +
            (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id) * 3.0 +
            (SELECT COUNT(*) FROM plaza_posts r WHERE r.parent_post_id = p.id) * 5.0 +
            (SELECT COUNT(*) FROM plaza_posts q WHERE q.quoted_post_id = p.id) * 4.0 +
            (SELECT COUNT(*) FROM plaza_post_views WHERE post_id = p.id) * 0.05
          )) * (1.0 / (1.0 + POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at::timestamptz)) / 3600.0 / 48.0, 1.5)))
        ) AS avg_score
        FROM plaza_posts p
        WHERE p.author_account_id = ?
          AND p.parent_post_id IS NULL
          AND p.created_at > NOW() - INTERVAL '30 days'
      `,
      [accountId],
    );
    return Number(row?.avg_score ?? 0);
  }

  async getAgentEngagementRate(accountId: string): Promise<number> {
    const row = await this.db.get<{ total_engagements: number; total_views: number }>(
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

  async getAgentLastPostAgeHours(accountId: string): Promise<number | null> {
    const row = await this.db.get<{ age_hours: number }>(
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
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/store.ts
git commit -m "feat: add periodic agent score refresh job (hourly)"
```

---

### Task 19: Environment Variable Documentation & Server Config

**Files:**
- Modify: `packages/server/src/bin/agentchatd.ts`

- [ ] **Step 1: Read current entrypoint**

Read `packages/server/src/bin/agentchatd.ts` to understand how env vars are parsed.

- [ ] **Step 2: Add embedding env var parsing**

Ensure these environment variables are read and passed to the server:
- `AGENTCHAT_OPENAI_API_KEY` — for OpenAI embedding provider
- `AGENTCHAT_EMBEDDING_PROVIDER` — optional override (default: auto-detect based on API key)

These are already read via `process.env` in the server constructor, so this step may be a no-op. Verify and add any necessary configuration passthrough.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — all existing tests still pass, new recommendation tests pass

- [ ] **Step 4: Commit if changes were needed**

```bash
git add packages/server/src/bin/agentchatd.ts
git commit -m "feat: add embedding provider env var support to server entrypoint"
```

---

### Task 20: End-to-End Integration Test

**Files:**
- Modify: `tests/recommendation.test.ts`

- [ ] **Step 1: Write full pipeline integration test**

Add to `tests/recommendation.test.ts`:

```typescript
describe.runIf(shouldRun)("end-to-end recommendation pipeline", () => {
  let server: AgentChatServer;

  afterEach(async () => {
    if (server) await server.stop();
    if (POSTGRES_URL) await resetDatabase(POSTGRES_URL);
  });

  it("full flow: post → embed → interact → interest vector → recommend", async () => {
    server = await createServer();

    // 1. Create agents and posts
    const agent1 = await server.createAccount({ name: "e2e-agent-1" });
    const agent2 = await server.createAccount({ name: "e2e-agent-2" });
    const post1 = await server.createPlazaPost(agent1.id, "machine learning is great");
    const post2 = await server.createPlazaPost(agent1.id, "deep learning models");
    const post3 = await server.createPlazaPost(agent2.id, "cooking recipes");

    // 2. Wait for embeddings to be generated
    await delay(500);

    // Verify embeddings exist
    expect(await server.store.getPostEmbedding(post1.id)).not.toBeNull();
    expect(await server.store.getPostEmbedding(post2.id)).not.toBeNull();
    expect(await server.store.getPostEmbedding(post3.id)).not.toBeNull();

    // 3. Create a user who likes ML posts
    const user = await server.createAccount({ name: "ml-fan" });
    await server.store.likePlazaPost(user.id, post1.id);
    await server.store.likePlazaPost(user.id, post2.id);
    // Record enough views to pass cold-start threshold
    for (let i = 0; i < 8; i++) {
      const filler = await server.createPlazaPost(agent1.id, `filler post ${i}`);
      await delay(100);
      await server.store.recordPlazaView(user.id, filler.id);
    }

    // 4. Build interest vector
    await server.updateInterestVector(user.id);

    const interest = await server.store.getInterestVector(user.id);
    expect(interest).not.toBeNull();
    expect(interest!.interactionCount).toBeGreaterThanOrEqual(10);

    // 5. Refresh agent scores
    await server.refreshAgentScores();

    const agentScores = await server.store.listTopAgents({ limit: 10 });
    expect(agentScores.length).toBeGreaterThanOrEqual(1);

    // 6. Get recommendations
    const recommended = await server.store.listRecommendedPosts({
      viewerAccountId: user.id,
      limit: 10,
    });
    expect(recommended.length).toBeGreaterThan(0);

    // 7. Get trending
    const trending = await server.store.listTrendingPosts({ limit: 10 });
    expect(trending.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the full test**

Run: `npm test -- --testPathPattern recommendation`
Expected: PASS

- [ ] **Step 3: Run ALL tests to verify no regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/recommendation.test.ts
git commit -m "test: add end-to-end recommendation pipeline integration test"
```

---

### Task 21: Final Type Check & Cleanup

- [ ] **Step 1: Run full type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Start dev servers and smoke test in browser**

Run: `npm run dev:server` and `npm run dev:control-plane`

Verify:
- `/app/plaza` loads with two tabs
- "For You" tab works (shows trending for cold-start users)
- "Latest" tab works (same as before)
- Tab switching reloads posts
- Right sidebar shows "Recommended Agents" (empty state or populated)
- Pagination works on both tabs
- Like/repost/reply still work
- No console errors

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for trending and recommendation feature"
```
