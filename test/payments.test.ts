import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CustomerActor } from "../src/application/actors";
import { releaseWork } from "../src/application/fulfillment";
import { readiness } from "../src/application/ledger";
import {
  captureCheckout,
  handleWebhook,
  reconcileAll,
  reconcileObligation,
  requestRefund,
  resolveCaptureReview,
  startCheckout,
} from "../src/application/payments";
import { createManualDraft, publishRevision } from "../src/application/revisions";
import { closePool, many, one, pool } from "../src/persistence/db";
import type { CaptureRow, ObligationRow } from "../src/persistence/repo";
import { approvePending, customer, expectStatus, job, obligations, openObligation, ORIGIN, pay, pendingRevision, publishedJob, suggested, world, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await world();
});
afterAll(closePool);

async function depositDue(domain: "apparel" | "website" = "apparel") {
  const { jobId, token } = await publishedJob(w.owner, domain);
  const c = await customer(token);
  await approvePending(c);
  return { jobId, c, deposit: await openObligation(jobId) };
}

async function obligation(id: string): Promise<ObligationRow> {
  return (await one<ObligationRow>(pool(), "SELECT * FROM payment_obligations WHERE id = $1", [id]))!;
}

async function orderFor(operationId: string): Promise<string> {
  return (await one<{ provider_order_id: string }>(pool(), "SELECT provider_order_id FROM payment_operations WHERE id = $1", [operationId]))!.provider_order_id;
}

const signed = { authAlgo: "SHA256withRSA", certUrl: "https://api.sandbox.paypal.com/cert", transmissionId: "t1", transmissionSig: "valid-test-signature", transmissionTime: new Date().toISOString() };

describe("checkout and capture idempotency", () => {
  it("duplicate checkout requests share one durable operation and one order", async () => {
    const { c, deposit } = await depositDue();
    const results = await Promise.all([startCheckout(c, deposit.id, ORIGIN), startCheckout(c, deposit.id, ORIGIN), startCheckout(c, deposit.id, ORIGIN)]);
    const ops = await many(pool(), "SELECT * FROM payment_operations WHERE obligation_id = $1 AND kind = 'CREATE_ORDER'", [deposit.id]);
    expect(ops).toHaveLength(1);
    expect(w.paypal.orders.size).toBe(1);
    expect(new Set(results.map((r) => (r.kind === "redirect" ? r.approveUrl : r.kind))).size).toBe(1);
  });

  it("duplicate and concurrent capture calls produce one charge", async () => {
    const { c, deposit } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    w.paypal.approve(await orderFor(checkout.operationId));
    const outcomes = await Promise.all([captureCheckout(c, checkout.operationId), captureCheckout(c, checkout.operationId)]);
    const again = await captureCheckout(c, checkout.operationId);
    expect([...outcomes, again].map((o) => o.status)).toContain("COMPLETED");
    expect(w.paypal.captures.size).toBe(1);
    expect(await many(pool(), "SELECT 1 FROM captures")).toHaveLength(1);
    expect((await obligation(deposit.id)).status).toBe("COMPLETED");
    await expectStatus(startCheckout(c, deposit.id, ORIGIN), 409); // already paid
  });

  it("a browser return without buyer approval changes nothing", async () => {
    const { c, deposit, jobId } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    // e.g. someone opens /paypal-return?op=... directly
    const outcome = await captureCheckout(c, checkout.operationId);
    expect(outcome.status).not.toBe("COMPLETED");
    expect(w.paypal.captures.size).toBe(0);
    expect((await readiness(pool(), await job(w.owner, jobId))).blockers.map((b) => b.code)).toContain("DEPOSIT_DUE");
  });
});

describe("uncertain provider outcomes", () => {
  it("capture succeeds at PayPal but the response is lost: UNKNOWN, then recovered without a second charge", async () => {
    const { c, deposit, jobId } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    w.paypal.approve(await orderFor(checkout.operationId));
    w.paypal.failNext("captureOrder", "lost-response");
    const first = await captureCheckout(c, checkout.operationId);
    expect(first.status).toBe("UNKNOWN");
    expect((await obligation(deposit.id)).status).toBe("UNKNOWN");
    expect((await readiness(pool(), await job(w.owner, jobId))).blockers.map((b) => b.code)).toContain("PAYMENT_UNKNOWN");
    await expectStatus(startCheckout(c, deposit.id, ORIGIN), 409); // "Do not pay again yet."

    expect(await reconcileObligation({ kind: "system", tenantId: c.tenantId, reason: "test" }, deposit.id)).toBe("COMPLETED");
    expect(w.paypal.captures.size).toBe(1);
    expect(w.paypal.totalCaptured()).toBe(deposit.amount_minor);
  });

  it("order creation response lost: retried with the same request id, still one order", async () => {
    const { c, deposit } = await depositDue();
    w.paypal.failNext("createOrder", "lost-response");
    const first = await startCheckout(c, deposit.id, ORIGIN);
    expect(first.kind).toBe("status");
    const second = await startCheckout(c, deposit.id, ORIGIN);
    expect(second.kind).toBe("redirect");
    expect(w.paypal.orders.size).toBe(1);
    expect(w.paypal.calls.createOrder).toBe(2);
  });

  it("a process crash after reserving the operation is recovered by the worker", async () => {
    const { c, deposit } = await depositDue();
    w.paypal.failNext("createOrder", "crash");
    await expect(startCheckout(c, deposit.id, ORIGIN)).rejects.toThrow(/simulated process crash/);
    // An unexpected error is recorded as UNKNOWN, never FAILED.
    expect((await one<{ status: string }>(pool(), "SELECT status FROM payment_operations WHERE obligation_id = $1", [deposit.id]))!.status).toBe("UNKNOWN");
    // Model a process that died before the finalize transaction ran at all.
    await pool().query("UPDATE payment_operations SET status = 'RESERVED' WHERE obligation_id = $1", [deposit.id]);
    await reconcileAll(0);
    const recovered = await one<{ status: string; provider_order_id: string }>(pool(), "SELECT status, provider_order_id FROM payment_operations WHERE obligation_id = $1", [deposit.id]);
    expect(recovered!.status).toBe("SUCCEEDED");
    expect(w.paypal.orders.size).toBe(1);
  });

  it("a definitive decline lets the customer try again with a new order", async () => {
    const { c, deposit } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    w.paypal.approve(await orderFor(checkout.operationId));
    w.paypal.failNext("captureOrder", "reject", "TRANSACTION_REFUSED");
    expect((await captureCheckout(c, checkout.operationId)).status).toBe("FAILED");
    expect(w.paypal.captures.size).toBe(0);
    const retry = await pay(c, w.paypal, deposit.id);
    expect(retry.outcome.status).toBe("COMPLETED");
    expect(w.paypal.orders.size).toBe(2);
    expect(w.paypal.captures.size).toBe(1);
  });
});

describe("pending captures and webhooks", () => {
  it("a pending capture blocks fulfillment until a verified event settles it", async () => {
    const { c, deposit, jobId } = await depositDue();
    w.paypal.captureStatus = "PENDING";
    const { outcome } = await pay(c, w.paypal, deposit.id);
    expect(outcome.status).toBe("PENDING");
    const j = await job(w.owner, jobId);
    expect((await readiness(pool(), j)).blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["PAYMENT_PENDING", "DEPOSIT_DUE"]));
    await expectStatus(releaseWork(w.owner, jobId, j.version), 409);

    const capture = (await one<CaptureRow>(pool(), "SELECT * FROM captures"))!;
    w.paypal.settle(capture.provider_capture_id);
    const event = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture", resource: { id: capture.provider_capture_id } };
    expect(await handleWebhook(signed, JSON.stringify(event))).toEqual({ status: 200, result: "accepted" });
    expect(await handleWebhook(signed, JSON.stringify(event))).toEqual({ status: 200, result: "duplicate" });
    expect(await many(pool(), "SELECT 1 FROM payment_events")).toHaveLength(1);
    expect((await obligation(deposit.id)).status).toBe("COMPLETED");
    expect((await readiness(pool(), await job(w.owner, jobId))).blockers).toEqual([]);
  });

  it("an out-of-order PENDING event cannot regress a completed capture", async () => {
    const { c, deposit } = await depositDue();
    await pay(c, w.paypal, deposit.id);
    const capture = (await one<CaptureRow>(pool(), "SELECT * FROM captures"))!;
    w.paypal.settle(capture.provider_capture_id, "PENDING"); // stale provider view replayed
    await handleWebhook(signed, JSON.stringify({ id: "WH-late", event_type: "PAYMENT.CAPTURE.PENDING", resource: { id: capture.provider_capture_id } }));
    expect((await one<CaptureRow>(pool(), "SELECT * FROM captures"))!.provider_status).toBe("COMPLETED");
    expect((await obligation(deposit.id)).status).toBe("COMPLETED");
  });

  it("a forged webhook is rejected and changes nothing", async () => {
    const { c, deposit } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    const forged = { id: "WH-forged", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: await orderFor(checkout.operationId) } };
    expect((await handleWebhook({ ...signed, transmissionSig: "forged" }, JSON.stringify(forged))).status).toBe(400);
    expect(await many(pool(), "SELECT 1 FROM payment_events")).toHaveLength(0);
    expect(w.paypal.calls.captureOrder).toBe(0);
    expect((await obligation(deposit.id)).status).toBe("PROCESSING");
  });

  it("a verified ORDER.APPROVED event captures on the server if the buyer never returns", async () => {
    const { c, deposit } = await depositDue();
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    const orderId = await orderFor(checkout.operationId);
    w.paypal.approve(orderId);
    await handleWebhook(signed, JSON.stringify({ id: "WH-approved", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: orderId } }));
    expect((await obligation(deposit.id)).status).toBe("COMPLETED");
    expect(w.paypal.captures.size).toBe(1);
  });

  it("an event for an unknown resource goes to the exception queue", async () => {
    w.paypal.captures.set("CAP-unknown", { id: "CAP-unknown", status: "COMPLETED", amount: { currency: "USD", minor: 100 }, orderId: "ORDER-x", customId: null, invoiceId: null, payeeMerchantId: null });
    await handleWebhook(signed, JSON.stringify({ id: "WH-unknown", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-unknown" } }));
    expect((await one<{ status: string }>(pool(), "SELECT status FROM payment_events"))!.status).toBe("UNMATCHED");
  });
});

describe("stale revisions", () => {
  it("payment for a replaced revision is preserved as REVIEW_REQUIRED and never releases work", async () => {
    const { jobId, c, deposit } = await depositDue();
    // Customer opens checkout for revision 1's deposit and approves at PayPal...
    const checkout = await startCheckout(c, deposit.id, ORIGIN);
    if (checkout.kind !== "redirect") throw new Error("expected redirect");
    w.paypal.approve(await orderFor(checkout.operationId));
    // ...meanwhile the merchant publishes revision 2 and the customer approves it.
    let j = await job(w.owner, jobId);
    const base = (await pendingRevision(w.owner, jobId).catch(() => null)) ?? null;
    expect(base).toBeNull();
    const effective = (await one<{ content: { scope: Record<string, unknown> } }>(pool(), "SELECT content FROM agreement_revisions WHERE id = $1", [j.effective_revision_id]))!;
    const scope = { ...effective.content.scope, garment_color: "Navy" };
    const draft = await createManualDraft(w.owner, jobId, { expectedVersion: j.version, scope: scope as never, lineItems: suggested("apparel", scope), depositBps: 5000 });
    j = await job(w.owner, jobId);
    await publishRevision(w.owner, jobId, draft.id, { expectedVersion: j.version });
    await approvePending(c);
    expect((await obligation(deposit.id)).status).toBe("CANCELLED");

    // The old checkout is captured late.
    const outcome = await captureCheckout(c, checkout.operationId);
    expect(outcome.status).toBe("REVIEW_REQUIRED");
    const capture = (await one<CaptureRow>(pool(), "SELECT * FROM captures"))!;
    expect(capture.credited).toBe(false);
    j = await job(w.owner, jobId);
    const blocked = (await readiness(pool(), j)).blockers.map((b) => b.code);
    expect(blocked).toEqual(expect.arrayContaining(["PAYMENT_REVIEW", "DEPOSIT_DUE"]));
    await expectStatus(releaseWork(w.owner, jobId, j.version), 409);

    // Merchant explicitly carries it forward; the new deposit request no longer needs payment.
    await resolveCaptureReview(w.owner, capture.id, "credit_to_current", "Same order, colour change only");
    const all = await obligations(jobId);
    expect(all.find((o) => o.id === deposit.id)!.status).toBe("COMPLETED");
    expect(all.find((o) => o.id !== deposit.id)!.status).toBe("NOT_REQUIRED");
    j = await job(w.owner, jobId);
    expect((await readiness(pool(), j)).blockers).toEqual([]);
    expect(w.paypal.captures.size).toBe(1);
  });
});

describe("refunds", () => {
  async function paidCapture(): Promise<{ c: CustomerActor; capture: CaptureRow }> {
    const { c, deposit } = await depositDue();
    await pay(c, w.paypal, deposit.id);
    return { c, capture: (await one<CaptureRow>(pool(), "SELECT * FROM captures"))! };
  }

  it("a retried partial refund refunds once", async () => {
    const { capture } = await paidCapture();
    const key = crypto.randomUUID();
    const a = await requestRefund(w.owner, capture.id, { amountMinor: 5000, reason: "Remove one colour", operationKey: key });
    const b = await requestRefund(w.owner, capture.id, { amountMinor: 5000, reason: "Remove one colour", operationKey: key });
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("COMPLETED");
    expect(w.paypal.refunds.size).toBe(1);
    expect((await obligation(capture.obligation_id)).status).toBe("PARTIALLY_REFUNDED");
    expect((await one<CaptureRow>(pool(), "SELECT * FROM captures WHERE id = $1", [capture.id]))!.provider_status).toBe("PARTIALLY_REFUNDED");
  });

  it("concurrent refunds cannot exceed the capture, including pending ones", async () => {
    const { capture } = await paidCapture();
    w.paypal.refundStatus = "PENDING";
    const results = await Promise.allSettled([
      requestRefund(w.owner, capture.id, { amountMinor: 20000, reason: "Concurrent A", operationKey: crypto.randomUUID() }),
      requestRefund(w.owner, capture.id, { amountMinor: 20000, reason: "Concurrent B", operationKey: crypto.randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.status)).toEqual([422]);
    expect(w.paypal.refunds.size).toBe(1);
    await expectStatus(requestRefund(w.owner, capture.id, { amountMinor: 10001, reason: "Too much", operationKey: crypto.randomUUID() }), 422);
  });

  it("a lost refund response stays UNKNOWN and recovers with the same request id", async () => {
    const { capture } = await paidCapture();
    w.paypal.failNext("refundCapture", "lost-response");
    const r = await requestRefund(w.owner, capture.id, { amountMinor: 30000, reason: "Order cancelled", operationKey: crypto.randomUUID() });
    expect(r.status).toBe("UNKNOWN");
    await reconcileAll(0);
    const after = (await one<{ status: string }>(pool(), "SELECT status FROM refund_operations WHERE id = $1", [r.id]))!;
    expect(after.status).toBe("COMPLETED");
    expect(w.paypal.refunds.size).toBe(1);
    expect((await obligation(capture.obligation_id)).status).toBe("REFUNDED");
  });
});
