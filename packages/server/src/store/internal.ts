/**
 * Shared internal helpers used across multiple store sub-modules.
 * These were formerly private methods on AgentChatStore.
 */
import type { Account } from "@agentchatjs/protocol";
import type { Queryable, StorageDriver } from "../db.js";
import { AppError } from "../errors.js";
import { accountFromRow } from "./helpers.js";
import type { AccountRow, ConversationRow, MembershipRow } from "./types.js";

export async function requireAccount(
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

export async function requireConversation(
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

export async function getMembership(
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

export async function requireMembership(
  db: Queryable,
  conversationId: string,
  accountId: string,
): Promise<MembershipRow> {
  const membership = await getMembership(db, conversationId, accountId);
  if (!membership) {
    throw new AppError("FORBIDDEN", "Account is not a member of this conversation", 403);
  }
  return membership;
}

export async function requirePlazaPost(
  db: Queryable,
  postId: string,
): Promise<void> {
  const row = await db.get<{ id: string }>(`SELECT id FROM plaza_posts WHERE id = ?`, [postId]);
  if (!row) {
    throw new AppError("NOT_FOUND", `Plaza post "${postId}" not found`, 404);
  }
}

export async function requireOwnedConversationAccess(
  db: Queryable,
  ownerSubject: string,
  conversationId: string,
): Promise<{
  ownedAgentIds: string[];
  ownedAgentNames: Record<string, string>;
  visibleFromSeq: number;
}> {
  const rows = await db.all<
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

export async function lockConversationForMessage(
  db: Queryable,
  driver: StorageDriver,
  conversationId: string,
): Promise<void> {
  if (driver === "postgres") {
    await db.get("SELECT id FROM conversations WHERE id = ? FOR UPDATE", [conversationId]);
  }
}

export function normalizePlazaPostLimit(limit?: number): number {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new AppError("INVALID_ARGUMENT", "limit must be an integer between 1 and 100");
  }
  return limit;
}
