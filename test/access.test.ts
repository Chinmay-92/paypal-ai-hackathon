import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { login, merchantFromSession } from "../src/application/auth";
import { addMessage, analyzeChangeRequest, reviewChangeRequest } from "../src/application/changes";
import { fulfillmentSheet, releaseWork } from "../src/application/fulfillment";
import { merchantJobView } from "../src/application/jobs";
import { captureCheckout, requestRefund, startCheckout } from "../src/application/payments";
import { createManualDraft, publishRevision } from "../src/application/revisions";
import { customerFromSession, decide, exchangeInvitation } from "../src/application/reviews";
import { closePool, many, one, pool } from "../src/persistence/db";
import type { CaptureRow } from "../src/persistence/repo";
import { approvePending, customer, expectStatus, job, obligations, openObligation, ORIGIN, pay, pendingRevision, publishedJob, suggested, world, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await world();
});
afterAll(closePool);

describe("tenant isolation and roles", () => {
  it("another tenant cannot read or act on a job by ID", async () => {
    const { jobId } = await publishedJob(w.owner, "apparel");
    await expectStatus(merchantJobView(w.other, jobId), 404);
    await expectStatus(fulfillmentSheet(w.other, jobId), 404);
    await expectStatus(addMessage(w.other, jobId, { authorLabel: "x", authorRole: "customer", body: "Make it 10 shirts" }), 404);
    const rev = await pendingRevision(w.owner, jobId);
    await expectStatus(publishRevision(w.other, jobId, rev.id, { expectedVersion: 1 }), 404);
    await expectStatus(releaseWork(w.other, jobId, 1), 404);
  });

  it("another tenant cannot refund a capture by ID", async () => {
    const { jobId, token } = await publishedJob(w.owner, "apparel");
    const c = await customer(token);
    await approvePending(c);
    await pay(c, w.paypal, (await openObligation(jobId)).id);
    const capture = (await one<CaptureRow>(pool(), "SELECT * FROM captures"))!;
    await expectStatus(requestRefund(w.other, capture.id, { amountMinor: 100, reason: "Not mine", operationKey: crypto.randomUUID() }), 404);
    expect(w.paypal.refunds.size).toBe(0);
  });

  it("a customer session for one job cannot touch another job", async () => {
    const a = await publishedJob(w.owner, "apparel");
    const jobs = await many<{ id: string }>(pool(), "SELECT id FROM jobs WHERE id <> $1", [a.jobId]);
    const otherJob = jobs[0].id;
    const c = await customer(a.token);
    const otherRev = await pendingRevision(w.owner, otherJob);
    await expectStatus(decide(c, otherRev.id, { action: "APPROVE", contentHash: otherRev.content_hash }), 404);
    // Approve the other job via its own link, then try to pay its obligation with the first job's session.
    const otherLink = await one<{ id: string }>(pool(), "SELECT id FROM review_invitations WHERE job_id = $1", [otherJob]);
    expect(otherLink).toBeTruthy();
    const { jobId: freshJob, token: freshToken } = await publishedJob(w.owner, "website");
    const c2 = await customer(freshToken);
    await approvePending(c2);
    const ob = await openObligation(freshJob);
    await expectStatus(startCheckout(c, ob.id, ORIGIN), 404);
    const checkout = await startCheckout(c2, ob.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    await expectStatus(captureCheckout(c, checkout.operationId), 404);
  });

  it("fulfillment staff can read the job sheet but cannot change commercial terms", async () => {
    const { jobId } = await publishedJob(w.owner, "website");
    const sheet = await fulfillmentSheet(w.team, jobId);
    expect(sheet.actionable).toBe(false);
    expect(JSON.stringify(sheet)).not.toMatch(/example\.test/); // no customer contact details
    const j = await job(w.owner, jobId);
    const scope = { ...(await pendingRevision(w.owner, jobId)).content.scope, pages: 9 };
    await expectStatus(createManualDraft(w.team, jobId, { expectedVersion: j.version, scope, lineItems: suggested("website", scope), depositBps: 5000 }), 403);
    await expectStatus(releaseWork(w.team, jobId, j.version), 403);
  });

  it("invalid, forged and expired tokens do not authenticate", async () => {
    expect(await exchangeInvitation("not-a-real-token-but-long-enough")).toEqual({ ok: false, reason: "invalid" });
    expect(await exchangeInvitation("../../etc")).toEqual({ ok: false, reason: "invalid" });
    await expectStatus(customerFromSession("forged-session-token"), 401);
    await expectStatus(merchantFromSession("forged-session-token"), 401);
    const { token } = await publishedJob(w.owner, "apparel");
    await pool().query("UPDATE review_invitations SET expires_at = now() - interval '1 minute'");
    expect(await exchangeInvitation(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("login checks the password and issues a revocable session", async () => {
    await expectStatus(login("owner@test.example", "wrong"), 401);
    await expectStatus(login("nobody@test.example", "test-password"), 401);
    const { token, actor } = await login("OWNER@test.example", "test-password");
    expect(actor.tenantId).toBe(w.owner.tenantId);
    expect((await merchantFromSession(token)).userId).toBe(w.owner.userId);
    const stored = await many<{ token_hash: string }>(pool(), "SELECT token_hash FROM merchant_sessions");
    expect(stored.map((s) => s.token_hash)).not.toContain(token); // only hashes are stored
  });
});

describe("concurrency", () => {
  it("two amendments racing on the same version: one wins, the other gets a conflict", async () => {
    const { jobId, token } = await publishedJob(w.owner, "website");
    await approvePending(await customer(token));
    const j = await job(w.owner, jobId);
    const base = (await merchantJobView(w.owner, jobId)).effective!.content.scope;
    const results = await Promise.allSettled(
      [6, 7].map((pages) => {
        const scope = { ...base, pages };
        return createManualDraft(w.owner, jobId, { expectedVersion: j.version, scope, lineItems: suggested("website", scope), depositBps: 5000 });
      }),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.status).toBe(409);
    expect(await many(pool(), "SELECT 1 FROM agreement_revisions WHERE job_id = $1 AND status = 'DRAFT'", [jobId])).toHaveLength(1);
  });

  it("concurrent approvals of the same proposal create one approval and one obligation", async () => {
    const { jobId, token } = await publishedJob(w.owner, "apparel");
    const c = await customer(token);
    const rev = await pendingRevision(w.owner, jobId);
    const results = await Promise.allSettled([1, 2, 3].map(() => decide(c, rev.id, { action: "APPROVE", contentHash: rev.content_hash })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await many(pool(), "SELECT 1 FROM approvals WHERE revision_id = $1", [rev.id])).toHaveLength(1);
    expect(await obligations(jobId)).toHaveLength(1);
  });

  it("a stale version is refused with 409 and the current version", async () => {
    const { jobId, token } = await publishedJob(w.owner, "apparel");
    await approvePending(await customer(token));
    const { changeRequestId } = await addMessage(w.owner, jobId, { authorLabel: "Customer", authorRole: "customer", body: "Cancel the whole order." });
    await analyzeChangeRequest({ kind: "system", tenantId: w.owner.tenantId, reason: "test" }, changeRequestId);
    try {
      await reviewChangeRequest(w.owner, jobId, changeRequestId, { decision: "reject", expectedVersion: 1, note: "stale attempt" });
      throw new Error("should conflict");
    } catch (err) {
      expect((err as { status: number }).status).toBe(409);
      expect((err as { details: { currentVersion: number } }).details.currentVersion).toBe((await job(w.owner, jobId)).version);
    }
  });
});
