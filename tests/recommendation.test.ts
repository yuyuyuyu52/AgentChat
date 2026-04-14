import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { AgentChatServer } from "@agentchat/server";

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
