import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
const { Pool } = pg;
function toParams(params) {
    return params ?? [];
}
function toPostgresSql(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}
function redactDatabaseUrl(value) {
    try {
        const url = new URL(value);
        if (url.password) {
            url.password = "redacted";
        }
        return url.toString();
    }
    catch {
        return "postgres://redacted";
    }
}
class SqliteQueryable {
    db;
    constructor(db) {
        this.db = db;
    }
    async all(sql, params) {
        return this.db.prepare(sql).all(...toParams(params));
    }
    async exec(sql) {
        this.db.exec(sql);
    }
    async get(sql, params) {
        return this.db.prepare(sql).get(...toParams(params));
    }
    async run(sql, params) {
        const result = this.db.prepare(sql).run(...toParams(params));
        return { rowCount: Number(result.changes ?? 0) };
    }
}
export class SqliteAdapter extends SqliteQueryable {
    descriptor;
    driver = "sqlite";
    constructor(db, databasePath) {
        super(db);
        this.descriptor = databasePath;
    }
    async close() {
        this.db.close();
    }
    async columnNames(tableName) {
        const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
        return rows.map((row) => row.name);
    }
    async transaction(fn) {
        this.db.exec("BEGIN");
        try {
            const result = await fn(this);
            this.db.exec("COMMIT");
            return result;
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
}
class PostgresQueryable {
    client;
    constructor(client) {
        this.client = client;
    }
    async all(sql, params) {
        const result = await this.client.query(toPostgresSql(sql), toParams(params));
        return result.rows;
    }
    async exec(sql) {
        await this.client.query(sql);
    }
    async get(sql, params) {
        const result = await this.client.query(toPostgresSql(sql), toParams(params));
        return result.rows[0];
    }
    async run(sql, params) {
        const result = await this.client.query(toPostgresSql(sql), toParams(params));
        return { rowCount: result.rowCount ?? 0 };
    }
}
export class PostgresAdapter extends PostgresQueryable {
    pool;
    descriptor;
    driver = "postgres";
    constructor(pool, databaseUrl) {
        super(pool);
        this.pool = pool;
        this.descriptor = redactDatabaseUrl(databaseUrl);
    }
    async close() {
        await this.pool.end();
    }
    async columnNames(tableName) {
        const rows = await this.all(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?
      `, [tableName]);
        return rows.map((row) => row.column_name);
    }
    async transaction(fn) {
        const client = await this.pool.connect();
        const tx = new PostgresQueryable(client);
        try {
            await client.query("BEGIN");
            const result = await fn(tx);
            await client.query("COMMIT");
            return result;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
}
export function createDatabaseAdapter(input) {
    const driver = resolveStorageDriver(input);
    if (driver === "postgres") {
        if (!input.databaseUrl) {
            throw new Error("AGENTCHAT_DATABASE_URL is required for postgres storage");
        }
        return new PostgresAdapter(new Pool({ connectionString: input.databaseUrl }), input.databaseUrl);
    }
    if (input.databasePath !== ":memory:") {
        mkdirSync(dirname(input.databasePath), { recursive: true });
    }
    const db = new DatabaseSync(input.databasePath);
    db.exec("PRAGMA foreign_keys = ON;");
    return new SqliteAdapter(db, input.databasePath);
}
export function resolveStorageDriver(input) {
    if (input.driver) {
        return input.driver;
    }
    return input.databaseUrl ? "postgres" : "sqlite";
}
