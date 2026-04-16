import { randomUUID } from "node:crypto";
import type { Account, AccountType, AuthAccount } from "@agentchatjs/protocol";
import type { DatabaseAdapter, StorageDriver } from "../db.js";
import { AppError } from "../errors.js";
import {
  accountFromRow,
  createId,
  hashPassword,
  humanUserFromRow,
  normalizeEmail,
  nowIso,
  uniqueViolation,
  verifyPassword,
} from "./helpers.js";
import { requireAccount } from "./internal.js";
import { insertAuditLog } from "./audit-logs.js";
import type { AccountRow, CreateAccountInput, HumanUserRow, HumanUser } from "./types.js";

export async function createAccount(
  db: DatabaseAdapter,
  driver: StorageDriver,
  input: CreateAccountInput,
): Promise<AuthAccount> {
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
    await db.run(
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
    if (uniqueViolation(error, driver)) {
      throw new AppError("CONFLICT", `Account name "${row.name}" already exists`, 409);
    }
    throw error;
  }

  return {
    ...accountFromRow(row),
    token,
  };
}

export async function getOrCreateHumanAccount(
  db: DatabaseAdapter,
  driver: StorageDriver,
  session: {
    subject: string;
    email: string;
    name: string;
  },
): Promise<Account> {
  const existing = await db.get<AccountRow>(
    `
      SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
      FROM accounts
      WHERE owner_subject = ? AND type = 'human'
    `,
    [session.subject],
  );
  if (existing) {
    return accountFromRow(existing);
  }

  const createdAt = nowIso();
  const row: AccountRow = {
    id: createId("acct"),
    type: "human",
    name: session.name,
    profile_json: JSON.stringify({}),
    auth_token: randomUUID(),
    owner_subject: session.subject,
    owner_email: session.email,
    owner_name: session.name,
    created_at: createdAt,
  };

  try {
    await db.run(
      `
        INSERT INTO accounts (id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [row.id, row.type, row.name, row.profile_json, row.auth_token, row.owner_subject, row.owner_email, row.owner_name, row.created_at],
    );
  } catch (error) {
    if (uniqueViolation(error, driver)) {
      row.name = `${session.name} (${session.email})`;
      await db.run(
        `
          INSERT INTO accounts (id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [row.id, row.type, row.name, row.profile_json, row.auth_token, row.owner_subject, row.owner_email, row.owner_name, row.created_at],
      );
    } else {
      throw error;
    }
  }

  return accountFromRow(row);
}

export async function getAccountById(
  db: DatabaseAdapter,
  accountId: string,
): Promise<Account> {
  return requireAccount(db, accountId);
}

export async function updateProfile(
  db: DatabaseAdapter,
  accountId: string,
  profileFields: Record<string, unknown>,
  ownerSubject?: string,
): Promise<Account> {
  const account = await requireAccount(db, accountId, ownerSubject);
  const updated = { ...account.profile, ...profileFields };
  // Remove keys explicitly set to null so users can clear fields
  for (const [key, value] of Object.entries(updated)) {
    if (value === null) delete updated[key];
  }
  await db.run(
    `UPDATE accounts SET profile_json = ? WHERE id = ?`,
    [JSON.stringify(updated), accountId],
  );
  return { ...account, profile: updated };
}

export async function listAccounts(
  db: DatabaseAdapter,
  ownerSubject?: string,
): Promise<Account[]> {
  const rows = ownerSubject
    ? await db.all<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        WHERE owner_subject = ?
        ORDER BY created_at ASC
      `,
      [ownerSubject],
    )
    : await db.all<AccountRow>(
      `
        SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
        FROM accounts
        ORDER BY created_at ASC
      `,
    );

  return rows.map(accountFromRow);
}

export async function listAgentAccounts(
  db: DatabaseAdapter,
): Promise<Account[]> {
  const rows = await db.all<AccountRow>(
    `
      SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
      FROM accounts
      WHERE type = 'agent'
      ORDER BY created_at DESC
    `,
    [],
  );
  return rows.map(accountFromRow);
}

export async function authenticateAccount(
  db: DatabaseAdapter,
  accountId: string,
  token: string,
): Promise<Account> {
  const row = await db.get<AccountRow>(
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

export async function resetToken(
  db: DatabaseAdapter,
  accountId: string,
  ownerSubject?: string,
): Promise<{ accountId: string; token: string }> {
  await requireAccount(db, accountId, ownerSubject);
  const token = randomUUID();
  await db.run("UPDATE accounts SET auth_token = ? WHERE id = ?", [token, accountId]);
  await insertAuditLog(db, {
    actorAccountId: accountId,
    eventType: "account.token_reset",
    subjectType: "account",
    subjectId: accountId,
    metadata: {},
  });
  return { accountId, token };
}

export async function deleteAccount(
  db: DatabaseAdapter,
  accountId: string,
  ownerSubject?: string,
): Promise<void> {
  const account = await requireAccount(db, accountId, ownerSubject);
  if (account.type === "human") {
    throw new AppError("INVALID_ARGUMENT", "Cannot delete human accounts", 400);
  }
  await db.run("DELETE FROM accounts WHERE id = ?", [accountId]);
}

export async function createHumanUser(
  db: DatabaseAdapter,
  driver: StorageDriver,
  input: {
    email: string;
    name: string;
    password: string;
  },
): Promise<HumanUser> {
  const createdAt = nowIso();
  const row: HumanUserRow = {
    id: createId("user"),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    password_hash: hashPassword(input.password),
    created_at: createdAt,
  };

  try {
    await db.run(
      `
        INSERT INTO human_users (
          id, email, name, password_hash, created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [row.id, row.email, row.name, row.password_hash, row.created_at],
    );
  } catch (error) {
    if (uniqueViolation(error, driver)) {
      throw new AppError("CONFLICT", `User email "${row.email}" already exists`, 409);
    }
    throw error;
  }

  return humanUserFromRow(row);
}

export async function authenticateHumanUser(
  db: DatabaseAdapter,
  email: string,
  password: string,
): Promise<HumanUser> {
  const normalizedEmail = normalizeEmail(email);
  const row = await db.get<HumanUserRow>(
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

export async function getHumanUserByEmail(
  db: DatabaseAdapter,
  email: string,
): Promise<HumanUser | undefined> {
  const row = await db.get<HumanUserRow>(
    `
      SELECT id, email, name, password_hash, created_at
      FROM human_users
      WHERE email = ?
    `,
    [normalizeEmail(email)],
  );

  return row ? humanUserFromRow(row) : undefined;
}

export async function listAccountsByType(
  db: DatabaseAdapter,
  type: AccountType,
): Promise<Account[]> {
  const rows = await db.all<AccountRow>(
    `SELECT * FROM accounts WHERE type = ?`,
    [type],
  );
  return rows.map(accountFromRow);
}

export async function seedDefaultHumanUser(
  db: DatabaseAdapter,
  driver: StorageDriver,
): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  if (await getHumanUserByEmail(db, "test@example.com")) {
    return;
  }

  await createHumanUser(db, driver, {
    name: "Test User",
    email: "test@example.com",
    password: "test123456",
  });
}

export async function ensureAccountOwnerColumns(
  db: DatabaseAdapter,
): Promise<void> {
  const columns = new Set(await db.columnNames("accounts"));
  const missing = ["owner_subject", "owner_email", "owner_name"].filter((name) => !columns.has(name));
  for (const column of missing) {
    await db.exec(`ALTER TABLE accounts ADD COLUMN ${column} TEXT`);
  }
}
