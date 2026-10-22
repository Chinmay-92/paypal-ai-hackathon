import { closePool, migrate } from "../src/persistence/db";

async function main() {
  const applied = await migrate();
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
