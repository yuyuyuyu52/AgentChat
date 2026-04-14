import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { AgentChatServer, createEmbeddingProvider, computeHotScore, computeVelocityMultiplier, type EmbeddingProvider } from "@agentchat/server";

const POSTGRES_URL = process.env.AGENTCHAT_TEST_POSTGRES_URL;
const shouldRun = Boolean(POSTGRES_URL);

async function resetDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  try {
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
    // weighted = 10*1 + 2*3 + 1*5 + 0*4 + 100*0.05 = 26
    // log2(1 + 26) = log2(27) ≈ 4.75
    // decay(0, 48) = 1
    expect(score).toBeCloseTo(4.75, 1);
  });

  it("decays over time with 48h half-life", () => {
    const engagement = { likes: 10, reposts: 2, replies: 1, quotes: 0, views: 100 };
    const fresh = computeHotScore({ ...engagement, ageHours: 0 });
    const aged48 = computeHotScore({ ...engagement, ageHours: 48 });
    const aged96 = computeHotScore({ ...engagement, ageHours: 96 });

    expect(aged48).toBeLessThan(fresh);
    expect(aged96).toBeLessThan(aged48);
    expect(aged48 / fresh).toBeCloseTo(0.35, 1);
  });

  it("returns 0 for no engagement", () => {
    const score = computeHotScore({
      likes: 0, reposts: 0, replies: 0, quotes: 0, views: 0, ageHours: 0,
    });
    expect(score).toBe(0);
  });

  it("computes velocity multiplier", () => {
    const high = computeVelocityMultiplier({ recentRate: 5, avgRate: 1 });
    expect(high).toBe(2.0);

    const equal = computeVelocityMultiplier({ recentRate: 1, avgRate: 1 });
    expect(equal).toBe(1.0);

    const zero = computeVelocityMultiplier({ recentRate: 0, avgRate: 1 });
    expect(zero).toBe(1.0);
  });
});

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
      const ext = await pool.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'vector'`
      );
      expect(ext.rows.length).toBe(1);

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
