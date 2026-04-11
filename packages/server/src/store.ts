import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type Account,
  type AccountType,
  type AuthAccount,
  type ConversationKind,
  type ConversationSummary,
  DEFAULT_GROUP_HISTORY_LIMIT,
  type FriendRecord,
  type Message,
} from "@agentchat/protocol";
import { AppError } from "./errors.js";

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

type OwnedConversationRow = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
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
    seq: row.seq,
  };
}

function normalizeFriendshipPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

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

export class AgentChatStore {
  readonly db: DatabaseSync;
  readonly databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  createAccount(input: CreateAccountInput): AuthAccount {
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
      this.db
        .prepare(
          `
            INSERT INTO accounts (
              id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          row.id,
          row.type,
          row.name,
          row.profile_json,
          row.auth_token,
          row.owner_subject,
          row.owner_email,
          row.owner_name,
          row.created_at,
        );
    } catch (error) {
      throw new AppError("CONFLICT", `Account name "${row.name}" already exists`, 409);
    }

    return {
      ...accountFromRow(row),
      token,
    };
  }

  listAccounts(ownerSubject?: string): Account[] {
    const statement = ownerSubject
      ? this.db.prepare(
          `
            SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
            FROM accounts
            WHERE owner_subject = ?
            ORDER BY created_at ASC
          `,
        )
      : this.db.prepare(
          `
            SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
            FROM accounts
            ORDER BY created_at ASC
          `,
        );
    const rows = (ownerSubject ? statement.all(ownerSubject) : statement.all()) as AccountRow[];

    return rows.map(accountFromRow);
  }

  authenticateAccount(accountId: string, token: string): Account {
    const row = this.db
      .prepare(
        `
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE id = ? AND auth_token = ?
        `,
      )
      .get(accountId, token) as AccountRow | undefined;

    if (!row) {
      throw new AppError("UNAUTHORIZED", "Invalid account credentials", 401);
    }

    return accountFromRow(row);
  }

  resetToken(accountId: string, ownerSubject?: string): { accountId: string; token: string } {
    this.requireAccount(accountId, ownerSubject);
    const token = randomUUID();
    this.db
      .prepare("UPDATE accounts SET auth_token = ? WHERE id = ?")
      .run(token, accountId);
    return { accountId, token };
  }

  createFriendship(accountA: string, accountB: string): {
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  } {
    if (accountA === accountB) {
      throw new AppError("INVALID_ARGUMENT", "Cannot friend the same account");
    }

    this.requireAccount(accountA);
    this.requireAccount(accountB);

    const [left, right] = normalizeFriendshipPair(accountA, accountB);
    const existing = this.db
      .prepare(
        `
          SELECT id, account_a, account_b, status, dm_conversation_id, created_at
          FROM friendships
          WHERE account_a = ? AND account_b = ? AND status = 'active'
        `,
      )
      .get(left, right) as FriendshipRow | undefined;

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

    this.transaction(() => {
      this.db
        .prepare(
          `
            INSERT INTO conversations (id, kind, title, created_at)
            VALUES (?, 'dm', NULL, ?)
          `,
        )
        .run(conversationId, createdAt);

      this.db
        .prepare(
          `
            INSERT INTO conversation_members
              (conversation_id, account_id, role, joined_at, history_start_seq)
            VALUES (?, ?, 'member', ?, 1)
          `,
        )
        .run(conversationId, left, createdAt);

      this.db
        .prepare(
          `
            INSERT INTO conversation_members
              (conversation_id, account_id, role, joined_at, history_start_seq)
            VALUES (?, ?, 'member', ?, 1)
          `,
        )
        .run(conversationId, right, createdAt);

      this.db
        .prepare(
          `
            INSERT INTO friendships
              (id, account_a, account_b, status, dm_conversation_id, created_at)
            VALUES (?, ?, ?, 'active', ?, ?)
          `,
        )
        .run(friendshipId, left, right, conversationId, createdAt);
    });

    return {
      friendshipId,
      conversationId,
      createdAt,
    };
  }

  listFriends(accountId: string): FriendRecord[] {
    this.requireAccount(accountId);
    const rows = this.db
      .prepare(
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
      )
      .all(accountId, accountId, accountId) as (AccountRow & {
      dm_conversation_id: string;
      friendship_created_at: string;
    })[];

    return rows.map((row) => ({
      account: accountFromRow(row),
      conversationId: row.dm_conversation_id,
      createdAt: row.friendship_created_at,
    }));
  }

  createGroup(title: string): ConversationSummary {
    const conversationId = createId("conv");
    const createdAt = nowIso();
    this.db
      .prepare(
        `
          INSERT INTO conversations (id, kind, title, created_at)
          VALUES (?, 'group', ?, ?)
        `,
      )
      .run(conversationId, title, createdAt);
    return this.getConversationSummaryForSystem(conversationId);
  }

  createGroupAs(creatorId: string, title: string): ConversationSummary {
    this.requireAccount(creatorId);
    const conversationId = createId("conv");
    const createdAt = nowIso();

    this.transaction(() => {
      this.db
        .prepare(
          `
            INSERT INTO conversations (id, kind, title, created_at)
            VALUES (?, 'group', ?, ?)
          `,
        )
        .run(conversationId, title, createdAt);

      this.db
        .prepare(
          `
            INSERT INTO conversation_members
              (conversation_id, account_id, role, joined_at, history_start_seq)
            VALUES (?, ?, 'owner', ?, 1)
          `,
        )
        .run(conversationId, creatorId, createdAt);
    });

    return this.getConversationSummaryForAccount(creatorId, conversationId);
  }

  addFriendAs(actorId: string, peerAccountId: string): {
    friendshipId: string;
    conversationId: string;
    createdAt: string;
  } {
    this.requireAccount(actorId);
    this.requireAccount(peerAccountId);
    return this.createFriendship(actorId, peerAccountId);
  }

  addGroupMember(conversationId: string, accountId: string): ConversationSummary {
    const conversation = this.requireConversation(conversationId);
    if (conversation.kind !== "group") {
      throw new AppError("INVALID_ARGUMENT", "Can only add members to group conversations");
    }

    this.requireAccount(accountId);
    const existing = this.getMembership(conversationId, accountId);
    if (!existing) {
      const maxSeq = this.getConversationMaxSeq(conversationId);
      const historyStartSeq = Math.max(
        1,
        maxSeq === 0 ? 1 : maxSeq - DEFAULT_GROUP_HISTORY_LIMIT + 1,
      );
      this.db
        .prepare(
          `
            INSERT INTO conversation_members
              (conversation_id, account_id, role, joined_at, history_start_seq)
            VALUES (?, ?, 'member', ?, ?)
          `,
        )
        .run(conversationId, accountId, nowIso(), historyStartSeq);
    }

    return this.getConversationSummaryForAccount(accountId, conversationId);
  }

  addGroupMemberAs(
    actorId: string,
    conversationId: string,
    accountId: string,
  ): ConversationSummary {
    this.requireMembership(conversationId, actorId);
    return this.addGroupMember(conversationId, accountId);
  }

  listGroups(accountId: string): ConversationSummary[] {
    this.requireAccount(accountId);
    const ids = this.db
      .prepare(
        `
          SELECT c.id
          FROM conversations c
          JOIN conversation_members cm ON cm.conversation_id = c.id
          WHERE c.kind = 'group' AND cm.account_id = ?
          ORDER BY c.created_at ASC
        `,
      )
      .all(accountId) as Array<{ id: string }>;

    return ids.map(({ id }) => this.getConversationSummaryForAccount(accountId, id));
  }

  listConversationMembers(accountId: string, conversationId: string): Account[] {
    this.requireMembership(conversationId, accountId);
    const rows = this.db
      .prepare(
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
      )
      .all(conversationId) as AccountRow[];
    return rows.map(accountFromRow);
  }

  listConversations(accountId: string): ConversationSummary[] {
    this.requireAccount(accountId);
    const rows = this.db
      .prepare(
        `
          SELECT conversation_id
          FROM conversation_members
          WHERE account_id = ?
          ORDER BY joined_at ASC
        `,
      )
      .all(accountId) as Array<{ conversation_id: string }>;

    return rows.map(({ conversation_id }) =>
      this.getConversationSummaryForAccount(accountId, conversation_id),
    );
  }

  listOwnedConversations(ownerSubject: string): OwnedConversationSummary[] {
    const conversations = this.db
      .prepare(
        `
          SELECT DISTINCT c.id, c.kind, c.title, c.created_at
          FROM conversations c
          JOIN conversation_members cm ON cm.conversation_id = c.id
          JOIN accounts a ON a.id = cm.account_id
          WHERE a.owner_subject = ?
          ORDER BY COALESCE((
            SELECT MAX(m.seq)
            FROM messages m
            WHERE m.conversation_id = c.id
          ), 0) DESC, c.created_at DESC
        `,
      )
      .all(ownerSubject) as OwnedConversationRow[];

    return conversations.map((conversation) =>
      this.getOwnedConversationSummary(ownerSubject, conversation.id),
    );
  }

  listOwnedConversationMessages(
    ownerSubject: string,
    conversationId: string,
    before?: number,
    limit = 50,
  ): OwnedConversationMessage[] {
    const access = this.requireOwnedConversationAccess(ownerSubject, conversationId);
    const rows = before
      ? (this.db
          .prepare(
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
          )
          .all(conversationId, access.visibleFromSeq, before, limit) as Array<
          MessageRow & { sender_name: string }
        >)
      : (this.db
          .prepare(
            `
              SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.created_at, m.seq, a.name AS sender_name
              FROM messages m
              JOIN accounts a ON a.id = m.sender_id
              WHERE m.conversation_id = ?
                AND m.seq >= ?
              ORDER BY m.seq DESC
              LIMIT ?
            `,
          )
          .all(conversationId, access.visibleFromSeq, limit) as Array<
          MessageRow & { sender_name: string }
        >);

    return rows.reverse().map((row) => ({
      ...messageFromRow(row),
      senderName: row.sender_name,
    }));
  }

  listMessages(
    accountId: string,
    conversationId: string,
    before?: number,
    limit = 50,
  ): Message[] {
    const membership = this.requireMembership(conversationId, accountId);

    const rows = before
      ? (this.db
          .prepare(
            `
              SELECT id, conversation_id, sender_id, body, kind, created_at, seq
              FROM messages
              WHERE conversation_id = ?
                AND seq >= ?
                AND seq < ?
              ORDER BY seq DESC
              LIMIT ?
            `,
          )
          .all(
            conversationId,
            membership.history_start_seq,
            before,
            limit,
          ) as MessageRow[])
      : (this.db
          .prepare(
            `
              SELECT id, conversation_id, sender_id, body, kind, created_at, seq
              FROM messages
              WHERE conversation_id = ?
                AND seq >= ?
              ORDER BY seq DESC
              LIMIT ?
            `,
          )
          .all(conversationId, membership.history_start_seq, limit) as MessageRow[]);

    return rows.reverse().map(messageFromRow);
  }

  sendMessage(input: SendMessageInput): {
    conversation: ConversationSummary;
    message: Message;
  } {
    const sender = this.requireAccount(input.senderId);
    if (!input.body.trim()) {
      throw new AppError("INVALID_ARGUMENT", "Message body must not be empty");
    }

    let conversationId: string;
    if ("recipientId" in input) {
      const recipientId = input.recipientId;
      this.requireAccount(recipientId);
      const [left, right] = normalizeFriendshipPair(sender.id, recipientId);
      const friendship = this.db
        .prepare(
          `
            SELECT id, account_a, account_b, status, dm_conversation_id, created_at
            FROM friendships
            WHERE account_a = ? AND account_b = ? AND status = 'active'
          `,
        )
        .get(left, right) as FriendshipRow | undefined;

      if (!friendship) {
        throw new AppError("FORBIDDEN", "Accounts are not friends", 403);
      }
      conversationId = friendship.dm_conversation_id;
    } else {
      conversationId = input.conversationId;
      this.requireMembership(conversationId, sender.id);
    }

    const conversation = this.requireConversation(conversationId);
    const nextSeq = this.getConversationMaxSeq(conversationId) + 1;
    const row: MessageRow = {
      id: createId("msg"),
      conversation_id: conversationId,
      sender_id: sender.id,
      body: input.body.trim(),
      kind: "text",
      created_at: nowIso(),
      seq: nextSeq,
    };

    this.db
      .prepare(
        `
          INSERT INTO messages (id, conversation_id, sender_id, body, kind, created_at, seq)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        row.id,
        row.conversation_id,
        row.sender_id,
        row.body,
        row.kind,
        row.created_at,
        row.seq,
      );

    return {
      conversation: this.getConversationSummaryForAccount(sender.id, conversation.id),
      message: messageFromRow(row),
    };
  }

  getConversationSummaryForAccount(
    accountId: string,
    conversationId: string,
  ): ConversationSummary {
    const conversation = this.requireConversation(conversationId);
    const membership = this.requireMembership(conversationId, accountId);
    const memberIds = this.getConversationMemberIds(conversationId);
    const lastMessage = this.getLastMessage(conversationId);

    let title = conversation.title ?? "";
    if (conversation.kind === "dm") {
      const otherId = memberIds.find((memberId) => memberId !== accountId);
      if (!otherId) {
        throw new AppError("INTERNAL_ERROR", "DM conversation missing peer", 500);
      }
      title = this.requireAccount(otherId).name;
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

  getConversationSummaryForSystem(conversationId: string): ConversationSummary {
    const conversation = this.requireConversation(conversationId);
    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title ?? conversation.id,
      memberIds: this.getConversationMemberIds(conversationId),
      lastMessage: this.getLastMessage(conversationId),
      visibleFromSeq: 1,
      createdAt: conversation.created_at,
    };
  }

  getConversationMemberIds(conversationId: string): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT account_id
          FROM conversation_members
          WHERE conversation_id = ?
          ORDER BY joined_at ASC
        `,
      )
      .all(conversationId) as Array<{ account_id: string }>;
    return rows.map((row) => row.account_id);
  }

  markSessionStatus(sessionId: string, accountId: string, status: "online" | "offline"): void {
    const existing = this.db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get(sessionId) as { id: string } | undefined;
    const timestamp = nowIso();
    if (existing) {
      this.db
        .prepare(
          `
            UPDATE sessions
            SET status = ?, last_seen_at = ?
            WHERE id = ?
          `,
        )
        .run(status, timestamp, sessionId);
      return;
    }

    this.db
      .prepare(
        `
          INSERT INTO sessions (id, account_id, status, last_seen_at)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(sessionId, accountId, status, timestamp);
  }

  getConversationWatcherIds(accountId: string): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT DISTINCT cm.account_id
          FROM conversation_members target
          JOIN conversation_members cm
            ON cm.conversation_id = target.conversation_id
          WHERE target.account_id = ?
            AND cm.account_id != ?
        `,
      )
      .all(accountId, accountId) as Array<{ account_id: string }>;
    return rows.map((row) => row.account_id);
  }

  private getLastMessage(conversationId: string): Message | null {
    const row = this.db
      .prepare(
        `
          SELECT id, conversation_id, sender_id, body, kind, created_at, seq
          FROM messages
          WHERE conversation_id = ?
          ORDER BY seq DESC
          LIMIT 1
        `,
      )
      .get(conversationId) as MessageRow | undefined;
    return row ? messageFromRow(row) : null;
  }

  private getConversationMaxSeq(conversationId: string): number {
    const row = this.db
      .prepare(
        `
          SELECT COALESCE(MAX(seq), 0) AS max_seq
          FROM messages
          WHERE conversation_id = ?
        `,
      )
      .get(conversationId) as { max_seq: number };
    return row.max_seq;
  }

  private requireAccount(accountId: string, ownerSubject?: string): Account {
    const statement = ownerSubject
      ? this.db.prepare(
          `
            SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
            FROM accounts
            WHERE id = ? AND owner_subject = ?
          `,
        )
      : this.db.prepare(
          `
            SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
            FROM accounts
            WHERE id = ?
          `,
        );
    const row = (ownerSubject
      ? statement.get(accountId, ownerSubject)
      : statement.get(accountId)) as AccountRow | undefined;

    if (!row) {
      throw new AppError("NOT_FOUND", `Account "${accountId}" not found`, 404);
    }

    return accountFromRow(row);
  }

  private requireConversation(conversationId: string): ConversationRow {
    const row = this.db
      .prepare(
        `
          SELECT id, kind, title, created_at
          FROM conversations
          WHERE id = ?
        `,
      )
      .get(conversationId) as ConversationRow | undefined;
    if (!row) {
      throw new AppError("NOT_FOUND", `Conversation "${conversationId}" not found`, 404);
    }
    return row;
  }

  private getMembership(
    conversationId: string,
    accountId: string,
  ): MembershipRow | undefined {
    return this.db
      .prepare(
        `
          SELECT conversation_id, account_id, role, joined_at, history_start_seq
          FROM conversation_members
          WHERE conversation_id = ? AND account_id = ?
        `,
      )
      .get(conversationId, accountId) as MembershipRow | undefined;
  }

  private requireMembership(conversationId: string, accountId: string): MembershipRow {
    const membership = this.getMembership(conversationId, accountId);
    if (!membership) {
      throw new AppError("FORBIDDEN", "Account is not a member of this conversation", 403);
    }
    return membership;
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private initSchema(): void {
    this.db.exec(`
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
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        account_a TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        account_b TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        dm_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE(account_a, account_b)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        history_start_seq INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (conversation_id, account_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        seq INTEGER NOT NULL,
        UNIQUE(conversation_id, seq)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_members_account
        ON conversation_members(account_id);

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_seq
        ON messages(conversation_id, seq);

      CREATE INDEX IF NOT EXISTS idx_accounts_owner_subject
        ON accounts(owner_subject);
    `);

    const columns = this.db.prepare("PRAGMA table_info(accounts)").all() as Array<{
      name: string;
    }>;
    const names = new Set(columns.map((column) => column.name));

    if (!names.has("owner_subject")) {
      this.db.exec("ALTER TABLE accounts ADD COLUMN owner_subject TEXT;");
    }
    if (!names.has("owner_email")) {
      this.db.exec("ALTER TABLE accounts ADD COLUMN owner_email TEXT;");
    }
    if (!names.has("owner_name")) {
      this.db.exec("ALTER TABLE accounts ADD COLUMN owner_name TEXT;");
    }
  }

  private getOwnedConversationSummary(
    ownerSubject: string,
    conversationId: string,
  ): OwnedConversationSummary {
    const conversation = this.requireConversation(conversationId);
    const access = this.requireOwnedConversationAccess(ownerSubject, conversationId);
    const memberIds = this.getConversationMemberIds(conversationId);
    const lastMessage = this.getLastMessage(conversationId);

    let title = conversation.title ?? conversation.id;
    if (conversation.kind === "dm") {
      const otherId = memberIds.find((memberId) => !access.ownedAgentIds.includes(memberId));
      if (otherId) {
        title = this.requireAccount(otherId).name;
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
      ownedAgents: access.ownedAgents,
    };
  }

  private requireOwnedConversationAccess(
    ownerSubject: string,
    conversationId: string,
  ): {
    visibleFromSeq: number;
    ownedAgents: Array<{ id: string; name: string }>;
    ownedAgentIds: string[];
  } {
    const rows = this.db
      .prepare(
        `
          SELECT a.id, a.name, cm.history_start_seq
          FROM conversation_members cm
          JOIN accounts a ON a.id = cm.account_id
          WHERE cm.conversation_id = ?
            AND a.owner_subject = ?
          ORDER BY a.name ASC
        `,
      )
      .all(conversationId, ownerSubject) as Array<{
      id: string;
      name: string;
      history_start_seq: number;
    }>;

    if (rows.length === 0) {
      throw new AppError("FORBIDDEN", "Conversation is not visible to this user", 403);
    }

    return {
      visibleFromSeq: Math.min(...rows.map((row) => row.history_start_seq)),
      ownedAgents: rows.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      ownedAgentIds: rows.map((row) => row.id),
    };
  }
}
