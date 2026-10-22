import { randomBytes } from "node:crypto";
import type { MerchantActor } from "@/application/actors";
import { AppError } from "@/application/errors";
import { createJob } from "@/application/jobs";
import { publishRevision } from "@/application/revisions";
import { hashPassword } from "@/application/tokens";
import { TEMPLATES, template } from "@/domain/templates";
import { one, pool, withTx } from "@/persistence/db";
import { newId, seedCatalog } from "@/persistence/repo";

// Synthetic demonstration workspace. Every name, email and amount here is
// invented; none of it is customer data.

export const DEMO_TENANT = "Northwind Makers (synthetic demo)";
export const OTHER_TENANT = "Other Shop (synthetic, for access tests)";

export async function ensureTenant(name: string, users: { email: string; name: string; role: "owner" | "fulfillment" }[], password: string) {
  return withTx(async (tx) => {
    const existing = await one<{ id: string }>(tx, "SELECT id FROM tenants WHERE name = $1", [name]);
    const tenantId = existing?.id ?? newId();
    if (!existing) await tx.query("INSERT INTO tenants (id, name, synthetic) VALUES ($1, $2, true)", [tenantId, name]);
    await seedCatalog(tx, tenantId, TEMPLATES);
    const actors: MerchantActor[] = [];
    for (const u of users) {
      let row = await one<{ id: string; tenant_id: string }>(tx, "SELECT id, tenant_id FROM users WHERE email = $1", [u.email]);
      if (!row) {
        row = { id: newId(), tenant_id: tenantId };
        await tx.query("INSERT INTO users (id, tenant_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)", [
          row.id,
          tenantId,
          u.email,
          u.name,
          u.role,
          await hashPassword(password),
        ]);
      }
      actors.push({ kind: "merchant", tenantId: row.tenant_id, userId: row.id, role: u.role, name: u.name });
    }
    return { tenantId, actors };
  });
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const APPAREL_ORIGINAL = () => ({
  shirts_qty: 50,
  shirts_sizes: { S: 10, M: 20, L: 15, XL: 5 },
  hoodies_qty: 0,
  hoodies_sizes: {},
  garment_color: "Black",
  artwork: "logo-v1",
  delivery_date: inDays(21),
});

export const WEBSITE_ORIGINAL = () => ({
  pages: 5,
  booking_included: false,
  booking_provider: null,
  revision_rounds: 2,
  exclusions: "Copywriting, photography, hosting fees",
  acceptance: "Pages render on current mobile and desktop browsers; contact form delivers to the studio inbox",
  target_date: inDays(42),
});

/** Creates and publishes one demo job per domain. Returns raw review links for the operator to open. */
export async function createDemoJobs(owner: MerchantActor, origin: string, suffix = "") {
  const out: { jobId: string; title: string; reviewUrl: string }[] = [];
  for (const [domain, title, scope, customer] of [
    ["apparel", `Team shirts for Riverside 10K${suffix}`, APPAREL_ORIGINAL(), { name: "Sam Rivera (synthetic)", email: "sam.rivera@example.test" }],
    ["website", `Clinic website${suffix}`, WEBSITE_ORIGINAL(), { name: "Dr. Alex Chen (synthetic)", email: "alex.chen@example.test" }],
  ] as const) {
    const t = template(domain);
    const { job, draft } = await createJob(owner, {
      domain,
      title,
      customer,
      scope,
      lineItems: t.suggestLineItems(scope, t.defaultRateCard),
      depositBps: 5000,
      merchantNote: "Synthetic demonstration agreement.",
    });
    const { invitationToken } = await publishRevision(owner, job.id, draft.id, { expectedVersion: job.version });
    out.push({ jobId: job.id, title, reviewUrl: `${origin}/review/${invitationToken}` });
  }
  return out;
}

export const DEMO_WORKSPACE_PREFIX = "Demo workspace";

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PACT_DEMO_MODE === "true";
}

/**
 * Hosted judge demo: a fresh, isolated synthetic tenant per visitor, with its
 * own users and demo jobs. Capped per day so the public demo cannot be used to
 * fill the database.
 */
export async function createDemoWorkspace(origin: string) {
  const limit = Number(process.env.PACT_DEMO_DAILY_LIMIT ?? 200);
  const recent = await one<{ n: number }>(
    pool(),
    "SELECT count(*)::int AS n FROM tenants WHERE synthetic AND name LIKE $1 AND created_at > now() - interval '24 hours'",
    [`${DEMO_WORKSPACE_PREFIX} %`],
  );
  if ((recent?.n ?? 0) >= limit) throw new AppError(429, "RATE_LIMITED", "The demo has reached today's limit. Please try again tomorrow.");
  const short = randomBytes(4).toString("hex");
  const password = randomBytes(9).toString("base64url");
  const ownerEmail = `owner-${short}@demo.pact.invalid`;
  const teamEmail = `team-${short}@demo.pact.invalid`;
  const { actors } = await ensureTenant(
    `${DEMO_WORKSPACE_PREFIX} ${short} (synthetic)`,
    [
      { email: ownerEmail, name: "Demo owner (synthetic)", role: "owner" },
      { email: teamEmail, name: "Demo team (synthetic)", role: "fulfillment" },
    ],
    password,
  );
  const jobs = await createDemoJobs(actors[0], origin);
  return { owner: actors[0], ownerEmail, teamEmail, password, jobs };
}
