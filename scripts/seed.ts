import { closePool, migrate } from "../src/persistence/db";
import { createDemoJobs, DEMO_TENANT, ensureTenant, OTHER_TENANT } from "../src/server/demo";

async function main() {
  // Idempotent for tenants and users; each run adds a fresh pair of demo jobs.
  // Earlier jobs and their payment records are never deleted.
  const password = process.env.SEED_PASSWORD ?? "pact-demo-only";
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";

  await migrate();
  const demo = await ensureTenant(
    DEMO_TENANT,
    [
      { email: "owner@northwind.example.test", name: "Morgan (owner, synthetic)", role: "owner" },
      { email: "team@northwind.example.test", name: "Jo (fulfillment, synthetic)", role: "fulfillment" },
    ],
    password,
  );
  await ensureTenant(OTHER_TENANT, [{ email: "owner@othershop.example.test", name: "Other owner (synthetic)", role: "owner" }], password);
  const jobs = await createDemoJobs(demo.actors[0], origin);

  console.log("Synthetic demo workspace ready (sandbox only).");
  console.log(`Merchant login: owner@northwind.example.test / ${process.env.SEED_PASSWORD ? "<SEED_PASSWORD>" : password}`);
  console.log(`Fulfillment login: team@northwind.example.test / same password`);
  for (const j of jobs) console.log(`- ${j.title}: customer review link ${j.reviewUrl}`);
  await closePool();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
