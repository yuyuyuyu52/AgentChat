import type { Notification, NotificationType } from "@agentchatjs/protocol";
import type { DatabaseAdapter, SqlValue } from "../db.js";
import { createId, notificationFromRow, nowIso } from "./helpers.js";
import type { NotificationRow } from "./types.js";

export async function createNotification(
  db: DatabaseAdapter,
  input: {
    recipientAccountId: string;
    type: NotificationType;
    actorAccountId?: string;
    subjectType: string;
    subjectId: string;
    data?: Record<string, unknown>;
  },
): Promise<Notification | null> {
  // Dedup: skip if identical notification already exists
  if (input.actorAccountId) {
    const existing = await db.get<{ id: string }>(
      `SELECT id FROM notifications WHERE recipient_account_id = ? AND actor_account_id = ? AND type = ? AND subject_id = ? LIMIT 1`,
      [input.recipientAccountId, input.actorAccountId, input.type, input.subjectId],
    );
    if (existing) return null;
  }

  const id = createId("notif");
  const createdAt = nowIso();
  await db.run(
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
  const row = await db.get<NotificationRow & { actor_name: string | null }>(
    `SELECT n.*, a.name AS actor_name
     FROM notifications n
     LEFT JOIN accounts a ON a.id = n.actor_account_id
     WHERE n.id = ?`,
    [id],
  );
  return row ? notificationFromRow(row) : null;
}

export async function listNotifications(
  db: DatabaseAdapter,
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

  const rows = await db.all<NotificationRow & { actor_name: string | null }>(
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

export async function listNotificationsForOwner(
  db: DatabaseAdapter,
  _ownerSubject: string,
  humanAccountId: string,
  options?: { beforeCreatedAt?: string; beforeId?: string; limit?: number; unreadOnly?: boolean },
): Promise<Notification[]> {
  return listNotifications(db, humanAccountId, options);
}

export async function getUnreadNotificationCount(
  db: DatabaseAdapter,
  accountId: string,
): Promise<number> {
  const row = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_account_id = ? AND is_read = FALSE`,
    [accountId],
  );
  return Number(row?.cnt ?? 0);
}

export async function getUnreadNotificationCountForOwner(
  db: DatabaseAdapter,
  _ownerSubject: string,
  humanAccountId: string,
): Promise<number> {
  return getUnreadNotificationCount(db, humanAccountId);
}

export async function markNotificationRead(
  db: DatabaseAdapter,
  accountId: string,
  notificationId: string,
): Promise<void> {
  await db.run(
    `UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_account_id = ?`,
    [notificationId, accountId],
  );
}

export async function markNotificationReadForOwner(
  db: DatabaseAdapter,
  _ownerSubject: string,
  humanAccountId: string,
  notificationId: string,
): Promise<void> {
  return markNotificationRead(db, humanAccountId, notificationId);
}

export async function markAllNotificationsRead(
  db: DatabaseAdapter,
  accountId: string,
): Promise<void> {
  await db.run(
    `UPDATE notifications SET is_read = TRUE WHERE recipient_account_id = ? AND is_read = FALSE`,
    [accountId],
  );
}

export async function markAllNotificationsReadForOwner(
  db: DatabaseAdapter,
  _ownerSubject: string,
  humanAccountId: string,
): Promise<void> {
  return markAllNotificationsRead(db, humanAccountId);
}
