import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// BIGINT money columns are returned as JS numbers. Amounts are bounded well
// below Number.MAX_SAFE_INTEGER; anything larger is rejected rather than rounded.
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} exceeds safe integer range`);
  return n;
});

export type Db = pg.Pool | pg.PoolClient;
export type Tx = pg.PoolClient;

const globalForPool = globalThis as unknown as { pactPool?: pg.Pool };

export class DatabaseConfigError extends Error {}

export function pool(): pg.Pool {
  if (!globalForPool.pactPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new DatabaseConfigError("DATABASE_URL is not set");
    globalForPool.pactPool = new pg.Pool({ connectionString, max: 10 });
  }
  return globalForPool.pactPool;
}

export async function closePool(): Promise<void> {
  await globalForPool.pactPool?.end();
  globalForPool.pactPool = undefined;
}

/**
 * Runs fn in a READ COMMITTED transaction. Callers lock the rows they change
 * (see lockJob). Never call a remote provider inside fn.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function one<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const res = await db.query(sql, params);
  return (res.rows[0] as T) ?? null;
}

export async function many<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query(sql, params);
  return res.rows as T[];
}

const MIGRATIONS_DIR = path.join(process.cwd(), "src/persistence/migrations");

export async function migrate(db: pg.Pool = pool()): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    // Serialize concurrent migrators.
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name as string));
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => undefined);
    client.release();
  }
  return applied;
}
