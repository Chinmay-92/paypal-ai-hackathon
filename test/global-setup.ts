import pg from "pg";
import { migrate } from "../src/persistence/db";

// Rebuilds the dedicated test database schema once per run. Refuses anything
// that does not look like a test database.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/pact_test";
  if (!/test/.test(new URL(url).pathname)) throw new Error(`Refusing to reset non-test database ${url}`);
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  await pool.end();
}
