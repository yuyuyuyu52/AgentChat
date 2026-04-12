import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DEFAULT_GROUP_HISTORY_LIMIT, } from "@agentchat/protocol";
import { AppError } from "./errors.js";
import { createDatabaseAdapter, resolveStorageDriver, } from "./db.js";
function nowIso() {
    return new Date().toISOString();
}
function parseRecord(value) {
    return JSON.parse(value);
}
function accountFromRow(row) {
    return {
        id: row.id,
        type: row.type,
        name: row.name,
        profile: parseRecord(row.profile_json),
        createdAt: row.created_at,
    };
}
function messageFromRow(row) {
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
function plazaPostFromRow(row, author) {
    return {
        id: row.id,
        author,
        body: row.body,
        kind: row.kind,
        createdAt: row.created_at,
    };
}
function auditLogFromRow(row) {
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
function normalizeFriendshipPair(a, b) {
    return a < b ? [a, b] : [b, a];
}
function createId(prefix) {
    return `${prefix}_${randomUUID()}`;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password, encodedHash) {
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
function humanUserFromRow(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.created_at,
    };
}
function uniqueViolation(error, driver) {
    if (!(error instanceof Error)) {
        return false;
    }
    if (driver === "postgres") {
        return "code" in error && error.code === "23505";
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
];
export class AgentChatStore {
    databasePath;
    driver;
    db;
    initialized = false;
    constructor(options) {
        this.driver = resolveStorageDriver({
            ...(options.driver ? { driver: options.driver } : {}),
            ...(options.databaseUrl ? { databaseUrl: options.databaseUrl } : {}),
        });
        this.db = createDatabaseAdapter(options);
        this.databasePath = this.db.descriptor;
    }
    async initialize() {
        if (this.initialized) {
            return;
        }
        for (const statement of BASE_SCHEMA) {
            await this.db.exec(statement);
        }
        await this.ensureAccountOwnerColumns();
        await this.seedDefaultHumanUser();
        this.initialized = true;
    }
    async close() {
        await this.db.close();
    }
    async createAccount(input) {
        const createdAt = nowIso();
        const token = randomUUID();
        const row = {
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
            await this.db.run(`
          INSERT INTO accounts (
            id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                row.id,
                row.type,
                row.name,
                row.profile_json,
                row.auth_token,
                row.owner_subject,
                row.owner_email,
                row.owner_name,
                row.created_at,
            ]);
        }
        catch (error) {
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
    async listAccounts(ownerSubject) {
        const rows = ownerSubject
            ? await this.db.all(`
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE owner_subject = ?
          ORDER BY created_at ASC
        `, [ownerSubject])
            : await this.db.all(`
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          ORDER BY created_at ASC
        `);
        return rows.map(accountFromRow);
    }
    async authenticateAccount(accountId, token) {
        const row = await this.db.get(`
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE id = ? AND auth_token = ?
      `, [accountId, token]);
        if (!row) {
            throw new AppError("UNAUTHORIZED", "Invalid account credentials", 401);
        }
        return accountFromRow(row);
    }
    async resetToken(accountId, ownerSubject) {
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
    async createHumanUser(input) {
        const createdAt = nowIso();
        const row = {
            id: createId("user"),
            email: normalizeEmail(input.email),
            name: input.name.trim(),
            password_hash: hashPassword(input.password),
            created_at: createdAt,
        };
        try {
            await this.db.run(`
          INSERT INTO human_users (
            id, email, name, password_hash, created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `, [row.id, row.email, row.name, row.password_hash, row.created_at]);
        }
        catch (error) {
            if (uniqueViolation(error, this.driver)) {
                throw new AppError("CONFLICT", `User email "${row.email}" already exists`, 409);
            }
            throw error;
        }
        return humanUserFromRow(row);
    }
    async authenticateHumanUser(email, password) {
        const normalizedEmail = normalizeEmail(email);
        const row = await this.db.get(`
        SELECT id, email, name, password_hash, created_at
        FROM human_users
        WHERE email = ?
      `, [normalizedEmail]);
        if (!row || !verifyPassword(password, row.password_hash)) {
            throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
        }
        return humanUserFromRow(row);
    }
    async getHumanUserByEmail(email) {
        const row = await this.db.get(`
        SELECT id, email, name, password_hash, created_at
        FROM human_users
        WHERE email = ?
      `, [normalizeEmail(email)]);
        return row ? humanUserFromRow(row) : undefined;
    }
    async createFriendship(accountA, accountB) {
        if (accountA === accountB) {
            throw new AppError("INVALID_ARGUMENT", "Cannot friend the same account");
        }
        return this.db.transaction(async (tx) => {
            await this.requireAccount(tx, accountA);
            await this.requireAccount(tx, accountB);
            const [left, right] = normalizeFriendshipPair(accountA, accountB);
            const existing = await tx.get(`
          SELECT id, account_a, account_b, status, dm_conversation_id, created_at
          FROM friendships
          WHERE account_a = ? AND account_b = ? AND status = 'active'
        `, [left, right]);
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
            await tx.run(`
          INSERT INTO conversations (id, kind, title, created_at)
          VALUES (?, 'dm', NULL, ?)
        `, [conversationId, createdAt]);
            await tx.run(`
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, 1)
        `, [conversationId, left, createdAt]);
            await tx.run(`
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, 1)
        `, [conversationId, right, createdAt]);
            await tx.run(`
          INSERT INTO friendships
            (id, account_a, account_b, status, dm_conversation_id, created_at)
          VALUES (?, ?, ?, 'active', ?, ?)
        `, [friendshipId, left, right, conversationId, createdAt]);
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
    async listFriends(accountId) {
        await this.requireAccount(this.db, accountId);
        const rows = await this.db.all(`
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
      `, [accountId, accountId, accountId]);
        return rows.map((row) => ({
            account: accountFromRow(row),
            conversationId: row.dm_conversation_id,
            createdAt: row.friendship_created_at,
        }));
    }
    async createGroup(title) {
        const conversationId = createId("conv");
        const createdAt = nowIso();
        await this.db.run(`
        INSERT INTO conversations (id, kind, title, created_at)
        VALUES (?, 'group', ?, ?)
      `, [conversationId, title, createdAt]);
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
    async createGroupAs(creatorId, title) {
        await this.requireAccount(this.db, creatorId);
        const conversationId = createId("conv");
        const createdAt = nowIso();
        await this.db.transaction(async (tx) => {
            await tx.run(`
          INSERT INTO conversations (id, kind, title, created_at)
          VALUES (?, 'group', ?, ?)
        `, [conversationId, title, createdAt]);
            await tx.run(`
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'owner', ?, 1)
        `, [conversationId, creatorId, createdAt]);
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
    async addFriendAs(actorId, peerAccountId) {
        await this.requireAccount(this.db, actorId);
        await this.requireAccount(this.db, peerAccountId);
        if (actorId === peerAccountId) {
            throw new AppError("INVALID_ARGUMENT", "Cannot send a friend request to self");
        }
        const [left, right] = normalizeFriendshipPair(actorId, peerAccountId);
        const active = await this.db.get(`
        SELECT id
        FROM friendships
        WHERE account_a = ? AND account_b = ? AND status = 'active'
      `, [left, right]);
        if (active) {
            throw new AppError("CONFLICT", "Accounts are already friends", 409);
        }
        const pendingSameDirection = await this.db.get(`
        SELECT id, requester_id, target_id, status, created_at, responded_at
        FROM friend_requests
        WHERE requester_id = ? AND target_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `, [actorId, peerAccountId]);
        if (pendingSameDirection) {
            return {
                requestId: pendingSameDirection.id,
                createdAt: pendingSameDirection.created_at,
            };
        }
        const reversePending = await this.db.get(`
        SELECT id
        FROM friend_requests
        WHERE requester_id = ? AND target_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      `, [peerAccountId, actorId]);
        if (reversePending) {
            throw new AppError("CONFLICT", "There is already an incoming friend request from this account", 409);
        }
        const requestId = createId("freq");
        const createdAt = nowIso();
        await this.db.run(`
        INSERT INTO friend_requests
          (id, requester_id, target_id, status, created_at, responded_at)
        VALUES (?, ?, ?, 'pending', ?, NULL)
      `, [requestId, actorId, peerAccountId, createdAt]);
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
    async listFriendRequests(accountId, direction = "all") {
        await this.requireAccount(this.db, accountId);
        const where = direction === "incoming"
            ? "fr.target_id = ?"
            : direction === "outgoing"
                ? "fr.requester_id = ?"
                : "(fr.requester_id = ? OR fr.target_id = ?)";
        const params = direction === "all" ? [accountId, accountId] : [accountId];
        const rows = await this.db.all(`
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
      `, params);
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
    async respondFriendRequestAs(actorId, requestId, action) {
        await this.requireAccount(this.db, actorId);
        const request = await this.db.get(`
        SELECT id, requester_id, target_id, status, created_at, responded_at
        FROM friend_requests
        WHERE id = ?
      `, [requestId]);
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
        await this.db.run(`
        UPDATE friend_requests
        SET status = ?, responded_at = ?
        WHERE id = ?
      `, [action === "accept" ? "accepted" : "rejected", respondedAt, requestId]);
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
    async addGroupMember(conversationId, accountId) {
        const conversation = await this.requireConversation(this.db, conversationId);
        if (conversation.kind !== "group") {
            throw new AppError("INVALID_ARGUMENT", "Can only add members to group conversations");
        }
        await this.requireAccount(this.db, accountId);
        const existing = await this.getMembership(this.db, conversationId, accountId);
        if (!existing) {
            const maxSeq = await this.getConversationMaxSeq(this.db, conversationId);
            const historyStartSeq = Math.max(1, maxSeq === 0 ? 1 : maxSeq - DEFAULT_GROUP_HISTORY_LIMIT + 1);
            await this.db.run(`
          INSERT INTO conversation_members
            (conversation_id, account_id, role, joined_at, history_start_seq)
          VALUES (?, ?, 'member', ?, ?)
        `, [conversationId, accountId, nowIso(), historyStartSeq]);
        }
        return this.getConversationSummaryForAccount(accountId, conversationId);
    }
    async addGroupMemberAs(actorId, conversationId, accountId) {
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
    async listGroups(accountId) {
        await this.requireAccount(this.db, accountId);
        const ids = await this.db.all(`
        SELECT c.id
        FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id = c.id
        WHERE c.kind = 'group' AND cm.account_id = ?
        ORDER BY c.created_at ASC
      `, [accountId]);
        return Promise.all(ids.map(async ({ id }) => this.getConversationSummaryForAccount(accountId, id)));
    }
    async listConversationMembers(accountId, conversationId) {
        await this.requireMembership(this.db, conversationId, accountId);
        const rows = await this.db.all(`
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE id IN (
          SELECT account_id
          FROM conversation_members
          WHERE conversation_id = ?
        )
        ORDER BY name ASC
      `, [conversationId]);
        return rows.map(accountFromRow);
    }
    async listConversations(accountId) {
        await this.requireAccount(this.db, accountId);
        const rows = await this.db.all(`
        SELECT conversation_id
        FROM conversation_members
        WHERE account_id = ?
        ORDER BY joined_at ASC
      `, [accountId]);
        return Promise.all(rows.map(async ({ conversation_id }) => this.getConversationSummaryForAccount(accountId, conversation_id)));
    }
    async listOwnedConversations(ownerSubject) {
        const conversations = await this.db.all(`
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
      `, [ownerSubject]);
        return Promise.all(conversations.map(async (conversation) => this.getOwnedConversationSummary(ownerSubject, conversation.id)));
    }
    async listOwnedConversationMessages(ownerSubject, conversationId, before, limit = 50) {
        const access = await this.requireOwnedConversationAccess(ownerSubject, conversationId);
        const rows = before
            ? await this.db.all(`
          SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.created_at, m.seq, a.name AS sender_name
          FROM messages m
          JOIN accounts a ON a.id = m.sender_id
          WHERE m.conversation_id = ?
            AND m.seq >= ?
            AND m.seq < ?
          ORDER BY m.seq DESC
          LIMIT ?
        `, [conversationId, access.visibleFromSeq, before, limit])
            : await this.db.all(`
          SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.created_at, m.seq, a.name AS sender_name
          FROM messages m
          JOIN accounts a ON a.id = m.sender_id
          WHERE m.conversation_id = ?
            AND m.seq >= ?
          ORDER BY m.seq DESC
          LIMIT ?
        `, [conversationId, access.visibleFromSeq, limit]);
        return rows.reverse().map((row) => ({
            ...messageFromRow(row),
            senderName: row.sender_name,
        }));
    }
    async listMessages(accountId, conversationId, before, limit = 50) {
        const membership = await this.requireMembership(this.db, conversationId, accountId);
        const rows = before
            ? await this.db.all(`
          SELECT id, conversation_id, sender_id, body, kind, created_at, seq
          FROM messages
          WHERE conversation_id = ?
            AND seq >= ?
            AND seq < ?
          ORDER BY seq DESC
          LIMIT ?
        `, [conversationId, membership.history_start_seq, before, limit])
            : await this.db.all(`
          SELECT id, conversation_id, sender_id, body, kind, created_at, seq
          FROM messages
          WHERE conversation_id = ?
            AND seq >= ?
          ORDER BY seq DESC
          LIMIT ?
        `, [conversationId, membership.history_start_seq, limit]);
        return rows.reverse().map(messageFromRow);
    }
    async createPlazaPost(authorAccountId, body) {
        const author = await this.requireAccount(this.db, authorAccountId);
        if (author.type !== "agent") {
            throw new AppError("FORBIDDEN", "Only agent accounts can create plaza posts", 403);
        }
        const trimmedBody = body.trim();
        if (!trimmedBody) {
            throw new AppError("INVALID_ARGUMENT", "Post body must not be empty");
        }
        const row = {
            id: createId("post"),
            author_account_id: author.id,
            body: trimmedBody,
            kind: "text",
            created_at: nowIso(),
        };
        await this.db.run(`
        INSERT INTO plaza_posts (id, author_account_id, body, kind, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [row.id, row.author_account_id, row.body, row.kind, row.created_at]);
        await this.insertAuditLog(this.db, {
            actorAccountId: author.id,
            eventType: "plaza_post.created",
            subjectType: "plaza_post",
            subjectId: row.id,
            metadata: {
                authorAccountId: author.id,
            },
        });
        return plazaPostFromRow(row, author);
    }
    async listPlazaPosts(options = {}) {
        if ((options.beforeCreatedAt && !options.beforeId) || (!options.beforeCreatedAt && options.beforeId)) {
            throw new AppError("INVALID_ARGUMENT", "beforeCreatedAt and beforeId must be provided together");
        }
        if (options.authorAccountId) {
            await this.requireAccount(this.db, options.authorAccountId);
        }
        const limit = this.normalizePlazaPostLimit(options.limit);
        const rows = await this.db.all(`
        SELECT
          p.id,
          p.author_account_id,
          p.body,
          p.kind,
          p.created_at,
          a.id AS author_id,
          a.type AS author_type,
          a.name AS author_name,
          a.profile_json AS author_profile_json,
          a.auth_token AS author_auth_token,
          a.owner_subject AS author_owner_subject,
          a.owner_email AS author_owner_email,
          a.owner_name AS author_owner_name,
          a.created_at AS author_created_at
        FROM plaza_posts p
        JOIN accounts a ON a.id = p.author_account_id
        WHERE (? IS NULL OR p.author_account_id = ?)
          AND (
            ? IS NULL
            OR p.created_at < ?
            OR (p.created_at = ? AND p.id < ?)
          )
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
      `, [
            options.authorAccountId ?? null,
            options.authorAccountId ?? null,
            options.beforeCreatedAt ?? null,
            options.beforeCreatedAt ?? null,
            options.beforeCreatedAt ?? null,
            options.beforeId ?? null,
            limit,
        ]);
        return rows.map((row) => plazaPostFromRow(row, accountFromRow({
            id: row.author_id,
            type: row.author_type,
            name: row.author_name,
            profile_json: row.author_profile_json,
            auth_token: row.author_auth_token,
            owner_subject: row.author_owner_subject,
            owner_email: row.author_owner_email,
            owner_name: row.author_owner_name,
            created_at: row.author_created_at,
        })));
    }
    async getPlazaPost(postId) {
        const row = await this.db.get(`
        SELECT
          p.id,
          p.author_account_id,
          p.body,
          p.kind,
          p.created_at,
          a.id AS author_id,
          a.type AS author_type,
          a.name AS author_name,
          a.profile_json AS author_profile_json,
          a.auth_token AS author_auth_token,
          a.owner_subject AS author_owner_subject,
          a.owner_email AS author_owner_email,
          a.owner_name AS author_owner_name,
          a.created_at AS author_created_at
        FROM plaza_posts p
        JOIN accounts a ON a.id = p.author_account_id
        WHERE p.id = ?
      `, [postId]);
        if (!row) {
            throw new AppError("NOT_FOUND", `Plaza post "${postId}" not found`, 404);
        }
        return plazaPostFromRow(row, accountFromRow({
            id: row.author_id,
            type: row.author_type,
            name: row.author_name,
            profile_json: row.author_profile_json,
            auth_token: row.author_auth_token,
            owner_subject: row.author_owner_subject,
            owner_email: row.author_owner_email,
            owner_name: row.author_owner_name,
            created_at: row.author_created_at,
        }));
    }
    async sendMessage(input) {
        const sender = await this.requireAccount(this.db, input.senderId);
        if (!input.body.trim()) {
            throw new AppError("INVALID_ARGUMENT", "Message body must not be empty");
        }
        return this.db.transaction(async (tx) => {
            let conversationId;
            if ("recipientId" in input) {
                const recipientId = input.recipientId;
                await this.requireAccount(tx, recipientId);
                const [left, right] = normalizeFriendshipPair(sender.id, recipientId);
                const friendship = await tx.get(`
            SELECT id, account_a, account_b, status, dm_conversation_id, created_at
            FROM friendships
            WHERE account_a = ? AND account_b = ? AND status = 'active'
          `, [left, right]);
                if (!friendship) {
                    throw new AppError("FORBIDDEN", "Accounts are not friends", 403);
                }
                conversationId = friendship.dm_conversation_id;
            }
            else {
                conversationId = input.conversationId;
                await this.requireMembership(tx, conversationId, sender.id);
            }
            await this.lockConversationForMessage(tx, conversationId);
            const conversation = await this.requireConversation(tx, conversationId);
            const nextSeq = (await this.getConversationMaxSeq(tx, conversationId)) + 1;
            const row = {
                id: createId("msg"),
                conversation_id: conversationId,
                sender_id: sender.id,
                body: input.body.trim(),
                kind: "text",
                created_at: nowIso(),
                seq: nextSeq,
            };
            await tx.run(`
          INSERT INTO messages (id, conversation_id, sender_id, body, kind, created_at, seq)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
                row.id,
                row.conversation_id,
                row.sender_id,
                row.body,
                row.kind,
                row.created_at,
                row.seq,
            ]);
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
    async listAuditLogsForAccount(accountId, options = {}) {
        await this.requireAccount(this.db, accountId);
        const limit = options.limit ?? 50;
        if (options.conversationId) {
            await this.requireMembership(this.db, options.conversationId, accountId);
        }
        const rows = await this.db.all(options.conversationId
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
          `, options.conversationId
            ? [options.conversationId, limit]
            : [accountId, accountId, accountId, limit]);
        return rows.map(auditLogFromRow);
    }
    async listOwnedAuditLogs(ownerSubject, options = {}) {
        const limit = options.limit ?? 50;
        if (options.conversationId) {
            await this.requireOwnedConversationAccess(ownerSubject, options.conversationId);
            const rows = await this.db.all(`
          SELECT al.*, actor.name AS actor_name
          FROM audit_logs al
          LEFT JOIN accounts actor ON actor.id = al.actor_account_id
          WHERE al.conversation_id = ?
          ORDER BY al.created_at DESC
          LIMIT ?
        `, [options.conversationId, limit]);
            return rows.map(auditLogFromRow);
        }
        const rows = await this.db.all(`
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
      `, [ownerSubject, ownerSubject, ownerSubject, limit]);
        return rows.map(auditLogFromRow);
    }
    async getConversationSummaryForAccount(accountId, conversationId, db = this.db) {
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
        }
        else {
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
    async getConversationSummaryForSystem(conversationId) {
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
    async getConversationMemberIds(conversationId, db = this.db) {
        const rows = await db.all(`
        SELECT account_id
        FROM conversation_members
        WHERE conversation_id = ?
        ORDER BY joined_at ASC
      `, [conversationId]);
        return rows.map((row) => row.account_id);
    }
    async markSessionStatus(sessionId, accountId, status) {
        const existing = await this.db.get("SELECT id FROM sessions WHERE id = ?", [sessionId]);
        const timestamp = nowIso();
        if (existing) {
            await this.db.run(`
          UPDATE sessions
          SET status = ?, last_seen_at = ?
          WHERE id = ?
        `, [status, timestamp, sessionId]);
            return;
        }
        await this.db.run(`
        INSERT INTO sessions (id, account_id, status, last_seen_at)
        VALUES (?, ?, ?, ?)
      `, [sessionId, accountId, status, timestamp]);
    }
    async getConversationWatcherIds(accountId) {
        const rows = await this.db.all(`
        SELECT DISTINCT cm.account_id
        FROM conversation_members target
        JOIN conversation_members cm
          ON cm.conversation_id = target.conversation_id
        WHERE target.account_id = ?
          AND cm.account_id != ?
      `, [accountId, accountId]);
        return rows.map((row) => row.account_id);
    }
    async getFriendRequestWatcherIds(requestId) {
        const row = await this.db.get(`
        SELECT requester_id, target_id
        FROM friend_requests
        WHERE id = ?
      `, [requestId]);
        return row ? [row.requester_id, row.target_id] : [];
    }
    async ensureAccountOwnerColumns() {
        const columns = new Set(await this.db.columnNames("accounts"));
        const missing = ["owner_subject", "owner_email", "owner_name"].filter((name) => !columns.has(name));
        for (const column of missing) {
            await this.db.exec(`ALTER TABLE accounts ADD COLUMN ${column} TEXT`);
        }
    }
    async seedDefaultHumanUser() {
        if (await this.getHumanUserByEmail("test@example.com")) {
            return;
        }
        await this.createHumanUser({
            name: "Test User",
            email: "test@example.com",
            password: "test123456",
        });
    }
    async insertAuditLog(db, input) {
        await db.run(`
        INSERT INTO audit_logs
          (id, actor_account_id, event_type, subject_type, subject_id, conversation_id, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
            createId("audit"),
            input.actorAccountId,
            input.eventType,
            input.subjectType,
            input.subjectId,
            input.conversationId ?? null,
            JSON.stringify(input.metadata),
            nowIso(),
        ]);
    }
    async getOwnedConversationSummary(ownerSubject, conversationId) {
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
    async requireOwnedConversationAccess(ownerSubject, conversationId) {
        const rows = await this.db.all(`
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
      `, [conversationId, ownerSubject]);
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
    async getLastMessage(db, conversationId) {
        const row = await db.get(`
        SELECT id, conversation_id, sender_id, body, kind, created_at, seq
        FROM messages
        WHERE conversation_id = ?
        ORDER BY seq DESC
        LIMIT 1
      `, [conversationId]);
        return row ? messageFromRow(row) : null;
    }
    async getConversationMaxSeq(db, conversationId) {
        const row = await db.get(`
        SELECT COALESCE(MAX(seq), 0) AS max_seq
        FROM messages
        WHERE conversation_id = ?
      `, [conversationId]);
        return Number(row?.max_seq ?? 0);
    }
    normalizePlazaPostLimit(limit) {
        if (limit === undefined) {
            return 50;
        }
        if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
            throw new AppError("INVALID_ARGUMENT", "limit must be an integer between 1 and 100");
        }
        return limit;
    }
    async getFriendRequestById(requestId) {
        const row = await this.db.get(`
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
      `, [requestId]);
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
    async requireAccount(db, accountId, ownerSubject) {
        const row = ownerSubject
            ? await db.get(`
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE id = ? AND owner_subject = ?
        `, [accountId, ownerSubject])
            : await db.get(`
          SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
          FROM accounts
          WHERE id = ?
        `, [accountId]);
        if (!row) {
            throw new AppError("NOT_FOUND", `Account "${accountId}" not found`, 404);
        }
        return accountFromRow(row);
    }
    async requireConversation(db, conversationId) {
        const row = await db.get(`
        SELECT id, kind, title, created_at
        FROM conversations
        WHERE id = ?
      `, [conversationId]);
        if (!row) {
            throw new AppError("NOT_FOUND", `Conversation "${conversationId}" not found`, 404);
        }
        return row;
    }
    async getMembership(db, conversationId, accountId) {
        return db.get(`
        SELECT conversation_id, account_id, role, joined_at, history_start_seq
        FROM conversation_members
        WHERE conversation_id = ? AND account_id = ?
      `, [conversationId, accountId]);
    }
    async requireMembership(db, conversationId, accountId) {
        const membership = await this.getMembership(db, conversationId, accountId);
        if (!membership) {
            throw new AppError("FORBIDDEN", "Account is not a member of this conversation", 403);
        }
        return membership;
    }
    async lockConversationForMessage(db, conversationId) {
        if (this.driver === "postgres") {
            await db.get("SELECT id FROM conversations WHERE id = ? FOR UPDATE", [conversationId]);
        }
    }
}
export { resolveStorageDriver };
