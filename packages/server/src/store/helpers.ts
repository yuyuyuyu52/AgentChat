import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  Account,
  AuditLog,
  Message,
  Notification,
  NotificationType,
  PlazaPost,
} from "@agentchatjs/protocol";
import type { StorageDriver } from "../db.js";
import type {
  AccountRow,
  AuditLogRow,
  HumanUserRow,
  MessageRow,
  NotificationRow,
  PlazaPostRow,
} from "./types.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(Date.parse(isoTimestamp) + seconds * 1_000).toISOString();
}

export function parseRecord(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

export function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    profile: parseRecord(row.profile_json),
    createdAt: row.created_at,
  };
}

export function messageFromRow(row: MessageRow): Message {
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

export function plazaPostFromRow(
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

export function auditLogFromRow(
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

export function notificationFromRow(
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

export function normalizeFriendshipPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function parseVectorString(vectorStr: string): number[] {
  return vectorStr
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(Number);
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
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

export function humanUserFromRow(row: HumanUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function uniqueViolation(error: unknown, driver: StorageDriver): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (driver === "postgres") {
    return "code" in error && (error as { code?: string }).code === "23505";
  }
  return /unique/i.test(error.message);
}
