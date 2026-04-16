import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../db.js";
import { addSeconds, nowIso } from "./helpers.js";
import type { StoredUserSession, UserAuthSessionRow } from "./types.js";

export async function createAdminSession(
  db: DatabaseAdapter,
  ttlSeconds: number,
): Promise<string> {
  const createdAt = nowIso();
  const sessionId = randomUUID();
  await db.run(
    `
      INSERT INTO admin_auth_sessions (id, created_at, expires_at)
      VALUES (?, ?, ?)
    `,
    [sessionId, createdAt, addSeconds(createdAt, ttlSeconds)],
  );
  return sessionId;
}

export async function hasAdminSession(
  db: DatabaseAdapter,
  sessionId: string,
): Promise<boolean> {
  const now = nowIso();
  await db.run(
    `
      DELETE FROM admin_auth_sessions
      WHERE id = ?
        AND expires_at <= ?
    `,
    [sessionId, now],
  );
  const row = await db.get<{ id: string }>(
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

export async function deleteAdminSession(
  db: DatabaseAdapter,
  sessionId: string,
): Promise<void> {
  await db.run("DELETE FROM admin_auth_sessions WHERE id = ?", [sessionId]);
}

export async function createUserSession(
  db: DatabaseAdapter,
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
  await db.run(
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

export async function getUserSession(
  db: DatabaseAdapter,
  sessionId: string,
): Promise<StoredUserSession | undefined> {
  const now = nowIso();
  await db.run(
    `
      DELETE FROM user_auth_sessions
      WHERE id = ?
        AND expires_at <= ?
    `,
    [sessionId, now],
  );
  const row = await db.get<UserAuthSessionRow>(
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

export async function deleteUserSession(
  db: DatabaseAdapter,
  sessionId: string,
): Promise<void> {
  await db.run("DELETE FROM user_auth_sessions WHERE id = ?", [sessionId]);
}

export async function createOAuthState(
  db: DatabaseAdapter,
  ttlSeconds: number,
): Promise<string> {
  const createdAt = nowIso();
  const state = randomUUID();
  await db.run(
    `
      INSERT INTO oauth_states (id, created_at, expires_at)
      VALUES (?, ?, ?)
    `,
    [state, createdAt, addSeconds(createdAt, ttlSeconds)],
  );
  return state;
}

export async function consumeOAuthState(
  db: DatabaseAdapter,
  state: string,
): Promise<boolean> {
  const result = await db.run(
    `
      DELETE FROM oauth_states
      WHERE id = ?
        AND expires_at > ?
    `,
    [state, nowIso()],
  );
  return result.rowCount > 0;
}
