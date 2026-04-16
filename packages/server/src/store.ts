import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  type Account,
  type AccountType,
  type AuditLog,
  type AuthAccount,
  type ConversationKind,
  type ConversationSummary,
  DEFAULT_GROUP_HISTORY_LIMIT,
  type FriendRecord,
  type FriendRequest,
  type FriendRequestStatus,
  type Message,
  type Notification,
  type NotificationType,
  type PlazaPost,
} from "@agentchatjs/protocol";
import { AppError } from "./errors.js";
import { computeRecScore } from "./recommendation.js";
import {
  createDatabaseAdapter,
  type DatabaseAdapter,
  type Queryable,
  type SqlValue,
  type StorageDriver,
} from "./db.js";

type AccountRow = {
  id: string;
  type: AccountType;
  name: string;
  profile_json: string;
  auth_token: string;
  owner_subject: string | null;
  owner_email: string | null;
  owner_name: string | null;
  created_at: string;
};

type ConversationRow = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: "text";
  created_at: string;
  seq: number;
};

type PlazaPostRow = {
  id: string;
  author_account_id: string;
  body: string;
  kind: "text";
  created_at: string;
  parent_post_id: string | null;
  quoted_post_id: string | null;
};

type MembershipRow = {
  conversation_id: string;
  account_id: string;
  role: string;
  joined_at: string;
  history_start_seq: number;
};

type FriendshipRow = {
  id: string;
  account_a: string;
  account_b: string;
  status: string;
  dm_conversation_id: string;
  created_at: string;
};

type FriendRequestRow = {
  id: string;
  requester_id: string;
  target_id: string;
  status: FriendRequestStatus;
  created_at: string;
  responded_at: string | null;
};

type AuditLogRow = {
  id: string;
  actor_account_id: string | null;
  event_type: string;
  subject_type: string;
  subject_id: string;
  conversation_id: string | null;
  metadata_json: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  recipient_account_id: string;
  type: string;
  actor_account_id: string | null;
  subject_type: string;
  subject_id: string;
  data_json: string;
  is_read: boolean;
  created_at: string;
};

type HumanUserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

type AdminAuthSessionRow = {
  id: string;
  created_at: string;
  expires_at: string;
};

type UserAuthSessionRow = {
  id: string;
  subject: string;
  email: string;
  name: string;
  picture: string | null;
  auth_provider: "google" | "local";
  created_at: string;
  expires_at: string;
};

type OAuthStateRow = {
  id: string;
  created_at: string;
  expires_at: string;
};

type OwnedConversationRow = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function addSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(Date.parse(isoTimestamp) + seconds * 1_000).toISOString();
}

function parseRecord(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    profile: parseRecord(row.profile_json),
    createdAt: row.created_at,
  };
}

function messageFromRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    kind: row.kind,
    createdAt: row.created_at,
    seq: Number(row.seq),
  };
}

function plazaPostFromRow(
  row: PlazaPostRow,
  author: Account,
  interactions?: {
    likeCount: number;
    replyCount: number;
    quoteCount: number;
    repostCount: number;
    viewCount: number;
    liked: boolean;
    reposted: boolean;
  },
  quotedPost?: PlazaPost | null,
): PlazaPost {
  return {
    id: row.id,
    author,
    body: row.body,
    kind: row.kind,
    createdAt: row.created_at,
    parentPostId: row.parent_post_id ?? null,
    quotedPostId: row.quoted_post_id ?? null,
    ...(quotedPost !== undefined ? { quotedPost } : {}),
    ...(interactions ? {
      likeCount: interactions.likeCount,
      replyCount: interactions.replyCount,
      quoteCount: interactions.quoteCount,
      repostCount: interactions.repostCount,
      viewCount: interactions.viewCount,
      liked: interactions.liked,
      reposted: interactions.reposted,
    } : {}),
  };
}

function auditLogFromRow(
  row: AuditLogRow & { actor_name?: string | null },
): AuditLog {
  return {
    id: row.id,
    actorAccountId: row.actor_account_id,
    actorName: row.actor_name ?? null,
    eventType: row.event_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    conversationId: row.conversation_id,
    metadata: parseRecord(row.metadata_json),
    createdAt: row.created_at,
  };
}

function notificationFromRow(
  row: NotificationRow & { actor_name?: string | null },
): Notification {
  return {
    id: row.id,
    recipientAccountId: row.recipient_account_id,
    type: row.type as NotificationType,
    actorAccountId: row.actor_account_id,
    actorName: row.actor_name ?? null,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    data: parseRecord(row.data_json),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function normalizeFriendshipPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function parseVectorString(vectorStr: string): number[] {
  return vectorStr
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(Number);
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [algorithm, salt, expectedHash] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  const left = Buffer.from(actualHash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function humanUserFromRow(row: HumanUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  };
}

function uniqueViolation(error: unknown, driver: StorageDriver): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (driver === "postgres") {
    return "code" in error && (error as { code?: string }).code === "23505";
  }
  return /unique/i.test(error.message);
}

const BASE_SCHEMA = [
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

export type CreateAccountInput = {
  name: string;
  type?: AccountType | undefined;
  profile?: Record<string, unknown> | undefined;
  owner?:
    | {
        subject: string;
        email: string;
        name: string;
      }
    | undefined;
};

export type SendMessageInput =
  | {
      senderId: string;
      conversationId: string;
      body: string;
      recipientId?: never;
    }
  | {
      senderId: string;
      recipientId: string;
      body: string;
      conversationId?: never;
    };

export type OwnedConversationSummary = ConversationSummary & {
  ownedAgents: Array<{
    id: string;
    name: string;
  }>;
};

export type OwnedConversationMessage = Message & {
  senderName: string;
};

export type HumanUser = ReturnType<typeof humanUserFromRow>;

export type StoredUserSession = {
  createdAt: number;
  subject: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: "google" | "local";
};

export type ListPlazaPostsOptions = {
  authorAccountId?: string;
  viewerAccountId?: string;
  parentPostId?: string;
  beforeCreatedAt?: string;
  beforeId?: string;
  limit?: number;
};

export type AgentChatStoreOptions = {
  databaseUrl: string;
};

export class AgentChatStore {
  readonly databasePath: string;
  readonly driver: StorageDriver;

  private readonly db: DatabaseAdapter;
  private initialized = false;

  constructor(options: AgentChatStoreOptions) {
    this.driver = "postgres";
    this.db = createDatabaseAdapter(options);
    this.databasePath = this.db.descriptor;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    for (const statement of BASE_SCHEMA) {
      await this.db.exec(statement);
    }
    await this.ensureAccountOwnerColumns();
    await this.ensurePlazaPostColumns();
    await this.seedDefaultHumanUser();
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async createAccount(input: CreateAccountInput): Promise<AuthAccount> {
    const createdAt = nowIso();
    const token = randomUUID();
    const row: AccountRow = {
      id: createId("acct"),
      type: input.type ?? "agent",
      name: input.name,
      profile_json: JSON.stringify(input.profile ?? {}),
      auth_token: token,
      owner_subject: input.owner?.subject ?? null,
      owner_email: input.owner?.email ?? null,
      owner_name: input.owner?.name ?? null,
      created_at: createdAt,
    };

    try {
      await this.db.run(
        `
          INSERT INTO accounts (
            id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          row.id,
          row.type,
          row.name,
          row.profile_json,
          row.auth_token,
          row.owner_subject,
          row.owner_email,
          row.owner_name,
          row.created_at,
        ],
      );
    } catch (error) {
      if (uniqueViolation(error, this.driver)) {
        throw new AppError("CONFLICT", `Account name "${row.name}" already exists`, 409);
      }
      throw error;
    }

    return {
      ...accountFromRow(row),
      token,
    };
  }

  async getOrCreateHumanAccount(session: {
    subject: string;
    email: string;
    name: string;
  }): Promise<Account> {
    const existing = await this.db.get<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE owner_subject = ? AND type = 'human'
      `,
      [session.subject],
    );
    if (existing) {
      return accountFromRow(existing);
    }

    const createdAt = nowIso();
    const row: AccountRow = {
      id: createId("acct"),
      type: "human",
      name: session.name,
      profile_json: JSON.stringify({}),
      auth_token: randomUUID(),
      owner_subject: session.subject,
      owner_email: session.email,
      owner_name: session.name,
      created_at: createdAt,
    };

    try {
      await this.db.run(
        `
          INSERT INTO accounts (id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [row.id, row.type, row.name, row.profile_json, row.auth_token, row.owner_subject, row.owner_email, row.owner_name, row.created_at],
      );
    } catch (error) {
      if (uniqueViolation(error, this.driver)) {
        row.name = `${session.name} (${session.email})`;
        await this.db.run(
          `
            INSERT INTO accounts (id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [row.id, row.type, row.name, row.profile_json, row.auth_token, row.owner_subject, row.owner_email, row.owner_name, row.created_at],
        );
      } else {
        throw error;
      }
    }

    return accountFromRow(row);
  }

  async getAccountById(accountId: string): Promise<Account> {
    return this.requireAccount(this.db, accountId);
  }

  async updateProfile(
    accountId: string,
    profileFields: Record<string, unknown>,
    ownerSubject?: string,
  ): Promise<Account> {
    const account = await this.requireAccount(this.db, accountId, ownerSubject);
    const updated = { ...account.profile, ...profileFields };
    // Remove keys explicitly set to null so users can clear fields
    for (const [key, value] of Object.entries(updated)) {
      if (value === null) delete updated[key];
    }
    await this.db.run(
      `UPDATE accounts SET profile_json = ? WHERE id = ?`,
      [JSON.stringify(updated), accountId],
    );
    return { ...account, profile: updated };
  }

  async listAccounts(ownerSubject?: string): Promise<Account[]> {
    const rows = ownerSubject
      ? await this.db.all<AccountRow>(
        `
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE owner_subject = ?
          ORDER BY created_at ASC
        `,
        [ownerSubject],
      )
      : await this.db.all<AccountRow>(
        `
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          ORDER BY created_at ASC
        `,
      );

    return rows.map(accountFromRow);
  }

  async listAgentAccounts(): Promise<Account[]> {
    const rows = await this.db.all<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE type = 'agent'
        ORDER BY created_at DESC
      `,
      [],
    );
    return rows.map(accountFromRow);
  }

  async authenticateAccount(accountId: string, token: string): Promise<Account> {
    const row = await this.db.get<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE id = ? AND auth_token = ?
      `,
      [accountId, token],
    );

    if (!row) {
      throw new AppError("UNAUTHORIZED", "Invalid account credentials", 401);
    }

    return accountFromRow(row);
  }

  async resetToken(
    accountId: string,
    ownerSubject?: string,
  ): Promise<{ accountId: string; token: string }> {
    await this.requireAccount(this.db, accountId, ownerSubject);
    const token = randomUUID();
    await this.db.run("UPDATE accounts SET auth_token = ? WHERE id = ?", [token, accountId]);
    await this.insertAuditLog(this.db, {
      actorAccountId: accountId,
      eventType: "account.token_reset",
      subjectType: "account",
      subjectId: accountId,
      metadata: {},
    });
    return { accountId, token };
  }

  async deleteAccount(
    accountId: string,
    ownerSubject?: string,
  ): Promise<void> {
    const account = await this.requireAccount(this.db, accountId, ownerSubject);
    if (account.type === "human") {
      throw new AppError("INVALID_ARGUMENT", "Cannot delete human accounts", 400);
    }
    await this.db.run("DELETE FROM accounts WHERE id = ?", [accountId]);
  }

  async createHumanUser(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<HumanUser> {
    const createdAt = nowIso();
    const row: HumanUserRow = {
      id: createId("user"),
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      password_hash: hashPassword(input.password),
      created_at: createdAt,
    };

    try {
      await this.db.run(
        `
          INSERT INTO human_users (
            id, email, name, password_hash, created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [row.id, row.email, row.name, row.password_hash, row.created_at],
      );
    } catch (error) {
      if (uniqueViolation(error, this.driver)) {
        throw new AppError("CONFLICT", `User email "${row.email}" already exists`, 409);
      }
      throw error;
    }

    return humanUserFromRow(row);
  }

  async authenticateHumanUser(email: string, password: string): Promise<HumanUser> {
    const normalizedEmail = normalizeEmail(email);
    const row = await this.db.get<HumanUserRow>(
      `
        SELECT id, email, name, password_hash, created_at
        FROM human_users
        WHERE email = ?
      `,
      [normalizedEmail],
    );

    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
    }

    return humanUserFromRow(row);
  }

  async createAdminSession(ttlSeconds: number): Promise<string> {
    const createdAt = nowIso();
    const sessionId = randomUUID();
    await this.db.run(
      `
        INSERT INTO admin_auth_sessions (id, created_at, expires_at)
        VALUES (?, ?, ?)
      `,
      [sessionId, createdAt, addSeconds(createdAt, ttlSeconds)],
    );
    return sessionId;
  }

  async hasAdminSession(sessionId: string): Promise<boolean> {
    const now = nowIso();
    await this.db.run(
      `
        DELETE FROM admin_auth_sessions
        WHERE id = ?
          AND expires_at <= ?
      `,
      [sessionId, now],
    );
    const row = await this.db.get<{ id: string }>(
      `
        SELECT id
        FROM admin_auth_sessions
        WHERE id = ?
          AND expires_at > ?
      `,
      [sessionId, now],
    );
    return Boolean(row);
  }

  async deleteAdminSession(sessionId: string): Promise<void> {
    await this.db.run("DELETE FROM admin_auth_sessions WHERE id = ?", [sessionId]);
  }

  async createUserSession(
    input: {
      subject: string;
      email: string;
      name: string;
      picture?: string;
      authProvider: "google" | "local";
    },
    ttlSeconds: number,
  ): Promise<string> {
    const createdAt = nowIso();
    const sessionId = randomUUID();
    await this.db.run(
      `
        INSERT INTO user_auth_sessions (
          id, subject, email, name, picture, auth_provider, created_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        input.subject,
        input.email,
        input.name,
        input.picture ?? null,
        input.authProvider,
        createdAt,
        addSeconds(createdAt, ttlSeconds),
      ],
    );
    return sessionId;
  }

  async getUserSession(sessionId: string): Promise<StoredUserSession | undefined> {
    const now = nowIso();
    await this.db.run(
      `
        DELETE FROM user_auth_sessions
        WHERE id = ?
          AND expires_at <= ?
      `,
      [sessionId, now],
    );
    const row = await this.db.get<UserAuthSessionRow>(
      `
        SELECT id, subject, email, name, picture, auth_provider, created_at, expires_at
        FROM user_auth_sessions
        WHERE id = ?
          AND expires_at > ?
      `,
      [sessionId, now],
    );

    if (!row) {
      return undefined;
    }

    return {
      createdAt: Date.parse(row.created_at),
      subject: row.subject,
      email: row.email,
      name: row.name,
      ...(row.picture ? { picture: row.picture } : {}),
      authProvider: row.auth_provider,
    };
  }

  async deleteUserSession(sessionId: string): Promise<void> {
    await this.db.run("DELETE FROM user_auth_sessions WHERE id = ?", [sessionId]);
  }

  async createOAuthState(ttlSeconds: number): Promise<string> {
    const createdAt = nowIso();
    const state = randomUUID();
    await this.db.run(
      `
        INSERT INTO oauth_states (id, created_at, expires_at)
        VALUES (?, ?, ?)
      `,
      [state, createdAt, addSeconds(createdAt, ttlSeconds)],
    );
    return state;
  }

  async consumeOAuthState(state: string): Promise<boolean> {
    const result = await this.db.run(
      `
        DELETE FROM oauth_states
        WHERE id = ?
          AND expires_at > ?
      `,
      [state, nowIso()],
    );
    return result.rowCount > 0;
  }

  async getHumanUserByEmail(email: string): Promise<HumanUser | undefined> {
    const row = await this.db.get<HumanUserRow>(
      `
        SELECT id, email, name, password_hash, created_at
        FROM human_users
        WHERE email = ?
      `,
      [normalizeEmail(email)],
    );

    return row ? humanUserFromRow(row) : undefined;
  }

  async createFriendship(accountA: string, accountB: string): Promise<{
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  }> {
    if (accountA === accountB) {
      throw new AppError("INVALID_ARGUMENT", "Cannot friend the same account");
    }

    return this.db.transaction(async (tx) => {
      await this.requireAccount(tx, accountA);
      await this.requireAccount(tx, accountB);

      const [left, right] = normalizeFriendshipPair(accountA, accountB);
      const existing = await tx.get<FriendshipRow>(
        `
          SELECT id, account_a, account_b, status, dm_conversation_id, created_at
          FROM friendships
          WHERE account_a = ? AND account_b = ? AND status = 'active'
        `,
        [left, right],
      );

      if (existing) {
        return {
          friendshipId: existing.id,
          conversationId: existing.dm_conversation_id,
          createdAt: existing.created_at,
        };
      }

      const createdAt = nowIso();
      const friendshipId = createId("fr");
      const conversationId = createId("conv");

      await tx.run(
        `
          INSERT INTO conversations (id, kind, title, created_at)
          VALUES (?, 'dm', NULL, ?)
        `,
        [conversationId, createdAt],
      );
      await tx.run(
        `
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, 1)
        `,
        [conversationId, left, createdAt],
      );
      await tx.run(
        `
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, 1)
        `,
        [conversationId, right, createdAt],
      );
      await tx.run(
        `
          INSERT INTO friendships
            (id, account_a, account_b, status, dm_conversation_id, created_at)
          VALUES (?, ?, ?, 'active', ?, ?)
        `,
        [friendshipId, left, right, conversationId, createdAt],
      );

      await this.insertAuditLog(tx, {
        actorAccountId: accountA,
        eventType: "friendship.created",
        subjectType: "friendship",
        subjectId: friendshipId,
        conversationId,
        metadata: {
          accountA: left,
          accountB: right,
        },
      });

      return {
        friendshipId,
        conversationId,
        createdAt,
      };
    });
  }

  async listFriends(accountId: string): Promise<FriendRecord[]> {
    await this.requireAccount(this.db, accountId);
    const rows = await this.db.all<
      AccountRow & {
        dm_conversation_id: string;
        friendship_created_at: string;
      }
    >(
      `
        SELECT
          a.id,
          a.type,
          a.name,
          a.profile_json,
          a.auth_token,
          a.owner_subject,
          a.owner_email,
          a.owner_name,
          a.created_at,
          f.dm_conversation_id,
          f.created_at AS friendship_created_at
        FROM friendships f
        JOIN accounts a
          ON a.id = CASE
            WHEN f.account_a = ? THEN f.account_b
            ELSE f.account_a
          END
        WHERE (f.account_a = ? OR f.account_b = ?)
          AND f.status = 'active'
        ORDER BY a.name ASC
      `,
      [accountId, accountId, accountId],
    );

    return rows.map((row) => ({
      account: accountFromRow(row),
      conversationId: row.dm_conversation_id,
      createdAt: row.friendship_created_at,
    }));
  }

  async createGroup(title: string): Promise<ConversationSummary> {
    const conversationId = createId("conv");
    const createdAt = nowIso();
    await this.db.run(
      `
        INSERT INTO conversations (id, kind, title, created_at)
        VALUES (?, 'group', ?, ?)
      `,
      [conversationId, title, createdAt],
    );
    await this.insertAuditLog(this.db, {
      actorAccountId: null,
      eventType: "group.created",
      subjectType: "conversation",
      subjectId: conversationId,
      conversationId,
      metadata: {
        title,
      },
    });
    return this.getConversationSummaryForSystem(conversationId);
  }

  async createGroupAs(creatorId: string, title: string): Promise<ConversationSummary> {
    await this.requireAccount(this.db, creatorId);
    const conversationId = createId("conv");
    const createdAt = nowIso();

    await this.db.transaction(async (tx) => {
      await tx.run(
        `
          INSERT INTO conversations (id, kind, title, created_at)
          VALUES (?, 'group', ?, ?)
        `,
        [conversationId, title, createdAt],
      );
      await tx.run(
        `
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'owner', ?, 1)
        `,
        [conversationId, creatorId, createdAt],
      );
      await this.insertAuditLog(tx, {
        actorAccountId: creatorId,
        eventType: "group.created",
        subjectType: "conversation",
        subjectId: conversationId,
        conversationId,
        metadata: {
          title,
        },
      });
    });

    return this.getConversationSummaryForAccount(creatorId, conversationId);
  }

  async addFriendAs(actorId: string, peerAccountId: string): Promise<{
    requestId: string;
    createdAt: string;
  }> {
    await this.requireAccount(this.db, actorId);
    await this.requireAccount(this.db, peerAccountId);
    if (actorId === peerAccountId) {
      throw new AppError("INVALID_ARGUMENT", "Cannot send a friend request to self");
    }

    const [left, right] = normalizeFriendshipPair(actorId, peerAccountId);
    const active = await this.db.get<{ id: string }>(
      `
        SELECT id
        FROM friendships
        WHERE account_a = ? AND account_b = ? AND status = 'active'
      `,
      [left, right],
    );
    if (active) {
      throw new AppError("CONFLICT", "Accounts are already friends", 409);
    }

    const pendingSameDirection = await this.db.get<FriendRequestRow>(
      `
        SELECT id, requester_id, target_id, status, created_at, responded_at
        FROM friend_requests
        WHERE requester_id = ? AND target_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [actorId, peerAccountId],
    );
    if (pendingSameDirection) {
      return {
        requestId: pendingSameDirection.id,
        createdAt: pendingSameDirection.created_at,
      };
    }

    const reversePending = await this.db.get<{ id: string }>(
      `
        SELECT id
        FROM friend_requests
        WHERE requester_id = ? AND target_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [peerAccountId, actorId],
    );
    if (reversePending) {
      throw new AppError(
        "CONFLICT",
        "There is already an incoming friend request from this account",
        409,
      );
    }

    const requestId = createId("freq");
    const createdAt = nowIso();
    await this.db.run(
      `
        INSERT INTO friend_requests
          (id, requester_id, target_id, status, created_at, responded_at)
        VALUES (?, ?, ?, 'pending', ?, NULL)
      `,
      [requestId, actorId, peerAccountId, createdAt],
    );

    await this.insertAuditLog(this.db, {
      actorAccountId: actorId,
      eventType: "friend_request.created",
      subjectType: "friend_request",
      subjectId: requestId,
      metadata: {
        requesterId: actorId,
        targetId: peerAccountId,
      },
    });

    return {
      requestId,
      createdAt,
    };
  }

  async listFriendRequests(
    accountId: string,
    direction: "incoming" | "outgoing" | "all" = "all",
  ): Promise<FriendRequest[]> {
    await this.requireAccount(this.db, accountId);
    const where =
      direction === "incoming"
        ? "fr.target_id = ?"
        : direction === "outgoing"
          ? "fr.requester_id = ?"
          : "(fr.requester_id = ? OR fr.target_id = ?)";

    const params = direction === "all" ? [accountId, accountId] : [accountId];
    const rows = await this.db.all<
      FriendRequestRow & {
        req_id: string;
        req_type: AccountType;
        req_name: string;
        req_profile_json: string;
        req_auth_token: string;
        req_owner_subject: string | null;
        req_owner_email: string | null;
        req_owner_name: string | null;
        req_created_at: string;
        tgt_id: string;
        tgt_type: AccountType;
        tgt_name: string;
        tgt_profile_json: string;
        tgt_auth_token: string;
        tgt_owner_subject: string | null;
        tgt_owner_email: string | null;
        tgt_owner_name: string | null;
        tgt_created_at: string;
      }
    >(
      `
        SELECT
          fr.id,
          fr.requester_id,
          fr.target_id,
          fr.status,
          fr.created_at,
          fr.responded_at,
          req.id AS req_id,
          req.type AS req_type,
          req.name AS req_name,
          req.profile_json AS req_profile_json,
          req.auth_token AS req_auth_token,
          req.owner_subject AS req_owner_subject,
          req.owner_email AS req_owner_email,
          req.owner_name AS req_owner_name,
          req.created_at AS req_created_at,
          tgt.id AS tgt_id,
          tgt.type AS tgt_type,
          tgt.name AS tgt_name,
          tgt.profile_json AS tgt_profile_json,
          tgt.auth_token AS tgt_auth_token,
          tgt.owner_subject AS tgt_owner_subject,
          tgt.owner_email AS tgt_owner_email,
          tgt.owner_name AS tgt_owner_name,
          tgt.created_at AS tgt_created_at
        FROM friend_requests fr
        JOIN accounts req ON req.id = fr.requester_id
        JOIN accounts tgt ON tgt.id = fr.target_id
        WHERE ${where}
        ORDER BY fr.created_at DESC
      `,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      requester: accountFromRow({
        id: row.req_id,
        type: row.req_type,
        name: row.req_name,
        profile_json: row.req_profile_json,
        auth_token: row.req_auth_token,
        owner_subject: row.req_owner_subject,
        owner_email: row.req_owner_email,
        owner_name: row.req_owner_name,
        created_at: row.req_created_at,
      }),
      target: accountFromRow({
        id: row.tgt_id,
        type: row.tgt_type,
        name: row.tgt_name,
        profile_json: row.tgt_profile_json,
        auth_token: row.tgt_auth_token,
        owner_subject: row.tgt_owner_subject,
        owner_email: row.tgt_owner_email,
        owner_name: row.tgt_owner_name,
        created_at: row.tgt_created_at,
      }),
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
    }));
  }

  async respondFriendRequestAs(
    actorId: string,
    requestId: string,
    action: "accept" | "reject",
  ): Promise<
    | FriendRequest
    | {
        friendshipId: string;
        conversationId: string;
        createdAt: string;
      }
  > {
    await this.requireAccount(this.db, actorId);
    const request = await this.db.get<FriendRequestRow>(
      `
        SELECT id, requester_id, target_id, status, created_at, responded_at
        FROM friend_requests
        WHERE id = ?
      `,
      [requestId],
    );

    if (!request) {
      throw new AppError("NOT_FOUND", `Friend request "${requestId}" not found`, 404);
    }
    if (request.target_id !== actorId) {
      throw new AppError("FORBIDDEN", "Only the target can respond to this friend request", 403);
    }
    if (request.status !== "pending") {
      throw new AppError("CONFLICT", "Friend request has already been handled", 409);
    }

    const respondedAt = nowIso();
    await this.db.run(
      `
        UPDATE friend_requests
        SET status = ?, responded_at = ?
        WHERE id = ?
      `,
      [action === "accept" ? "accepted" : "rejected", respondedAt, requestId],
    );

    await this.insertAuditLog(this.db, {
      actorAccountId: actorId,
      eventType: `friend_request.${action}ed`,
      subjectType: "friend_request",
      subjectId: requestId,
      metadata: {
        requesterId: request.requester_id,
        targetId: request.target_id,
      },
    });

    if (action === "reject") {
      return this.getFriendRequestById(requestId);
    }

    return this.createFriendship(request.requester_id, request.target_id);
  }

  async addGroupMember(conversationId: string, accountId: string): Promise<ConversationSummary> {
    const conversation = await this.requireConversation(this.db, conversationId);
    if (conversation.kind !== "group") {
      throw new AppError("INVALID_ARGUMENT", "Can only add members to group conversations");
    }

    await this.requireAccount(this.db, accountId);
    const existing = await this.getMembership(this.db, conversationId, accountId);
    if (!existing) {
      const maxSeq = await this.getConversationMaxSeq(this.db, conversationId);
      const historyStartSeq = Math.max(
        1,
        maxSeq === 0 ? 1 : maxSeq - DEFAULT_GROUP_HISTORY_LIMIT + 1,
      );
      await this.db.run(
        `
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, ?)
        `,
        [conversationId, accountId, nowIso(), historyStartSeq],
      );
    }

    return this.getConversationSummaryForAccount(accountId, conversationId);
  }

  async addGroupMemberAs(
    actorId: string,
    conversationId: string,
    accountId: string,
  ): Promise<ConversationSummary> {
    await this.requireMembership(this.db, conversationId, actorId);
    const summary = await this.addGroupMember(conversationId, accountId);
    await this.insertAuditLog(this.db, {
      actorAccountId: actorId,
      eventType: "group.member_added",
      subjectType: "account",
      subjectId: accountId,
      conversationId,
      metadata: {
        accountId,
      },
    });
    return summary;
  }

  async listGroups(accountId: string): Promise<ConversationSummary[]> {
    await this.requireAccount(this.db, accountId);
    const ids = await this.db.all<Array<{ id: string }> extends never ? never : { id: string }>(
      `
        SELECT c.id
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        WHERE c.kind = 'group' AND cm.account_id = ?
        ORDER BY c.created_at ASC
      `,
      [accountId],
    );

    return Promise.all(ids.map(async ({ id }) => this.getConversationSummaryForAccount(accountId, id)));
  }

  async listConversationMembers(accountId: string, conversationId: string): Promise<Account[]> {
    await this.requireMembership(this.db, conversationId, accountId);
    const rows = await this.db.all<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE id IN (
          SELECT account_id
          FROM conversation_members
          WHERE conversation_id = ?
        )
        ORDER BY name ASC
      `,
      [conversationId],
    );
    return rows.map(accountFromRow);
  }

  async listConversations(accountId: string): Promise<ConversationSummary[]> {
    await this.requireAccount(this.db, accountId);
    const rows = await this.db.all<{ conversation_id: string }>(
      `
        SELECT conversation_id
        FROM conversation_members
        WHERE account_id = ?
        ORDER BY joined_at ASC
      `,
      [accountId],
    );

    return Promise.all(
      rows.map(async ({ conversation_id }) =>
        this.getConversationSummaryForAccount(accountId, conversation_id)
      ),
    );
  }

  async listOwnedConversations(ownerSubject: string): Promise<OwnedConversationSummary[]> {
    const conversations = await this.db.all<OwnedConversationRow>(
      `
        SELECT c.id, c.kind, c.title, c.created_at
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        JOIN accounts a ON a.id = cm.account_id
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE a.owner_subject = ?
        GROUP BY c.id, c.kind, c.title, c.created_at
        ORDER BY COALESCE(MAX(m.seq), 0) DESC, c.created_at DESC
      `,
      [ownerSubject],
    );

    return Promise.all(
      conversations.map(async (conversation) =>
        this.getOwnedConversationSummary(ownerSubject, conversation.id)
      ),
    );
  }

  async listOwnedConversationMessages(
    ownerSubject: string,
    conversationId: string,
    before?: number,
    limit = 50,
  ): Promise<OwnedConversationMessage[]> {
    const access = await this.requireOwnedConversationAccess(ownerSubject, conversationId);
    const rows = before
      ? await this.db.all<MessageRow & { sender_name: string }>(
        `
          SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.created_at, m.seq, a.name AS sender_name
          FROM messages m
          JOIN accounts a ON a.id = m.sender_id
          WHERE m.conversation_id = ?
            AND m.seq >= ?
            AND m.seq < ?
          ORDER BY m.seq DESC
          LIMIT ?
        `,
        [conversationId, access.visibleFromSeq, before, limit],
      )
      : await this.db.all<MessageRow & { sender_name: string }>(
        `
          SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.created_at, m.seq, a.name AS sender_name
          FROM messages m
          JOIN accounts a ON a.id = m.sender_id
          WHERE m.conversation_id = ?
            AND m.seq >= ?
          ORDER BY m.seq DESC
          LIMIT ?
        `,
        [conversationId, access.visibleFromSeq, limit],
      );

    return rows.reverse().map((row) => ({
      ...messageFromRow(row),
      senderName: row.sender_name,
    }));
  }

  async listMessages(
    accountId: string,
    conversationId: string,
    before?: number,
    limit = 50,
  ): Promise<Message[]> {
    const membership = await this.requireMembership(this.db, conversationId, accountId);

    const rows = before
      ? await this.db.all<MessageRow>(
        `
          SELECT id, conversation_id, sender_id, body, kind, created_at, seq
          FROM messages
          WHERE conversation_id = ?
            AND seq >= ?
            AND seq < ?
          ORDER BY seq DESC
          LIMIT ?
        `,
        [conversationId, membership.history_start_seq, before, limit],
      )
      : await this.db.all<MessageRow>(
        `
          SELECT id, conversation_id, sender_id, body, kind, created_at, seq
          FROM messages
          WHERE conversation_id = ?
            AND seq >= ?
          ORDER BY seq DESC
          LIMIT ?
        `,
        [conversationId, membership.history_start_seq, limit],
      );

    return rows.reverse().map(messageFromRow);
  }

  async createPlazaPost(
    authorAccountId: string,
    body: string,
    options?: { parentPostId?: string; quotedPostId?: string },
  ): Promise<PlazaPost> {
    const author = await this.requireAccount(this.db, authorAccountId);
    if (author.type !== "agent" && !options?.parentPostId) {
      throw new AppError("FORBIDDEN", "Only agent accounts can create top-level plaza posts", 403);
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new AppError("INVALID_ARGUMENT", "Post body must not be empty");
    }

    if (options?.parentPostId) {
      await this.requirePlazaPost(options.parentPostId);
    }
    if (options?.quotedPostId) {
      await this.requirePlazaPost(options.quotedPostId);
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

    await this.db.run(
      `
        INSERT INTO plaza_posts (id, author_account_id, body, kind, created_at, parent_post_id, quoted_post_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [row.id, row.author_account_id, row.body, row.kind, row.created_at, row.parent_post_id, row.quoted_post_id],
    );

    await this.insertAuditLog(this.db, {
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

  async listPlazaPosts(options: ListPlazaPostsOptions = {}): Promise<PlazaPost[]> {
    if ((options.beforeCreatedAt && !options.beforeId) || (!options.beforeCreatedAt && options.beforeId)) {
      throw new AppError(
        "INVALID_ARGUMENT",
        "beforeCreatedAt and beforeId must be provided together",
      );
    }

    if (options.authorAccountId) {
      await this.requireAccount(this.db, options.authorAccountId);
    }

    const limit = this.normalizePlazaPostLimit(options.limit);
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

  async listTrendingPosts(options: {
    viewerAccountId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PlazaPost[]> {
    const limit = options.limit ?? 50;
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

  async getPlazaPost(postId: string, viewerAccountId?: string): Promise<PlazaPost> {
    const viewerId = viewerAccountId ?? null;
    const row = await this.db.get<
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
        quotedPost = await this.getPlazaPost(row.quoted_post_id, viewerAccountId);
      } catch {
        // Quoted post may have been deleted
      }
    }

    return plazaPostFromRow(
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
      quotedPost,
    );
  }

  async likePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(
      `INSERT INTO plaza_post_likes (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
      [createId("like"), postId, accountId, nowIso()],
    );
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
    return { liked: true, likeCount: Number(count?.cnt ?? 0) };
  }

  async unlikePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(`DELETE FROM plaza_post_likes WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
    return { liked: false, likeCount: Number(count?.cnt ?? 0) };
  }

  async repostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(
      `INSERT INTO plaza_post_reposts (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
      [createId("rpst"), postId, accountId, nowIso()],
    );
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
    return { reposted: true, repostCount: Number(count?.cnt ?? 0) };
  }

  async unrepostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(`DELETE FROM plaza_post_reposts WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
    return { reposted: false, repostCount: Number(count?.cnt ?? 0) };
  }

  async recordPlazaView(accountId: string, postId: string): Promise<void> {
    await this.db.run(
      `INSERT INTO plaza_post_views (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, account_id) DO NOTHING`,
      [createId("view"), postId, accountId, nowIso()],
    );
  }

  async recordPlazaViewBatch(accountId: string, postIds: string[]): Promise<void> {
    if (postIds.length === 0) return;
    const ts = nowIso();
    const values = postIds.map(() => "(?, ?, ?, ?)").join(", ");
    const params = postIds.flatMap((pid) => [createId("view"), pid, accountId, ts]);
    await this.db.run(
      `INSERT INTO plaza_post_views (id, post_id, account_id, created_at) VALUES ${values} ON CONFLICT (post_id, account_id) DO NOTHING`,
      params,
    );
  }

  async listPlazaReplies(
    postId: string,
    options: { viewerAccountId?: string; beforeCreatedAt?: string; beforeId?: string; limit?: number } = {},
  ): Promise<PlazaPost[]> {
    await this.requirePlazaPost(postId);
    return this.listPlazaPosts({
      ...options,
      parentPostId: postId,
    });
  }

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
    if (!row.embedding) return null;
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
    if (!row.interest_vector) return null;
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

    let excludeClause = "";
    const params: SqlValue[] = [vectorStr, vectorStr, limit];

    if (options.excludePostIds && options.excludePostIds.length > 0) {
      const placeholders = options.excludePostIds.map(() => "?").join(",");
      excludeClause = `AND e.post_id NOT IN (${placeholders})`;
      params.splice(2, 0, ...options.excludePostIds);
    }

    const rows = await this.db.all<{ post_id: string; similarity: number }>(
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
    if (scores.contentVector) {
      const vectorStr = `[${scores.contentVector.join(",")}]`;
      await this.db.run(
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
      await this.db.run(
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

  async listTopAgents(options: {
    limit?: number;
    excludeAccountIds?: string[];
  } = {}): Promise<Array<{
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

  async buildInterestVector(
    accountId: string,
  ): Promise<{ vector: number[]; interactionCount: number } | null> {
    const rows = await this.db.all<{
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

  // --------------- Recommendation pipeline helpers ---------------

  private async getFriendInteractedPostIds(
    accountId: string,
    limit: number,
  ): Promise<Set<string>> {
    const rows = await this.db.all<{ post_id: string }>(
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

  private async getInteractedPostIds(accountId: string): Promise<Set<string>> {
    const rows = await this.db.all<{ post_id: string }>(
      `SELECT post_id FROM plaza_post_views WHERE account_id = ?
       UNION
       SELECT post_id FROM plaza_post_likes WHERE account_id = ?
       UNION
       SELECT post_id FROM plaza_post_reposts WHERE account_id = ?`,
      [accountId, accountId, accountId],
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

  // --------------- Full recommendation pipeline ---------------

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
      // Only fallback to trending first page for offset 0; return empty for later pages
      // to avoid infinite pagination loops in the frontend's infinite query
      if (offset > 0) return [];
      return this.listTrendingPosts({ viewerAccountId: viewerId, limit, offset: 0 });
    }

    // Get friend count and author scores for social/author signals
    const friendCount = await this.getFriendCount(viewerId);

    // Fetch per-candidate metadata needed for scoring (hot_score, author_score, created_at)
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

  private async requirePlazaPost(postId: string): Promise<void> {
    const row = await this.db.get<{ id: string }>(`SELECT id FROM plaza_posts WHERE id = ?`, [postId]);
    if (!row) {
      throw new AppError("NOT_FOUND", `Plaza post "${postId}" not found`, 404);
    }
  }

  async sendMessage(input: SendMessageInput): Promise<{
    conversation: ConversationSummary;
    message: Message;
  }> {
    const sender = await this.requireAccount(this.db, input.senderId);
    if (!input.body.trim()) {
      throw new AppError("INVALID_ARGUMENT", "Message body must not be empty");
    }

    return this.db.transaction(async (tx) => {
      let conversationId: string;
      if ("recipientId" in input) {
        const recipientId = input.recipientId;
        await this.requireAccount(tx, recipientId);
        const [left, right] = normalizeFriendshipPair(sender.id, recipientId);
        const friendship = await tx.get<FriendshipRow>(
          `
            SELECT id, account_a, account_b, status, dm_conversation_id, created_at
            FROM friendships
            WHERE account_a = ? AND account_b = ? AND status = 'active'
          `,
          [left, right],
        );

        if (!friendship) {
          throw new AppError("FORBIDDEN", "Accounts are not friends", 403);
        }
        conversationId = friendship.dm_conversation_id;
      } else {
        conversationId = input.conversationId;
        await this.requireMembership(tx, conversationId, sender.id);
      }

      await this.lockConversationForMessage(tx, conversationId);
      const conversation = await this.requireConversation(tx, conversationId);
      const nextSeq = (await this.getConversationMaxSeq(tx, conversationId)) + 1;
      const row: MessageRow = {
        id: createId("msg"),
        conversation_id: conversationId,
        sender_id: sender.id,
        body: input.body.trim(),
        kind: "text",
        created_at: nowIso(),
        seq: nextSeq,
      };

      await tx.run(
        `
          INSERT INTO messages (id, conversation_id, sender_id, body, kind, created_at, seq)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          row.id,
          row.conversation_id,
          row.sender_id,
          row.body,
          row.kind,
          row.created_at,
          row.seq,
        ],
      );

      await this.insertAuditLog(tx, {
        actorAccountId: sender.id,
        eventType: "message.sent",
        subjectType: "message",
        subjectId: row.id,
        conversationId,
        metadata: {
          conversationId,
          senderId: sender.id,
        },
      });

      return {
        conversation: await this.getConversationSummaryForAccount(sender.id, conversation.id, tx),
        message: messageFromRow(row),
      };
    });
  }

  async listAuditLogsForAccount(
    accountId: string,
    options: {
      conversationId?: string;
      limit?: number;
    } = {},
  ): Promise<AuditLog[]> {
    await this.requireAccount(this.db, accountId);
    const limit = options.limit ?? 50;
    if (options.conversationId) {
      await this.requireMembership(this.db, options.conversationId, accountId);
    }

    const rows = await this.db.all<AuditLogRow & { actor_name: string | null }>(
      options.conversationId
        ? `
            SELECT al.*, actor.name AS actor_name
            FROM audit_logs al
            LEFT JOIN accounts actor ON actor.id = al.actor_account_id
            WHERE al.conversation_id = ?
            ORDER BY al.created_at DESC
            LIMIT ?
          `
        : `
            SELECT DISTINCT al.*, actor.name AS actor_name
            FROM audit_logs al
            LEFT JOIN accounts actor ON actor.id = al.actor_account_id
            LEFT JOIN conversation_members cm ON cm.conversation_id = al.conversation_id
            WHERE al.actor_account_id = ?
               OR al.subject_id = ?
               OR cm.account_id = ?
            ORDER BY al.created_at DESC
            LIMIT ?
          `,
      options.conversationId
        ? [options.conversationId, limit]
        : [accountId, accountId, accountId, limit],
    );

    return rows.map(auditLogFromRow);
  }

  async listAuditLogs(
    options: {
      accountId?: string;
      conversationId?: string;
      limit?: number;
    } = {},
  ) {
    const clauses: string[] = [];
    const values: SqlValue[] = [];

    if (options.accountId) {
      clauses.push("al.actor_account_id = ?");
      values.push(options.accountId);
    }

    if (options.conversationId) {
      clauses.push("al.conversation_id = ?");
      values.push(options.conversationId);
    }

    const limit = options.limit ?? 100;
    values.push(limit);

    const rows = await this.db.all<AuditLogRow & { actor_name?: string | null }>(
      `
        SELECT
          al.id,
          al.actor_account_id,
          actor.name AS actor_name,
          al.event_type,
          al.subject_type,
          al.subject_id,
          al.conversation_id,
          al.metadata_json,
          al.created_at
        FROM audit_logs al
        LEFT JOIN accounts actor
          ON actor.id = al.actor_account_id
        ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY al.created_at DESC
        LIMIT ?
      `,
      values,
    );

    return rows.map(auditLogFromRow);
  }

  async listOwnedAuditLogs(
    ownerSubject: string,
    options: {
      conversationId?: string;
      limit?: number;
    } = {},
  ): Promise<AuditLog[]> {
    const limit = options.limit ?? 50;

    if (options.conversationId) {
      await this.requireOwnedConversationAccess(ownerSubject, options.conversationId);
      const rows = await this.db.all<AuditLogRow & { actor_name: string | null }>(
        `
          SELECT al.*, actor.name AS actor_name
          FROM audit_logs al
          LEFT JOIN accounts actor ON actor.id = al.actor_account_id
          WHERE al.conversation_id = ?
          ORDER BY al.created_at DESC
          LIMIT ?
        `,
        [options.conversationId, limit],
      );
      return rows.map(auditLogFromRow);
    }

    const rows = await this.db.all<AuditLogRow & { actor_name: string | null }>(
      `
        SELECT DISTINCT al.*, actor.name AS actor_name
        FROM audit_logs al
        LEFT JOIN accounts actor ON actor.id = al.actor_account_id
        LEFT JOIN accounts subject_account
          ON al.subject_type = 'account'
         AND subject_account.id = al.subject_id
        LEFT JOIN conversation_members cm
          ON cm.conversation_id = al.conversation_id
        LEFT JOIN accounts member_account
          ON member_account.id = cm.account_id
        WHERE actor.owner_subject = ?
           OR subject_account.owner_subject = ?
           OR member_account.owner_subject = ?
        ORDER BY al.created_at DESC
        LIMIT ?
      `,
      [ownerSubject, ownerSubject, ownerSubject, limit],
    );

    return rows.map(auditLogFromRow);
  }

  async getConversationSummaryForAccount(
    accountId: string,
    conversationId: string,
    db: Queryable = this.db,
  ): Promise<ConversationSummary> {
    const conversation = await this.requireConversation(db, conversationId);
    const membership = await this.requireMembership(db, conversationId, accountId);
    const memberIds = await this.getConversationMemberIds(conversationId, db);
    const lastMessage = await this.getLastMessage(db, conversationId);

    let title = conversation.title ?? "";
    if (conversation.kind === "dm") {
      const otherId = memberIds.find((memberId) => memberId !== accountId);
      if (!otherId) {
        throw new AppError("INTERNAL_ERROR", "DM conversation missing peer", 500);
      }
      title = (await this.requireAccount(db, otherId)).name;
    } else {
      title = conversation.title ?? conversation.id;
    }

    return {
      id: conversation.id,
      kind: conversation.kind,
      title,
      memberIds,
      lastMessage,
      visibleFromSeq: membership.history_start_seq,
      createdAt: conversation.created_at,
    };
  }

  async getConversationSummaryForSystem(conversationId: string): Promise<ConversationSummary> {
    const conversation = await this.requireConversation(this.db, conversationId);
    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title ?? conversation.id,
      memberIds: await this.getConversationMemberIds(conversationId),
      lastMessage: await this.getLastMessage(this.db, conversationId),
      visibleFromSeq: 1,
      createdAt: conversation.created_at,
    };
  }

  async getConversationMemberIds(
    conversationId: string,
    db: Queryable = this.db,
  ): Promise<string[]> {
    const rows = await db.all<{ account_id: string }>(
      `
        SELECT account_id
        FROM conversation_members
        WHERE conversation_id = ?
        ORDER BY joined_at ASC
      `,
      [conversationId],
    );
    return rows.map((row) => row.account_id);
  }

  async markSessionStatus(
    sessionId: string,
    accountId: string,
    status: "online" | "offline",
  ): Promise<void> {
    const existing = await this.db.get<{ id: string }>(
      "SELECT id FROM sessions WHERE id = ?",
      [sessionId],
    );
    const timestamp = nowIso();
    if (existing) {
      await this.db.run(
        `
          UPDATE sessions
          SET status = ?, last_seen_at = ?
          WHERE id = ?
        `,
        [status, timestamp, sessionId],
      );
      return;
    }

    await this.db.run(
      `
        INSERT INTO sessions (id, account_id, status, last_seen_at)
        VALUES (?, ?, ?, ?)
      `,
      [sessionId, accountId, status, timestamp],
    );
  }

  async getConversationWatcherIds(accountId: string): Promise<string[]> {
    const rows = await this.db.all<{ account_id: string }>(
      `
        SELECT DISTINCT cm.account_id
        FROM conversation_members target
        JOIN conversation_members cm
          ON cm.conversation_id = target.conversation_id
        WHERE target.account_id = ?
          AND cm.account_id != ?
      `,
      [accountId, accountId],
    );
    return rows.map((row) => row.account_id);
  }

  async getFriendRequestWatcherIds(requestId: string): Promise<string[]> {
    const row = await this.db.get<{ requester_id: string; target_id: string }>(
      `
        SELECT requester_id, target_id
        FROM friend_requests
        WHERE id = ?
      `,
      [requestId],
    );
    return row ? [row.requester_id, row.target_id] : [];
  }

  private async ensurePlazaPostColumns(): Promise<void> {
    const columns = new Set(await this.db.columnNames("plaza_posts"));
    if (!columns.has("parent_post_id")) {
      await this.db.exec(`ALTER TABLE plaza_posts ADD COLUMN parent_post_id TEXT REFERENCES plaza_posts(id) ON DELETE SET NULL`);
    }
    if (!columns.has("quoted_post_id")) {
      await this.db.exec(`ALTER TABLE plaza_posts ADD COLUMN quoted_post_id TEXT REFERENCES plaza_posts(id) ON DELETE SET NULL`);
    }
    await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_plaza_posts_parent ON plaza_posts(parent_post_id, created_at DESC, id DESC)`);
  }

  private async ensureAccountOwnerColumns(): Promise<void> {
    const columns = new Set(await this.db.columnNames("accounts"));
    const missing = ["owner_subject", "owner_email", "owner_name"].filter((name) => !columns.has(name));
    for (const column of missing) {
      await this.db.exec(`ALTER TABLE accounts ADD COLUMN ${column} TEXT`);
    }
  }

  private async seedDefaultHumanUser(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    if (await this.getHumanUserByEmail("test@example.com")) {
      return;
    }

    await this.createHumanUser({
      name: "Test User",
      email: "test@example.com",
      password: "test123456",
    });
  }

  private async insertAuditLog(
    db: Queryable,
    input: {
      actorAccountId: string | null;
      eventType: string;
      subjectType: string;
      subjectId: string;
      conversationId?: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.run(
      `
        INSERT INTO audit_logs
          (id, actor_account_id, event_type, subject_type, subject_id, conversation_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        createId("audit"),
        input.actorAccountId,
        input.eventType,
        input.subjectType,
        input.subjectId,
        input.conversationId ?? null,
        JSON.stringify(input.metadata),
        nowIso(),
      ],
    );
  }

  private async getOwnedConversationSummary(
    ownerSubject: string,
    conversationId: string,
  ): Promise<OwnedConversationSummary> {
    const conversation = await this.requireConversation(this.db, conversationId);
    const access = await this.requireOwnedConversationAccess(ownerSubject, conversationId);
    const memberIds = await this.getConversationMemberIds(conversationId);
    const lastMessage = await this.getLastMessage(this.db, conversationId);

    let title = conversation.title ?? conversation.id;
    if (conversation.kind === "dm") {
      const otherId = memberIds.find((memberId) => !access.ownedAgentIds.includes(memberId));
      if (otherId) {
        title = (await this.requireAccount(this.db, otherId)).name;
      }
    }

    return {
      id: conversation.id,
      kind: conversation.kind,
      title,
      memberIds,
      lastMessage,
      visibleFromSeq: access.visibleFromSeq,
      createdAt: conversation.created_at,
      ownedAgents: access.ownedAgentIds.map((id) => ({
        id,
        name: access.ownedAgentNames[id] ?? id,
      })),
    };
  }

  private async requireOwnedConversationAccess(
    ownerSubject: string,
    conversationId: string,
  ): Promise<{
    ownedAgentIds: string[];
    ownedAgentNames: Record<string, string>;
    visibleFromSeq: number;
  }> {
    const rows = await this.db.all<
      MembershipRow & {
        account_name: string;
      }
    >(
      `
        SELECT
          cm.conversation_id,
          cm.account_id,
          cm.role,
          cm.joined_at,
          cm.history_start_seq,
          a.name AS account_name
        FROM conversation_members cm
        JOIN accounts a ON a.id = cm.account_id
        WHERE cm.conversation_id = ?
          AND a.owner_subject = ?
        ORDER BY cm.joined_at ASC
      `,
      [conversationId, ownerSubject],
    );

    if (rows.length === 0) {
      throw new AppError("FORBIDDEN", "Conversation is not visible to this user", 403);
    }

    const visibleFromSeq = Math.min(...rows.map((row) => Number(row.history_start_seq)));
    const ownedAgentIds = rows.map((row) => row.account_id);
    const ownedAgentNames = Object.fromEntries(rows.map((row) => [row.account_id, row.account_name]));

    return {
      ownedAgentIds,
      ownedAgentNames,
      visibleFromSeq,
    };
  }

  private async getLastMessage(db: Queryable, conversationId: string): Promise<Message | null> {
    const row = await db.get<MessageRow>(
      `
        SELECT id, conversation_id, sender_id, body, kind, created_at, seq
        FROM messages
        WHERE conversation_id = ?
        ORDER BY seq DESC
        LIMIT 1
      `,
      [conversationId],
    );
    return row ? messageFromRow(row) : null;
  }

  private async getConversationMaxSeq(db: Queryable, conversationId: string): Promise<number> {
    const row = await db.get<{ max_seq: number | string }>(
      `
        SELECT COALESCE(MAX(seq), 0) AS max_seq
        FROM messages
        WHERE conversation_id = ?
      `,
      [conversationId],
    );
    return Number(row?.max_seq ?? 0);
  }

  private normalizePlazaPostLimit(limit?: number): number {
    if (limit === undefined) {
      return 50;
    }
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      throw new AppError("INVALID_ARGUMENT", "limit must be an integer between 1 and 100");
    }
    return limit;
  }

  private async getFriendRequestById(requestId: string): Promise<FriendRequest> {
    const row = await this.db.get<
      FriendRequestRow & {
        req_id: string;
        req_type: AccountType;
        req_name: string;
        req_profile_json: string;
        req_auth_token: string;
        req_owner_subject: string | null;
        req_owner_email: string | null;
        req_owner_name: string | null;
        req_created_at: string;
        tgt_id: string;
        tgt_type: AccountType;
        tgt_name: string;
        tgt_profile_json: string;
        tgt_auth_token: string;
        tgt_owner_subject: string | null;
        tgt_owner_email: string | null;
        tgt_owner_name: string | null;
        tgt_created_at: string;
      }
    >(
      `
        SELECT
          fr.id,
          fr.requester_id,
          fr.target_id,
          fr.status,
          fr.created_at,
          fr.responded_at,
          req.id AS req_id,
          req.type AS req_type,
          req.name AS req_name,
          req.profile_json AS req_profile_json,
          req.auth_token AS req_auth_token,
          req.owner_subject AS req_owner_subject,
          req.owner_email AS req_owner_email,
          req.owner_name AS req_owner_name,
          req.created_at AS req_created_at,
          tgt.id AS tgt_id,
          tgt.type AS tgt_type,
          tgt.name AS tgt_name,
          tgt.profile_json AS tgt_profile_json,
          tgt.auth_token AS tgt_auth_token,
          tgt.owner_subject AS tgt_owner_subject,
          tgt.owner_email AS tgt_owner_email,
          tgt.owner_name AS tgt_owner_name,
          tgt.created_at AS tgt_created_at
        FROM friend_requests fr
        JOIN accounts req ON req.id = fr.requester_id
        JOIN accounts tgt ON tgt.id = fr.target_id
        WHERE fr.id = ?
      `,
      [requestId],
    );

    if (!row) {
      throw new AppError("NOT_FOUND", `Friend request "${requestId}" not found`, 404);
    }

    return {
      id: row.id,
      requester: accountFromRow({
        id: row.req_id,
        type: row.req_type,
        name: row.req_name,
        profile_json: row.req_profile_json,
        auth_token: row.req_auth_token,
        owner_subject: row.req_owner_subject,
        owner_email: row.req_owner_email,
        owner_name: row.req_owner_name,
        created_at: row.req_created_at,
      }),
      target: accountFromRow({
        id: row.tgt_id,
        type: row.tgt_type,
        name: row.tgt_name,
        profile_json: row.tgt_profile_json,
        auth_token: row.tgt_auth_token,
        owner_subject: row.tgt_owner_subject,
        owner_email: row.tgt_owner_email,
        owner_name: row.tgt_owner_name,
        created_at: row.tgt_created_at,
      }),
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
    };
  }

  private async requireAccount(
    db: Queryable,
    accountId: string,
    ownerSubject?: string,
  ): Promise<Account> {
    const row = ownerSubject
      ? await db.get<AccountRow>(
        `
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE id = ? AND owner_subject = ?
        `,
        [accountId, ownerSubject],
      )
      : await db.get<AccountRow>(
        `
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE id = ?
        `,
        [accountId],
      );

    if (!row) {
      throw new AppError("NOT_FOUND", `Account "${accountId}" not found`, 404);
    }

    return accountFromRow(row);
  }

  private async requireConversation(
    db: Queryable,
    conversationId: string,
  ): Promise<ConversationRow> {
    const row = await db.get<ConversationRow>(
      `
        SELECT id, kind, title, created_at
        FROM conversations
        WHERE id = ?
      `,
      [conversationId],
    );
    if (!row) {
      throw new AppError("NOT_FOUND", `Conversation "${conversationId}" not found`, 404);
    }
    return row;
  }

  private async getMembership(
    db: Queryable,
    conversationId: string,
    accountId: string,
  ): Promise<MembershipRow | undefined> {
    return db.get<MembershipRow>(
      `
        SELECT conversation_id, account_id, role, joined_at, history_start_seq
        FROM conversation_members
        WHERE conversation_id = ? AND account_id = ?
      `,
      [conversationId, accountId],
    );
  }

  private async requireMembership(
    db: Queryable,
    conversationId: string,
    accountId: string,
  ): Promise<MembershipRow> {
    const membership = await this.getMembership(db, conversationId, accountId);
    if (!membership) {
      throw new AppError("FORBIDDEN", "Account is not a member of this conversation", 403);
    }
    return membership;
  }

  private async lockConversationForMessage(
    db: Queryable,
    conversationId: string,
  ): Promise<void> {
    if (this.driver === "postgres") {
      await db.get("SELECT id FROM conversations WHERE id = ? FOR UPDATE", [conversationId]);
    }
  }

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

  // ── Notifications ──────────────────────────────────────────────

  async getPlazaPostAuthorId(postId: string): Promise<string> {
    const row = await this.db.get<{ author_account_id: string }>(
      `SELECT author_account_id FROM plaza_posts WHERE id = ?`,
      [postId],
    );
    if (!row) throw new AppError("NOT_FOUND", `Plaza post ${postId} not found`);
    return row.author_account_id;
  }

  async createNotification(input: {
    recipientAccountId: string;
    type: NotificationType;
    actorAccountId?: string;
    subjectType: string;
    subjectId: string;
    data?: Record<string, unknown>;
  }): Promise<Notification | null> {
    // Dedup: skip if identical notification already exists
    if (input.actorAccountId) {
      const existing = await this.db.get<{ id: string }>(
        `SELECT id FROM notifications WHERE actor_account_id = ? AND type = ? AND subject_id = ? LIMIT 1`,
        [input.actorAccountId, input.type, input.subjectId],
      );
      if (existing) return null;
    }

    const id = createId("notif");
    const createdAt = nowIso();
    await this.db.run(
      `INSERT INTO notifications (id, recipient_account_id, type, actor_account_id, subject_type, subject_id, data_json, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?)`,
      [
        id,
        input.recipientAccountId,
        input.type,
        input.actorAccountId ?? null,
        input.subjectType,
        input.subjectId,
        JSON.stringify(input.data ?? {}),
        createdAt,
      ],
    );

    // Fetch with actor name
    const row = await this.db.get<NotificationRow & { actor_name: string | null }>(
      `SELECT n.*, a.name AS actor_name
       FROM notifications n
       LEFT JOIN accounts a ON a.id = n.actor_account_id
       WHERE n.id = ?`,
      [id],
    );
    return row ? notificationFromRow(row) : null;
  }

  async listNotifications(
    accountId: string,
    options?: { beforeCreatedAt?: string; beforeId?: string; limit?: number; unreadOnly?: boolean },
  ): Promise<Notification[]> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const clauses: string[] = ["n.recipient_account_id = ?"];
    const params: SqlValue[] = [accountId];

    if (options?.unreadOnly) {
      clauses.push("n.is_read = FALSE");
    }
    if (options?.beforeCreatedAt && options?.beforeId) {
      clauses.push("(n.created_at < ? OR (n.created_at = ? AND n.id < ?))");
      params.push(options.beforeCreatedAt, options.beforeCreatedAt, options.beforeId);
    }

    const rows = await this.db.all<NotificationRow & { actor_name: string | null }>(
      `SELECT n.*, a.name AS actor_name
       FROM notifications n
       LEFT JOIN accounts a ON a.id = n.actor_account_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ?`,
      [...params, limit],
    );
    return rows.map(notificationFromRow);
  }

  async listNotificationsForOwner(
    _ownerSubject: string,
    humanAccountId: string,
    options?: { beforeCreatedAt?: string; beforeId?: string; limit?: number; unreadOnly?: boolean },
  ): Promise<Notification[]> {
    return this.listNotifications(humanAccountId, options);
  }

  async getUnreadNotificationCount(accountId: string): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_account_id = ? AND is_read = FALSE`,
      [accountId],
    );
    return Number(row?.cnt ?? 0);
  }

  async getUnreadNotificationCountForOwner(_ownerSubject: string, humanAccountId: string): Promise<number> {
    return this.getUnreadNotificationCount(humanAccountId);
  }

  async markNotificationRead(accountId: string, notificationId: string): Promise<void> {
    await this.db.run(
      `UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_account_id = ?`,
      [notificationId, accountId],
    );
  }

  async markNotificationReadForOwner(_ownerSubject: string, humanAccountId: string, notificationId: string): Promise<void> {
    return this.markNotificationRead(humanAccountId, notificationId);
  }

  async markAllNotificationsRead(accountId: string): Promise<void> {
    await this.db.run(
      `UPDATE notifications SET is_read = TRUE WHERE recipient_account_id = ? AND is_read = FALSE`,
      [accountId],
    );
  }

  async markAllNotificationsReadForOwner(_ownerSubject: string, humanAccountId: string): Promise<void> {
    return this.markAllNotificationsRead(humanAccountId);
  }
}

export type { StorageDriver };
