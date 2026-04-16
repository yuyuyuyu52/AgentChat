import type { AuditLog } from "@agentchatjs/protocol";
import type { DatabaseAdapter, Queryable, SqlValue } from "../db.js";
import { auditLogFromRow, createId, nowIso } from "./helpers.js";
import { requireAccount, requireMembership, requireOwnedConversationAccess } from "./internal.js";
import type { AuditLogRow } from "./types.js";

export async function insertAuditLog(
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

export async function listAuditLogsForAccount(
  db: DatabaseAdapter,
  accountId: string,
  options: {
    conversationId?: string;
    limit?: number;
  } = {},
): Promise<AuditLog[]> {
  await requireAccount(db, accountId);
  const limit = options.limit ?? 50;
  if (options.conversationId) {
    await requireMembership(db, options.conversationId, accountId);
  }

  const rows = await db.all<AuditLogRow & { actor_name: string | null }>(
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

export async function listAuditLogs(
  db: DatabaseAdapter,
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

  const rows = await db.all<AuditLogRow & { actor_name?: string | null }>(
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

export async function listOwnedAuditLogs(
  db: DatabaseAdapter,
  ownerSubject: string,
  options: {
    conversationId?: string;
    limit?: number;
  } = {},
): Promise<AuditLog[]> {
  const limit = options.limit ?? 50;

  if (options.conversationId) {
    await requireOwnedConversationAccess(db, ownerSubject, options.conversationId);
    const rows = await db.all<AuditLogRow & { actor_name: string | null }>(
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

  const rows = await db.all<AuditLogRow & { actor_name: string | null }>(
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
