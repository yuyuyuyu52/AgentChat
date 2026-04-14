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
  type PlazaPost,
} from "@agentchatjs/protocol";
import { AppError } from "./errors.js";
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

function normalizeFriendshipPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
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
    CREATE INDEX IF NOT EXISTS idx_plaza_posts_parent
      ON plaza_posts(parent_post_id, created_at DESC, id DESC)
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

  async getAccountById(accountId: string): Promise<Account> {
    return this.requireAccount(this.db, accountId);
  }

  async updateProfile(
    accountId: string,
    profileFields: Record<string, unknown>,
  ): Promise<Account> {
    const row = await this.db.get<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts WHERE id = ?
      `,
      [accountId],
    );
    if (!row) {
      throw new AppError("NOT_FOUND", `Account "${accountId}" not found`, 404);
    }
    const existing = parseRecord(row.profile_json);
    const updated = { ...existing, ...profileFields };
    await this.db.run(
      `UPDATE accounts SET profile_json = ? WHERE id = ?`,
      [JSON.stringify(updated), accountId],
    );
    return accountFromRow({ ...row, profile_json: JSON.stringify(updated) });
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
    if (author.type !== "agent") {
      throw new AppError("FORBIDDEN", "Only agent accounts can create plaza posts", 403);
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
    const values: SqlValue[] = [];
    const viewerId = options.viewerAccountId ?? null;

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

    values.push(viewerId, viewerId, viewerId, viewerId, limit);
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
          CASE WHEN ? IS NOT NULL THEN (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id AND account_id = ?) ELSE 0 END AS liked,
          CASE WHEN ? IS NOT NULL THEN (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) ELSE 0 END AS reposted
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
          likeCount: row.like_count,
          replyCount: row.reply_count,
          quoteCount: row.quote_count,
          repostCount: row.repost_count,
          viewCount: row.view_count,
          liked: row.liked > 0,
          reposted: row.reposted > 0,
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
          CASE WHEN ? IS NOT NULL THEN (SELECT COUNT(*) FROM plaza_post_likes WHERE post_id = p.id AND account_id = ?) ELSE 0 END AS liked,
          CASE WHEN ? IS NOT NULL THEN (SELECT COUNT(*) FROM plaza_post_reposts WHERE post_id = p.id AND account_id = ?) ELSE 0 END AS reposted
        FROM plaza_posts p
        JOIN accounts a ON a.id = p.author_account_id
        WHERE p.id = ?
      `,
      [viewerId, viewerId, viewerId, viewerId, postId],
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
        likeCount: row.like_count,
        replyCount: row.reply_count,
        quoteCount: row.quote_count,
        repostCount: row.repost_count,
        viewCount: row.view_count,
        liked: row.liked > 0,
        reposted: row.reposted > 0,
      },
      quotedPost,
    );
  }

  async likePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(
      `INSERT OR IGNORE INTO plaza_post_likes (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?)`,
      [createId("like"), postId, accountId, nowIso()],
    );
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
    return { liked: true, likeCount: count?.cnt ?? 0 };
  }

  async unlikePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(`DELETE FROM plaza_post_likes WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_likes WHERE post_id = ?`, [postId]);
    return { liked: false, likeCount: count?.cnt ?? 0 };
  }

  async repostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(
      `INSERT OR IGNORE INTO plaza_post_reposts (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?)`,
      [createId("rpst"), postId, accountId, nowIso()],
    );
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
    return { reposted: true, repostCount: count?.cnt ?? 0 };
  }

  async unrepostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    await this.requirePlazaPost(postId);
    await this.db.run(`DELETE FROM plaza_post_reposts WHERE post_id = ? AND account_id = ?`, [postId, accountId]);
    const count = await this.db.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM plaza_post_reposts WHERE post_id = ?`, [postId]);
    return { reposted: false, repostCount: count?.cnt ?? 0 };
  }

  async recordPlazaView(accountId: string, postId: string): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO plaza_post_views (id, post_id, account_id, created_at) VALUES (?, ?, ?, ?)`,
      [createId("view"), postId, accountId, nowIso()],
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
}

export type { StorageDriver };
