import type { CustomerActor, MerchantActor } from "../src/application/actors";
import { captureCheckout, startCheckout } from "../src/application/payments";
import { customerFromSession, decide, exchangeInvitation } from "../src/application/reviews";
import { template, type Domain } from "../src/domain/templates";
import { setProviderForTests } from "../src/integrations/paypal/http";
import { many, one, pool } from "../src/persistence/db";
import { getJob, type JobRow, type ObligationRow, type RevisionRow } from "../src/persistence/repo";
import { createDemoJobs, ensureTenant } from "../src/server/demo";
import { FakePayPal } from "./fake-paypal";

export const ORIGIN = "http://localhost:3000";

export async function resetDb() {
  await pool().query(
    `TRUNCATE tenants, users, merchant_sessions, catalog_items, customers, jobs, agreement_revisions, source_messages, change_requests,
     review_invitations, customer_sessions, approvals, payment_obligations, payment_operations, captures, refund_operations,
     payment_events, audit_events, outbox, attachments CASCADE`,
  );
}

export type World = { owner: MerchantActor; team: MerchantActor; other: MerchantActor; paypal: FakePayPal };

export async function world(): Promise<World> {
  await resetDb();
  const paypal = new FakePayPal();
  setProviderForTests(paypal);
  const a = await ensureTenant(
    "Test Makers (synthetic)",
    [
      { email: "owner@test.example", name: "Owner", role: "owner" },
      { email: "team@test.example", name: "Team", role: "fulfillment" },
    ],
    "test-password",
  );
  const b = await ensureTenant("Other (synthetic)", [{ email: "other@test.example", name: "Other", role: "owner" }], "test-password");
  return { owner: a.actors[0], team: a.actors[1], other: b.actors[0], paypal };
}

/** Creates both demo jobs (published originals) and returns the one for the domain. */
export async function publishedJob(owner: MerchantActor, domain: Domain): Promise<{ jobId: string; token: string }> {
  const jobs = await createDemoJobs(owner, ORIGIN);
  const j = jobs[domain === "apparel" ? 0 : 1];
  return { jobId: j.jobId, token: j.reviewUrl.split("/review/")[1] };
}

export async function customer(token: string): Promise<CustomerActor> {
  const r = await exchangeInvitation(token);
  if (!r.ok) throw new Error(`invitation ${r.reason}`);
  return customerFromSession(r.sessionToken);
}

export async function job(actor: { tenantId: string }, jobId: string): Promise<JobRow> {
  return getJob(pool(), actor.tenantId, jobId);
}

export async function pendingRevision(actor: { tenantId: string }, jobId: string): Promise<RevisionRow> {
  const j = await job(actor, jobId);
  return (await one<RevisionRow>(pool(), "SELECT * FROM agreement_revisions WHERE id = $1", [j.pending_revision_id]))!;
}

export async function approvePending(c: CustomerActor) {
  const rev = await pendingRevision(c, c.jobId);
  return decide(c, rev.id, { action: "APPROVE", contentHash: rev.content_hash });
}

export async function obligations(jobId: string): Promise<ObligationRow[]> {
  return many<ObligationRow>(pool(), "SELECT * FROM payment_obligations WHERE job_id = $1 ORDER BY created_at", [jobId]);
}

export async function openObligation(jobId: string): Promise<ObligationRow> {
  const o = (await obligations(jobId)).find((x) => ["DUE", "PROCESSING", "FAILED"].includes(x.status));
  if (!o) throw new Error("no open obligation");
  return o;
}

/** Customer checkout, buyer approval at the fake provider, then server-side capture. */
export async function pay(c: CustomerActor, paypal: FakePayPal, obligationId: string) {
  const checkout = await startCheckout(c, obligationId, ORIGIN);
  if (checkout.kind !== "redirect") throw new Error(`unexpected checkout ${checkout.kind}`);
  const op = (await one<{ provider_order_id: string }>(pool(), "SELECT provider_order_id FROM payment_operations WHERE id = $1", [checkout.operationId]))!;
  paypal.approve(op.provider_order_id);
  return { operationId: checkout.operationId, orderId: op.provider_order_id, outcome: await captureCheckout(c, checkout.operationId) };
}

export function suggested(domain: Domain, scope: Record<string, unknown>) {
  const t = template(domain);
  return t.suggestLineItems(scope as never, t.defaultRateCard);
}

/** Expects a promise to reject with an AppError of the given HTTP status. */
export async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  try {
    await p;
  } catch (err) {
    const s = (err as { status?: number }).status;
    if (s === status) return;
    throw new Error(`expected status ${status}, got ${s ?? "non-app error"}: ${(err as Error).message}`);
  }
  throw new Error(`expected status ${status}, but the call succeeded`);
}
