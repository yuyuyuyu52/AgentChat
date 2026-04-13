import pg from "pg";
import type { Pool as PgPool, PoolClient, QueryResult } from "pg";

const { Pool } = pg;

export type StorageDriver = "postgres";

export type SqlValue = null | number | string;

export type Queryable = {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: SqlValue[]): Promise<{ rowCount: number }>;
};

export type DatabaseAdapter = Queryable & {
  close(): Promise<void>;
  columnNames(tableName: string): Promise<string[]>;
  descriptor: string;
  driver: StorageDriver;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
};

function toParams(params: SqlValue[] | undefined): SqlValue[] {
  return params ?? [];
}

function toPostgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "redacted";
    }
    return url.toString();
  } catch {
    return "postgres://redacted";
  }
}

class PostgresQueryable implements Queryable {
  constructor(private readonly client: PgPool | PoolClient) {}

  async all<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
    const result = await this.client.query(toPostgresSql(sql), toParams(params));
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined> {
    const result = await this.client.query(toPostgresSql(sql), toParams(params));
    return result.rows[0] as T | undefined;
  }

  async run(sql: string, params?: SqlValue[]): Promise<{ rowCount: number }> {
    const result: QueryResult = await this.client.query(toPostgresSql(sql), toParams(params));
    return { rowCount: result.rowCount ?? 0 };
  }
}

export class PostgresAdapter extends PostgresQueryable implements DatabaseAdapter {
  readonly descriptor: string;
  readonly driver = "postgres" as const;

  constructor(private readonly pool: PgPool, databaseUrl: string) {
    super(pool);
    this.descriptor = redactDatabaseUrl(databaseUrl);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async columnNames(tableName: string): Promise<string[]> {
    const rows = await this.all<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?
      `,
      [tableName],
    );
    return rows.map((row) => row.column_name);
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new PostgresQueryable(client);
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createDatabaseAdapter(input: {
  databaseUrl: string;
}): DatabaseAdapter {
  return new PostgresAdapter(new Pool({ connectionString: input.databaseUrl }), input.databaseUrl);
}
