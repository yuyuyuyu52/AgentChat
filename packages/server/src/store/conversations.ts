import type {
  Account,
  ConversationSummary,
  Message,
  DEFAULT_GROUP_HISTORY_LIMIT as DefaultGroupHistoryLimit,
} from "@agentchatjs/protocol";
import { DEFAULT_GROUP_HISTORY_LIMIT } from "@agentchatjs/protocol";
import type { DatabaseAdapter, Queryable, StorageDriver } from "../db.js";
import { AppError } from "../errors.js";
import {
  accountFromRow,
  createId,
  messageFromRow,
  normalizeFriendshipPair,
  nowIso,
} from "./helpers.js";
import {
  getMembership,
  lockConversationForMessage,
  requireAccount,
  requireConversation,
  requireMembership,
  requireOwnedConversationAccess,
} from "./internal.js";
import { insertAuditLog } from "./audit-logs.js";
import type {
  AccountRow,
  ConversationRow,
  FriendshipRow,
  MembershipRow,
  MessageRow,
  OwnedConversationMessage,
  OwnedConversationRow,
  OwnedConversationSummary,
  SendMessageInput,
} from "./types.js";

export async function createGroup(
  db: DatabaseAdapter,
  title: string,
): Promise<ConversationSummary> {
  const conversationId = createId("conv");
  const createdAt = nowIso();
  await db.run(
    `
      INSERT INTO conversations (id, kind, title, created_at)
      VALUES (?, 'group', ?, ?)
    `,
    [conversationId, title, createdAt],
  );
  await insertAuditLog(db, {
    actorAccountId: null,
    eventType: "group.created",
    subjectType: "conversation",
    subjectId: conversationId,
    conversationId,
    metadata: {
      title,
    },
  });
  return getConversationSummaryForSystem(db, conversationId);
}

export async function createGroupAs(
  db: DatabaseAdapter,
  creatorId: string,
  title: string,
): Promise<ConversationSummary> {
  await requireAccount(db, creatorId);
  const conversationId = createId("conv");
  const createdAt = nowIso();

  await db.transaction(async (tx) => {
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
    await insertAuditLog(tx, {
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

  return getConversationSummaryForAccount(db, creatorId, conversationId);
}

export async function addGroupMember(
  db: DatabaseAdapter,
  conversationId: string,
  accountId: string,
): Promise<ConversationSummary> {
  const conversation = await requireConversation(db, conversationId);
  if (conversation.kind !== "group") {
    throw new AppError("INVALID_ARGUMENT", "Can only add members to group conversations");
  }

  await requireAccount(db, accountId);
  const existing = await getMembership(db, conversationId, accountId);
  if (!existing) {
    const maxSeq = await getConversationMaxSeq(db, conversationId);
    const historyStartSeq = Math.max(
      1,
      maxSeq === 0 ? 1 : maxSeq - DEFAULT_GROUP_HISTORY_LIMIT + 1,
    );
    await db.run(
      `
        INSERT INTO conversation_members
          (conversation_id, account_id, role, joined_at, history_start_seq)
        VALUES (?, ?, 'member', ?, ?)
      `,
      [conversationId, accountId, nowIso(), historyStartSeq],
    );
  }

  return getConversationSummaryForAccount(db, accountId, conversationId);
}

export async function addGroupMemberAs(
  db: DatabaseAdapter,
  actorId: string,
  conversationId: string,
  accountId: string,
): Promise<ConversationSummary> {
  await requireMembership(db, conversationId, actorId);
  const summary = await addGroupMember(db, conversationId, accountId);
  await insertAuditLog(db, {
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

export async function listGroups(
  db: DatabaseAdapter,
  accountId: string,
): Promise<ConversationSummary[]> {
  await requireAccount(db, accountId);
  const ids = await db.all<Array<{ id: string }> extends never ? never : { id: string }>(
    `
      SELECT c.id
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE c.kind = 'group' AND cm.account_id = ?
      ORDER BY c.created_at ASC
    `,
    [accountId],
  );

  return Promise.all(ids.map(async ({ id }) => getConversationSummaryForAccount(db, accountId, id)));
}

export async function listConversationMembers(
  db: DatabaseAdapter,
  accountId: string,
  conversationId: string,
): Promise<Account[]> {
  await requireMembership(db, conversationId, accountId);
  const rows = await db.all<AccountRow>(
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

export async function listConversations(
  db: DatabaseAdapter,
  accountId: string,
): Promise<ConversationSummary[]> {
  await requireAccount(db, accountId);
  const rows = await db.all<{ conversation_id: string }>(
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
      getConversationSummaryForAccount(db, accountId, conversation_id)
    ),
  );
}

export async function listOwnedConversations(
  db: DatabaseAdapter,
  ownerSubject: string,
): Promise<OwnedConversationSummary[]> {
  const conversations = await db.all<OwnedConversationRow>(
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
      getOwnedConversationSummary(db, ownerSubject, conversation.id)
    ),
  );
}

export async function listOwnedConversationMessages(
  db: DatabaseAdapter,
  ownerSubject: string,
  conversationId: string,
  before?: number,
  limit = 50,
): Promise<OwnedConversationMessage[]> {
  const access = await requireOwnedConversationAccess(db, ownerSubject, conversationId);
  const rows = before
    ? await db.all<MessageRow & { sender_name: string }>(
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
    : await db.all<MessageRow & { sender_name: string }>(
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

export async function listMessages(
  db: DatabaseAdapter,
  accountId: string,
  conversationId: string,
  before?: number,
  limit = 50,
): Promise<Message[]> {
  const membership = await requireMembership(db, conversationId, accountId);

  const rows = before
    ? await db.all<MessageRow>(
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
    : await db.all<MessageRow>(
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

export async function sendMessage(
  db: DatabaseAdapter,
  driver: StorageDriver,
  input: SendMessageInput,
): Promise<{
  conversation: ConversationSummary;
  message: Message;
}> {
  const sender = await requireAccount(db, input.senderId);
  if (!input.body.trim()) {
    throw new AppError("INVALID_ARGUMENT", "Message body must not be empty");
  }

  return db.transaction(async (tx) => {
    let conversationId: string;
    if ("recipientId" in input) {
      const recipientId = input.recipientId;
      await requireAccount(tx, recipientId);
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
      await requireMembership(tx, conversationId, sender.id);
    }

    await lockConversationForMessage(tx, driver, conversationId);
    const conversation = await requireConversation(tx, conversationId);
    const nextSeq = (await getConversationMaxSeq(tx, conversationId)) + 1;
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

    await insertAuditLog(tx, {
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
      conversation: await getConversationSummaryForAccount(db, sender.id, conversation.id, tx),
      message: messageFromRow(row),
    };
  });
}

export async function getConversationSummaryForAccount(
  db: DatabaseAdapter,
  accountId: string,
  conversationId: string,
  queryable: Queryable = db,
): Promise<ConversationSummary> {
  const conversation = await requireConversation(queryable, conversationId);
  const membership = await requireMembership(queryable, conversationId, accountId);
  const memberIds = await getConversationMemberIds(db, conversationId, queryable);
  const lastMessage = await getLastMessage(queryable, conversationId);

  let title = conversation.title ?? "";
  if (conversation.kind === "dm") {
    const otherId = memberIds.find((memberId) => memberId !== accountId);
    if (!otherId) {
      throw new AppError("INTERNAL_ERROR", "DM conversation missing peer", 500);
    }
    title = (await requireAccount(queryable, otherId)).name;
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

export async function getConversationSummaryForSystem(
  db: DatabaseAdapter,
  conversationId: string,
): Promise<ConversationSummary> {
  const conversation = await requireConversation(db, conversationId);
  return {
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title ?? conversation.id,
    memberIds: await getConversationMemberIds(db, conversationId),
    lastMessage: await getLastMessage(db, conversationId),
    visibleFromSeq: 1,
    createdAt: conversation.created_at,
  };
}

export async function getConversationMemberIds(
  _db: DatabaseAdapter,
  conversationId: string,
  queryable?: Queryable,
): Promise<string[]> {
  const q = queryable ?? _db;
  const rows = await q.all<{ account_id: string }>(
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

export async function getConversationWatcherIds(
  db: DatabaseAdapter,
  accountId: string,
): Promise<string[]> {
  const rows = await db.all<{ account_id: string }>(
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

export async function markSessionStatus(
  db: DatabaseAdapter,
  sessionId: string,
  accountId: string,
  status: "online" | "offline",
): Promise<void> {
  const existing = await db.get<{ id: string }>(
    "SELECT id FROM sessions WHERE id = ?",
    [sessionId],
  );
  const timestamp = nowIso();
  if (existing) {
    await db.run(
      `
        UPDATE sessions
        SET status = ?, last_seen_at = ?
        WHERE id = ?
      `,
      [status, timestamp, sessionId],
    );
    return;
  }

  await db.run(
    `
      INSERT INTO sessions (id, account_id, status, last_seen_at)
      VALUES (?, ?, ?, ?)
    `,
    [sessionId, accountId, status, timestamp],
  );
}

export async function getOwnedConversationSummary(
  db: DatabaseAdapter,
  ownerSubject: string,
  conversationId: string,
): Promise<OwnedConversationSummary> {
  const conversation = await requireConversation(db, conversationId);
  const access = await requireOwnedConversationAccess(db, ownerSubject, conversationId);
  const memberIds = await getConversationMemberIds(db, conversationId);
  const lastMessage = await getLastMessage(db, conversationId);

  let title = conversation.title ?? conversation.id;
  if (conversation.kind === "dm") {
    const otherId = memberIds.find((memberId) => !access.ownedAgentIds.includes(memberId));
    if (otherId) {
      title = (await requireAccount(db, otherId)).name;
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

export async function getLastMessage(
  db: Queryable,
  conversationId: string,
): Promise<Message | null> {
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

export async function getConversationMaxSeq(
  db: Queryable,
  conversationId: string,
): Promise<number> {
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

export { getMembership } from "./internal.js";
