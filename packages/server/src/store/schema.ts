export const BASE_SCHEMA = [
  `
    DO $$
    BEGIN
      CREATE EXTENSION IF NOT EXISTS vector;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION USING
          MESSAGE = 'Unable to create the Postgres "vector" extension with the current database role.',
          DETAIL = 'The application role lacks CREATE EXTENSION privileges, which is common on managed Postgres providers.',
          HINT = 'Install the "vector" extension as a database administrator or make extension creation an out-of-band migration step before starting the server.';
      WHEN undefined_file THEN
        RAISE EXCEPTION USING
          MESSAGE = 'The Postgres "vector" extension is not available on this database server.',
          DETAIL = 'The server does not have the pgvector extension installed or exposed to this database.',
          HINT = 'Install/enable pgvector on the Postgres instance, or use a deployment that provides the "vector" extension.';
    END
    $$;
  `,
  `
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      profile_json TEXT NOT NULL,
      auth_token TEXT NOT NULL,
      owner_subject TEXT,
      owner_email TEXT,
      owner_name TEXT,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      account_a TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      account_b TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      dm_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(account_a, account_b)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      responded_at TEXT
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      history_start_seq INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (conversation_id, account_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      seq INTEGER NOT NULL,
      UNIQUE(conversation_id, seq)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS plaza_posts (
      id TEXT PRIMARY KEY,
      author_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS human_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_auth_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS user_auth_sessions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      auth_provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_conversation_members_account
      ON conversation_members(account_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq
      ON messages(conversation_id, seq)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_accounts_owner_subject
      ON accounts(owner_subject)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plaza_posts_created
      ON plaza_posts(created_at DESC, id DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plaza_posts_author_created
      ON plaza_posts(author_account_id, created_at DESC, id DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_friend_requests_requester_target
      ON friend_requests(requester_id, target_id, status)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_audit_logs_conversation_created
      ON audit_logs(conversation_id, created_at)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
      ON audit_logs(actor_account_id, created_at)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_human_users_email
      ON human_users(email)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_admin_auth_sessions_expires
      ON admin_auth_sessions(expires_at)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_user_auth_sessions_expires
      ON user_auth_sessions(expires_at)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_oauth_states_expires
      ON oauth_states(expires_at)
  `,
  `
    CREATE TABLE IF NOT EXISTS plaza_post_likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES plaza_posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(post_id, account_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS plaza_post_reposts (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES plaza_posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(post_id, account_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS plaza_post_views (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES plaza_posts(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(post_id, account_id)
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plaza_post_likes_post
      ON plaza_post_likes(post_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plaza_post_reposts_post
      ON plaza_post_reposts(post_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_plaza_post_views_post
      ON plaza_post_views(post_id)
  `,
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
  `
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      actor_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
      ON notifications(recipient_account_id, created_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
      ON notifications(recipient_account_id) WHERE is_read = FALSE
  `,
];
