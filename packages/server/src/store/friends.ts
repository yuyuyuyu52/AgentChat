import type {
  Account,
  AccountType,
  FriendRecord,
  FriendRequest,
} from "@agentchatjs/protocol";
import type { DatabaseAdapter } from "../db.js";
import { AppError } from "../errors.js";
import {
  accountFromRow,
  createId,
  normalizeFriendshipPair,
  nowIso,
} from "./helpers.js";
import { requireAccount } from "./internal.js";
import { insertAuditLog } from "./audit-logs.js";
import type { AccountRow, FriendRequestRow, FriendshipRow } from "./types.js";

export async function createFriendship(
  db: DatabaseAdapter,
  accountA: string,
  accountB: string,
): Promise<{
  friendshipId: string;
  conversationId: string;
  createdAt: string;
}> {
  if (accountA === accountB) {
    throw new AppError("INVALID_ARGUMENT", "Cannot friend the same account");
  }

  return db.transaction(async (tx) => {
    await requireAccount(tx, accountA);
    await requireAccount(tx, accountB);

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

    await insertAuditLog(tx, {
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

export async function listFriends(
  db: DatabaseAdapter,
  accountId: string,
): Promise<FriendRecord[]> {
  await requireAccount(db, accountId);
  const rows = await db.all<
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

export async function addFriendAs(
  db: DatabaseAdapter,
  actorId: string,
  peerAccountId: string,
): Promise<{
  requestId: string;
  createdAt: string;
}> {
  await requireAccount(db, actorId);
  await requireAccount(db, peerAccountId);
  if (actorId === peerAccountId) {
    throw new AppError("INVALID_ARGUMENT", "Cannot send a friend request to self");
  }

  const [left, right] = normalizeFriendshipPair(actorId, peerAccountId);
  const active = await db.get<{ id: string }>(
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

  const pendingSameDirection = await db.get<FriendRequestRow>(
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

  const reversePending = await db.get<{ id: string }>(
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
  await db.run(
    `
      INSERT INTO friend_requests
        (id, requester_id, target_id, status, created_at, responded_at)
      VALUES (?, ?, ?, 'pending', ?, NULL)
    `,
    [requestId, actorId, peerAccountId, createdAt],
  );

  await insertAuditLog(db, {
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

export async function listFriendRequests(
  db: DatabaseAdapter,
  accountId: string,
  direction: "incoming" | "outgoing" | "all" = "all",
): Promise<FriendRequest[]> {
  await requireAccount(db, accountId);
  const where =
    direction === "incoming"
      ? "fr.target_id = ?"
      : direction === "outgoing"
        ? "fr.requester_id = ?"
        : "(fr.requester_id = ? OR fr.target_id = ?)";

  const params = direction === "all" ? [accountId, accountId] : [accountId];
  const rows = await db.all<
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

export async function respondFriendRequestAs(
  db: DatabaseAdapter,
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
  await requireAccount(db, actorId);
  const request = await db.get<FriendRequestRow>(
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
  await db.run(
    `
      UPDATE friend_requests
      SET status = ?, responded_at = ?
      WHERE id = ?
    `,
    [action === "accept" ? "accepted" : "rejected", respondedAt, requestId],
  );

  await insertAuditLog(db, {
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
    return getFriendRequestById(db, requestId);
  }

  return createFriendship(db, request.requester_id, request.target_id);
}

export async function getFriendRequestById(
  db: DatabaseAdapter,
  requestId: string,
): Promise<FriendRequest> {
  const row = await db.get<
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

export async function getFriendRequestWatcherIds(
  db: DatabaseAdapter,
  requestId: string,
): Promise<string[]> {
  const row = await db.get<{ requester_id: string; target_id: string }>(
    `
      SELECT requester_id, target_id
      FROM friend_requests
      WHERE id = ?
    `,
    [requestId],
  );
  return row ? [row.requester_id, row.target_id] : [];
}
