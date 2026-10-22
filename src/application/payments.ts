import type { z } from "zod";
import { amountDue, obligationStatusAfterRefunds, refundableCapacity, UNSETTLED, type FundingStatus } from "@/domain/funding";
import { revisionDeposit } from "@/domain/revision";
import { template } from "@/domain/templates";
import { configuredMerchantId, paymentProvider } from "@/integrations/paypal/http";
import {
  ProviderRejectedError,
  ProviderUncertainError,
  type ProviderCapture,
  type ProviderOrder,
  type ProviderRefund,
  type WebhookHeaders,
} from "@/integrations/paypal/provider";
import { many, one, pool, withTx, type Tx } from "@/persistence/db";
import {
  audit,
  expectVersion,
  getObligation,
  getRevision,
  lockJob,
  newId,
  setObligationStatus,
  updateJob,
  type CaptureRow,
  type JobRow,
  type ObligationRow,
  type PaymentOperationRow,
  type RefundRow,
} from "@/persistence/repo";
import { requireOwner, type CustomerActor, type MerchantActor, type SystemActor } from "./actors";
import { ConflictError, NotFoundError, ServiceUnavailableError, UnprocessableError } from "./errors";
import { completedRefunds, jobCredited, reservedRefunds } from "./ledger";
import type { RefundInput } from "./schemas";
import { sha256 } from "./tokens";

// Rules: reserve a durable operation in one transaction, call PayPal outside
// any transaction, finalize in a second transaction. Lost responses become
// UNKNOWN and are recovered by retrying the same PayPal-Request-Id or reading
// the known provider resource. Only verified provider data changes funding.

const SETTLED: readonly FundingStatus[] = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "NOT_REQUIRED"];
const SETTLED_CAPTURE = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"];

type PaymentActor = CustomerActor | SystemActor | MerchantActor;

function errorText(err: unknown): string {
  if (err instanceof ProviderRejectedError) return `${err.errorName}${err.issue ? `:${err.issue}` : ""}`;
  return err instanceof Error ? err.message.slice(0, 300) : "error";
}

function debugIdOf(err: unknown): string | null {
  return err instanceof ProviderRejectedError || err instanceof ProviderUncertainError ? err.debugId : null;
}

async function lockOperation(tx: Tx, tenantId: string, id: string): Promise<PaymentOperationRow> {
  const op = await one<PaymentOperationRow>(tx, "SELECT * FROM payment_operations WHERE tenant_id = $1 AND id = $2 FOR UPDATE", [tenantId, id]);
  if (!op) throw new NotFoundError("Payment operation");
  return op;
}

function orderPayload(o: ObligationRow) {
  return { obligationId: o.id, revisionId: o.revision_id, amountMinor: o.amount_minor, currency: o.currency, generation: o.checkout_generation };
}

/** Marks the live order unusable so the next checkout opens a new order. No money moved. */
async function retireOrder(tx: Tx, op: PaymentOperationRow, o: ObligationRow, reason: string): Promise<void> {
  await tx.query("UPDATE payment_operations SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1", [op.id, reason]);
  await tx.query(
    "UPDATE payment_obligations SET checkout_generation = checkout_generation + 1, status = CASE WHEN status = 'PROCESSING' THEN 'DUE' ELSE status END, updated_at = now() WHERE id = $1",
    [o.id],
  );
}

// ---------------------------------------------------------------- checkout

export type CheckoutResult =
  | { kind: "redirect"; approveUrl: string; operationId: string }
  | { kind: "capture"; operationId: string }
  | { kind: "status"; status: FundingStatus; message: string };

/** Creates, or returns the existing, single PayPal order for one obligation. Requires the customer's explicit click. */
export async function startCheckout(actor: CustomerActor, obligationId: string, origin: string, attempt = 0): Promise<CheckoutResult> {
  const reserved = await withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, actor.jobId);
    const o = await getObligation(tx, actor.tenantId, obligationId, true);
    if (o.job_id !== job.id) throw new NotFoundError("Payment");
    if (SETTLED.includes(o.status)) throw new ConflictError("This payment has already been received.");
    if (o.status === "CANCELLED") throw new ConflictError("This payment request was replaced. Review the current agreement.");
    if (o.status === "UNKNOWN" || o.status === "PENDING") throw new ConflictError("We are checking the payment result. Do not pay again yet.", { status: o.status });
    if (o.status === "REVIEW_REQUIRED") throw new ConflictError("This payment is being reviewed by the business.");
    if (o.revision_id !== job.effective_revision_id) throw new ConflictError("This proposal has been replaced. Review the current version.");
    const live = await one<PaymentOperationRow>(
      tx,
      "SELECT * FROM payment_operations WHERE obligation_id = $1 AND kind = 'CREATE_ORDER' AND status <> 'FAILED' FOR UPDATE",
      [o.id],
    );
    if (live) return { op: live, obligation: o, job };
    const op = await one<PaymentOperationRow>(
      tx,
      `INSERT INTO payment_operations (id, tenant_id, job_id, obligation_id, kind, idempotency_key, payload_hash, status)
       VALUES ($1, $2, $3, $4, 'CREATE_ORDER', $5, $6, 'RESERVED') RETURNING *`,
      [newId(), o.tenant_id, o.job_id, o.id, `pact-order-${o.id}-${o.checkout_generation}`, sha256(JSON.stringify(orderPayload(o)))],
    );
    await setObligationStatus(tx, o, "PROCESSING");
    await audit(tx, { tenantId: o.tenant_id, jobId: o.job_id, actorType: "customer", actorId: actor.customerId, action: "payment.checkout_reserved", details: { obligationId: o.id, operationId: op!.id, amountMinor: o.amount_minor } });
    return { op: op!, obligation: o, job };
  });

  const { op, obligation, job } = reserved;
  if (op.status === "SUCCEEDED" && op.provider_order_id) {
    let order: ProviderOrder | null = null;
    let gone = false;
    try {
      order = await paymentProvider().getOrder(op.provider_order_id);
    } catch (err) {
      // PayPal no longer has the order (expired or purged): it can never be paid, so open a new one.
      // Any other read failure keeps offering the stored approval link.
      gone = err instanceof ProviderRejectedError && err.status === 404;
    }
    if (order && (order.status === "APPROVED" || order.status === "COMPLETED")) return { kind: "capture", operationId: op.id };
    if (gone || (order && order.status === "VOIDED")) {
      if (attempt > 0) throw new ServiceUnavailableError("PayPal could not open a checkout. Try again shortly.");
      await withTx(async (tx) => {
        await lockJob(tx, actor.tenantId, actor.jobId);
        await retireOrder(tx, op, obligation, gone ? "ORDER_NOT_FOUND" : "ORDER_VOIDED");
      });
      return startCheckout(actor, obligationId, origin, attempt + 1);
    }
    return { kind: "redirect", approveUrl: op.approve_url!, operationId: op.id };
  }
  return createOrderForOperation(op, obligation, job, origin);
}

async function createOrderForOperation(op: PaymentOperationRow, o: ObligationRow, job: JobRow, origin: string): Promise<CheckoutResult> {
  const tenant = await one<{ name: string }>(pool(), "SELECT name FROM tenants WHERE id = $1", [job.tenant_id]);
  let order: ProviderOrder;
  try {
    order = await paymentProvider().createOrder({
      requestId: op.idempotency_key,
      amount: { currency: o.currency, minor: o.amount_minor },
      customId: o.id,
      invoiceId: `pact-${o.id}-${o.checkout_generation}`,
      description: `${job.title} - ${o.purpose.replace("_", " ").toLowerCase()}`,
      returnUrl: `${origin}/portal/${job.id}/paypal-return?op=${op.id}`,
      cancelUrl: `${origin}/portal/${job.id}?checkout=cancelled`,
      shipping: template(job.domain).physicalGoods ? "GET_FROM_FILE" : "NO_SHIPPING",
      brandName: tenant?.name ?? "Pact merchant",
    });
  } catch (err) {
    await withTx(async (tx) => {
      await lockJob(tx, job.tenant_id, job.id);
      const current = await lockOperation(tx, job.tenant_id, op.id);
      if (current.status === "SUCCEEDED") return;
      if (err instanceof ProviderRejectedError) {
        await retireOrder(tx, current, o, errorText(err));
      } else {
        await tx.query("UPDATE payment_operations SET status = 'UNKNOWN', attempts = attempts + 1, last_error = $2, provider_debug_id = $3, updated_at = now() WHERE id = $1", [
          op.id,
          errorText(err),
          debugIdOf(err),
        ]);
      }
      await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "provider", actorId: "paypal", action: err instanceof ProviderRejectedError ? "payment.order_rejected" : "payment.order_unknown", details: { operationId: op.id, error: errorText(err) } });
    });
    if (err instanceof ProviderRejectedError) throw new ServiceUnavailableError("PayPal could not open a checkout. Try again shortly.");
    if (err instanceof ProviderUncertainError) {
      return { kind: "status", status: "PROCESSING", message: "We could not confirm the checkout was created. Try again; you will not be charged twice." };
    }
    throw err;
  }
  if (!order.approveUrl || order.amount?.minor !== o.amount_minor || order.amount.currency !== o.currency) {
    throw new ServiceUnavailableError("PayPal returned an unexpected checkout. Nothing was charged.");
  }
  await withTx(async (tx) => {
    await lockJob(tx, job.tenant_id, job.id);
    await tx.query(
      `UPDATE payment_operations SET status = 'SUCCEEDED', provider_order_id = $2, approve_url = $3, attempts = attempts + 1, last_error = NULL, updated_at = now() WHERE id = $1`,
      [op.id, order.id, order.approveUrl],
    );
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "provider", actorId: "paypal", action: "payment.order_created", details: { operationId: op.id, orderId: order.id } });
  });
  return { kind: "redirect", approveUrl: order.approveUrl, operationId: op.id };
}

// ---------------------------------------------------------------- capture

export type CaptureOutcome = { status: FundingStatus; message: string };

function verifyOrderMatches(order: ProviderOrder, o: ObligationRow): string | null {
  if (!order.amount || order.amount.minor !== o.amount_minor || order.amount.currency !== o.currency) return "amount or currency differs";
  if (order.customId !== o.id) return "order reference differs";
  const merchant = configuredMerchantId();
  if (merchant && order.payeeMerchantId && order.payeeMerchantId !== merchant) return "payee differs";
  return null;
}

function outcomeMessage(status: FundingStatus): string {
  switch (status) {
    case "COMPLETED":
    case "PARTIALLY_REFUNDED":
    case "REFUNDED":
    case "NOT_REQUIRED":
      return "Payment received and confirmed with PayPal.";
    case "PENDING":
      return "Payment is pending. Work has not been released.";
    case "UNKNOWN":
      return "We are checking the payment result. Do not pay again yet.";
    case "REVIEW_REQUIRED":
      return "Payment received for a proposal that was replaced. The business will review it with you.";
    case "FAILED":
      return "PayPal did not complete the payment. You can try again.";
    default:
      return "Payment not completed yet.";
  }
}

/**
 * Captures an order the buyer approved, after checking the order with PayPal.
 * A browser return alone never marks anything paid. Safe to call repeatedly.
 */
export async function captureCheckout(actor: PaymentActor, operationId: string): Promise<CaptureOutcome> {
  const tenantId = actor.tenantId;
  const reserved = await withTx(async (tx) => {
    const createOp = await one<PaymentOperationRow>(tx, "SELECT * FROM payment_operations WHERE tenant_id = $1 AND id = $2 AND kind = 'CREATE_ORDER'", [tenantId, operationId]);
    if (!createOp || (actor.kind === "customer" && createOp.job_id !== actor.jobId)) throw new NotFoundError("Payment");
    await lockJob(tx, tenantId, createOp.job_id);
    const o = await getObligation(tx, tenantId, createOp.obligation_id, true);
    if (createOp.status !== "SUCCEEDED" || !createOp.provider_order_id) return { done: { status: o.status, message: outcomeMessage(o.status) } };
    const existing = await one<PaymentOperationRow>(
      tx,
      "SELECT * FROM payment_operations WHERE provider_order_id = $1 AND kind = 'CAPTURE_ORDER' AND status <> 'FAILED' FOR UPDATE",
      [createOp.provider_order_id],
    );
    if (existing?.status === "SUCCEEDED") return { done: { status: o.status, message: outcomeMessage(o.status) } };
    if (existing) return { createOp, captureOp: existing, obligation: o };
    const failed = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM payment_operations WHERE provider_order_id = $1 AND kind = 'CAPTURE_ORDER'", [createOp.provider_order_id]);
    const captureOp = await one<PaymentOperationRow>(
      tx,
      `INSERT INTO payment_operations (id, tenant_id, job_id, obligation_id, kind, idempotency_key, payload_hash, status, provider_order_id)
       VALUES ($1, $2, $3, $4, 'CAPTURE_ORDER', $5, $6, 'RESERVED', $7) RETURNING *`,
      [newId(), tenantId, createOp.job_id, o.id, `pact-capture-${createOp.provider_order_id}-${failed!.n}`, sha256(JSON.stringify(orderPayload(o))), createOp.provider_order_id],
    );
    return { createOp, captureOp: captureOp!, obligation: o };
  });
  if ("done" in reserved && reserved.done) return reserved.done;
  const { createOp, captureOp, obligation } = reserved as { createOp: PaymentOperationRow; captureOp: PaymentOperationRow; obligation: ObligationRow };
  const orderId = createOp.provider_order_id!;
  const provider = paymentProvider();

  let order: ProviderOrder;
  try {
    order = await provider.getOrder(orderId);
  } catch (err) {
    if (captureOp.status === "UNKNOWN") return { status: "UNKNOWN", message: outcomeMessage("UNKNOWN") };
    throw new ServiceUnavailableError(`Could not check the payment with PayPal (${errorText(err)}). Try again shortly.`);
  }

  const mismatch = verifyOrderMatches(order, obligation);
  if (mismatch) {
    await failCapture(captureOp, createOp, obligation, `ORDER_MISMATCH: ${mismatch}`, true);
    return { status: "DUE", message: "The PayPal order did not match this payment request. Nothing was recorded; please try again." };
  }

  let captures: ProviderCapture[];
  if (order.status === "COMPLETED") {
    captures = order.captures;
  } else if (order.status === "APPROVED") {
    try {
      captures = (await provider.captureOrder(orderId, captureOp.idempotency_key)).captures;
    } catch (err) {
      if (err instanceof ProviderRejectedError && err.issue === "ORDER_ALREADY_CAPTURED") {
        captures = (await provider.getOrder(orderId)).captures;
      } else if (err instanceof ProviderRejectedError) {
        const retireOrderToo = !["INSTRUMENT_DECLINED", "PAYER_ACTION_REQUIRED"].includes(err.issue ?? "");
        await failCapture(captureOp, createOp, obligation, errorText(err), retireOrderToo);
        return { status: "FAILED", message: outcomeMessage("FAILED") };
      } else {
        await markCaptureUnknown(captureOp, obligation, err);
        return { status: "UNKNOWN", message: outcomeMessage("UNKNOWN") };
      }
    }
  } else if (order.status === "VOIDED") {
    await failCapture(captureOp, createOp, obligation, "ORDER_VOIDED", true);
    return { status: "DUE", message: "The PayPal checkout expired. You can start a new one." };
  } else {
    await failCapture(captureOp, createOp, obligation, `ORDER_NOT_APPROVED:${order.status}`, false);
    return { status: "PROCESSING", message: "PayPal has not confirmed your approval yet. Nothing was charged." };
  }

  if (captures.length === 0) {
    await markCaptureUnknown(captureOp, obligation, new Error("capture response had no capture"));
    return { status: "UNKNOWN", message: outcomeMessage("UNKNOWN") };
  }
  let status: FundingStatus = obligation.status;
  for (const c of captures) {
    // Prefer the independently retrieved capture; fall back to the response if the read fails.
    const authoritative = await provider.getCapture(c.id).catch(() => c);
    status = await recordCapture(tenantId, obligation.id, { ...authoritative, orderId }, `capture:${actor.kind}`);
  }
  return { status, message: outcomeMessage(status) };
}

async function failCapture(captureOp: PaymentOperationRow, createOp: PaymentOperationRow, o: ObligationRow, reason: string, retire: boolean) {
  await withTx(async (tx) => {
    await lockJob(tx, o.tenant_id, o.job_id);
    await tx.query("UPDATE payment_operations SET status = 'FAILED', last_error = $2, attempts = attempts + 1, updated_at = now() WHERE id = $1 AND status <> 'SUCCEEDED'", [captureOp.id, reason]);
    const fresh = await getObligation(tx, o.tenant_id, o.id, true);
    if (retire) await retireOrder(tx, createOp, fresh, reason);
    await audit(tx, { tenantId: o.tenant_id, jobId: o.job_id, actorType: "provider", actorId: "paypal", action: "payment.capture_not_completed", details: { operationId: captureOp.id, reason } });
  });
}

async function markCaptureUnknown(captureOp: PaymentOperationRow, o: ObligationRow, err: unknown) {
  await withTx(async (tx) => {
    await lockJob(tx, o.tenant_id, o.job_id);
    await tx.query("UPDATE payment_operations SET status = 'UNKNOWN', attempts = attempts + 1, last_error = $2, provider_debug_id = $3, updated_at = now() WHERE id = $1 AND status <> 'SUCCEEDED'", [
      captureOp.id,
      errorText(err),
      debugIdOf(err),
    ]);
    const fresh = await getObligation(tx, o.tenant_id, o.id, true);
    if (!SETTLED.includes(fresh.status) && fresh.status !== "REVIEW_REQUIRED") await setObligationStatus(tx, fresh, "UNKNOWN");
    await audit(tx, { tenantId: o.tenant_id, jobId: o.job_id, actorType: "provider", actorId: "paypal", action: "payment.capture_unknown", details: { operationId: captureOp.id, error: errorText(err) } });
  });
}

/**
 * The single place that applies authoritative capture data. Re-checks under
 * the job lock whether the paid obligation still belongs to the effective
 * revision; if not, the money is preserved and flagged REVIEW_REQUIRED.
 */
export async function recordCapture(tenantId: string, obligationId: string, capture: ProviderCapture, source: string): Promise<FundingStatus> {
  return withTx(async (tx) => {
    const pre = await getObligation(tx, tenantId, obligationId);
    const job = await lockJob(tx, tenantId, pre.job_id);
    const o = await getObligation(tx, tenantId, obligationId, true);
    const existing = await one<CaptureRow>(tx, "SELECT * FROM captures WHERE provider_capture_id = $1 FOR UPDATE", [capture.id]);
    if (existing && existing.obligation_id !== o.id) throw new ConflictError("Capture is already linked to another payment");
    const amountMatches = capture.amount.minor === o.amount_minor && capture.amount.currency === o.currency && (!capture.customId || capture.customId === o.id);
    const current = o.revision_id === job.effective_revision_id && o.status !== "CANCELLED" && o.status !== "REVIEW_REQUIRED";

    let providerStatus = capture.status;
    if (existing && SETTLED_CAPTURE.includes(existing.provider_status) && capture.status === "PENDING") {
      providerStatus = existing.provider_status; // out-of-order event: never regress a settled capture
    }
    const credited = existing ? existing.credited : current && amountMatches;
    if (existing) {
      await tx.query("UPDATE captures SET provider_status = $2, updated_at = now() WHERE id = $1", [existing.id, providerStatus]);
    } else {
      await tx.query(
        `INSERT INTO captures (id, tenant_id, job_id, obligation_id, provider_order_id, provider_capture_id, amount_minor, currency, provider_status, credited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [newId(), tenantId, job.id, o.id, capture.orderId ?? "", capture.id, capture.amount.minor, capture.amount.currency, providerStatus, credited],
      );
    }
    await tx.query(
      "UPDATE payment_operations SET status = 'SUCCEEDED', provider_capture_id = $1, updated_at = now() WHERE provider_order_id = $2 AND kind = 'CAPTURE_ORDER' AND status <> 'FAILED'",
      [capture.id, capture.orderId],
    );

    let status: FundingStatus = o.status;
    if (providerStatus === "DECLINED" || providerStatus === "FAILED") {
      const createOp = await one<PaymentOperationRow>(tx, "SELECT * FROM payment_operations WHERE obligation_id = $1 AND kind = 'CREATE_ORDER' AND status = 'SUCCEEDED' AND provider_order_id = $2", [o.id, capture.orderId]);
      if (createOp) await retireOrder(tx, createOp, o, `CAPTURE_${providerStatus}`);
      status = o.status === "CANCELLED" ? "CANCELLED" : "FAILED";
    } else if (!credited && (SETTLED_CAPTURE.includes(providerStatus) || providerStatus === "PENDING")) {
      status = "REVIEW_REQUIRED";
    } else if (providerStatus === "PENDING") {
      status = "PENDING";
    } else if (SETTLED_CAPTURE.includes(providerStatus)) {
      const refunds = await many<RefundRow>(tx, "SELECT * FROM refund_operations WHERE capture_id = (SELECT id FROM captures WHERE provider_capture_id = $1)", [capture.id]);
      status = obligationStatusAfterRefunds(capture.amount.minor, refunds.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amount_minor, 0));
    }
    if (status !== o.status) await setObligationStatus(tx, o, status);
    await audit(tx, {
      tenantId,
      jobId: job.id,
      actorType: "provider",
      actorId: "paypal",
      action: "payment.capture_recorded",
      details: { obligationId: o.id, captureId: capture.id, providerStatus, credited, obligationStatus: status, source, staleRevision: !current, amountMatches },
    });
    return status;
  });
}

// ---------------------------------------------------------------- merchant payment actions

export async function requestBalance(actor: MerchantActor, jobId: string, expectedVersion: number) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    if (!job.effective_revision_id || job.pending_revision_id) throw new ConflictError("Resolve the pending amendment before requesting the balance");
    const rev = await getRevision(tx, job.tenant_id, job.effective_revision_id);
    const { credited } = await jobCredited(tx, job.tenant_id, job.id);
    const open = await one(tx, "SELECT 1 FROM payment_obligations WHERE job_id = $1 AND status = ANY($2)", [job.id, ["DUE", ...UNSETTLED]]);
    if (open) throw new ConflictError("Another payment for this job is still open");
    const balance = rev.total_minor - credited;
    if (balance <= 0) throw new ConflictError("Nothing remains to be paid for this revision");
    const row = await one<ObligationRow>(
      tx,
      `INSERT INTO payment_obligations (id, tenant_id, job_id, revision_id, purpose, amount_minor, currency, credited_before_minor, status)
       VALUES ($1, $2, $3, $4, 'BALANCE', $5, $6, $7, 'DUE') ON CONFLICT (revision_id, purpose) DO NOTHING RETURNING *`,
      [newId(), job.tenant_id, job.id, rev.id, balance, job.currency, credited],
    );
    if (!row) throw new ConflictError("A balance request already exists for this revision");
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "obligation.created", details: { obligationId: row.id, purpose: "BALANCE", amountMinor: balance } });
    await updateJob(tx, job, {});
    return row;
  });
}

/**
 * Merchant decision on money received for a replaced revision: credit it to the
 * current agreement (explicit carry-forward) or keep it in refund review.
 */
export async function resolveCaptureReview(actor: MerchantActor, captureId: string, resolution: "credit_to_current" | "refund_review", note: string) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const pre = await one<CaptureRow>(tx, "SELECT * FROM captures WHERE tenant_id = $1 AND id = $2", [actor.tenantId, captureId]);
    if (!pre) throw new NotFoundError("Capture");
    const job = await lockJob(tx, actor.tenantId, pre.job_id);
    const capture = (await one<CaptureRow>(tx, "SELECT * FROM captures WHERE id = $1 FOR UPDATE", [captureId]))!;
    const o = await getObligation(tx, actor.tenantId, capture.obligation_id, true);
    if (capture.credited || o.status !== "REVIEW_REQUIRED") throw new ConflictError("This payment does not need review");
    if (resolution === "credit_to_current") {
      if (!SETTLED_CAPTURE.includes(capture.provider_status)) throw new ConflictError("Only a completed payment can be credited");
      await tx.query("UPDATE captures SET credited = true, resolution = 'CREDITED_TO_CURRENT', resolved_by = $2, updated_at = now() WHERE id = $1", [capture.id, actor.userId]);
      const refunds = await many<RefundRow>(tx, "SELECT * FROM refund_operations WHERE capture_id = $1", [capture.id]);
      await setObligationStatus(tx, o, obligationStatusAfterRefunds(capture.amount_minor, completedRefunds(refunds, capture.id)));
      // The current revision's open deposit request shrinks by the credited amount.
      if (job.effective_revision_id) {
        const rev = await getRevision(tx, job.tenant_id, job.effective_revision_id);
        const { credited } = await jobCredited(tx, job.tenant_id, job.id);
        const due = amountDue(revisionDeposit(rev.content), credited);
        const openDeposit = await one<ObligationRow>(
          tx,
          "SELECT * FROM payment_obligations WHERE revision_id = $1 AND purpose IN ('DEPOSIT', 'ADDITIONAL_DEPOSIT') AND status IN ('DUE', 'FAILED') FOR UPDATE",
          [rev.id],
        );
        const liveOrder = openDeposit && (await one(tx, "SELECT 1 FROM payment_operations WHERE obligation_id = $1 AND kind = 'CREATE_ORDER' AND status <> 'FAILED'", [openDeposit.id]));
        if (openDeposit && !liveOrder) {
          await setObligationStatus(tx, openDeposit, due === 0 ? "NOT_REQUIRED" : "DUE", due === 0 ? {} : { amount_minor: due });
          await tx.query("UPDATE payment_obligations SET checkout_generation = checkout_generation + 1 WHERE id = $1", [openDeposit.id]);
        }
      }
    } else {
      await tx.query("UPDATE captures SET resolution = 'REFUND_REVIEW', resolved_by = $2, updated_at = now() WHERE id = $1", [capture.id, actor.userId]);
    }
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "payment.review_resolved", details: { captureId: capture.id, resolution, note } });
    await updateJob(tx, job, {});
  });
}

// ---------------------------------------------------------------- refunds

/** Merchant-reviewed refund, bounded by refundable capacity including refunds still in flight. */
export async function requestRefund(actor: MerchantActor, captureId: string, input: z.infer<typeof RefundInput>): Promise<RefundRow> {
  requireOwner(actor);
  const op = await withTx(async (tx) => {
    const pre = await one<CaptureRow>(tx, "SELECT * FROM captures WHERE tenant_id = $1 AND id = $2", [actor.tenantId, captureId]);
    if (!pre) throw new NotFoundError("Capture");
    const job = await lockJob(tx, actor.tenantId, pre.job_id);
    const key = `refund:${input.operationKey}`;
    const prior = await one<RefundRow>(tx, "SELECT * FROM refund_operations WHERE idempotency_key = $1", [key]);
    if (prior) {
      if (prior.capture_id !== captureId || prior.tenant_id !== actor.tenantId) throw new ConflictError("This refund key was already used");
      return prior;
    }
    const capture = (await one<CaptureRow>(tx, "SELECT * FROM captures WHERE id = $1 FOR UPDATE", [captureId]))!;
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(capture.provider_status)) throw new ConflictError("Only a completed payment can be refunded");
    const refunds = await many<RefundRow>(tx, "SELECT * FROM refund_operations WHERE capture_id = $1", [captureId]);
    const capacity = refundableCapacity(capture.amount_minor, completedRefunds(refunds, captureId), reservedRefunds(refunds, captureId));
    if (input.amountMinor > capacity) throw new UnprocessableError(`At most ${capacity} can be refunded right now`, { capacityMinor: capacity });
    const row = await one<RefundRow>(
      tx,
      `INSERT INTO refund_operations (id, tenant_id, job_id, capture_id, idempotency_key, amount_minor, currency, reason, reviewer_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RESERVED') RETURNING *`,
      [newId(), actor.tenantId, job.id, captureId, key, input.amountMinor, capture.currency, input.reason, actor.userId],
    );
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "refund.reserved", details: { refundId: row!.id, captureId, amountMinor: input.amountMinor, reason: input.reason } });
    return row!;
  });
  if (op.status === "RESERVED" || op.status === "UNKNOWN") return submitRefund(op);
  return op;
}

async function submitRefund(op: RefundRow): Promise<RefundRow> {
  const capture = (await one<CaptureRow>(pool(), "SELECT * FROM captures WHERE id = $1", [op.capture_id]))!;
  let refund: ProviderRefund;
  try {
    refund = await paymentProvider().refundCapture({
      requestId: `pact-refund-${op.id}`,
      captureId: capture.provider_capture_id,
      amount: { currency: "USD", minor: op.amount_minor },
      invoiceId: `pact-refund-${op.id}`,
      noteToPayer: op.reason,
    });
  } catch (err) {
    return withTx(async (tx) => {
      await lockJob(tx, op.tenant_id, op.job_id);
      const status = err instanceof ProviderRejectedError ? "FAILED" : "UNKNOWN";
      const row = await one<RefundRow>(
        tx,
        "UPDATE refund_operations SET status = $2, attempts = attempts + 1, last_error = $3, updated_at = now() WHERE id = $1 AND status IN ('RESERVED', 'UNKNOWN') RETURNING *",
        [op.id, status, errorText(err)],
      );
      await audit(tx, { tenantId: op.tenant_id, jobId: op.job_id, actorType: "provider", actorId: "paypal", action: `refund.${status.toLowerCase()}`, details: { refundId: op.id, error: errorText(err) } });
      return row ?? op;
    });
  }
  const confirmed = await paymentProvider().getRefund(refund.id).catch(() => refund);
  const row = await applyRefund(op.tenant_id, op.id, confirmed);
  await refreshCaptureStatus(capture);
  return row;
}

/** Re-reads the capture after a refund so the displayed provider status matches PayPal (e.g. PARTIALLY_REFUNDED). */
async function refreshCaptureStatus(capture: CaptureRow): Promise<void> {
  const fresh = await paymentProvider().getCapture(capture.provider_capture_id).catch(() => null);
  if (!fresh || !SETTLED_CAPTURE.includes(fresh.status)) return;
  await pool().query("UPDATE captures SET provider_status = $2, updated_at = now() WHERE id = $1 AND provider_status = ANY($3)", [
    capture.id,
    fresh.status,
    SETTLED_CAPTURE,
  ]);
}

function refundStatus(providerStatus: string): RefundRow["status"] {
  if (providerStatus === "COMPLETED") return "COMPLETED";
  if (providerStatus === "PENDING") return "PENDING";
  if (providerStatus === "FAILED" || providerStatus === "CANCELLED") return "FAILED";
  return "UNKNOWN";
}

export async function applyRefund(tenantId: string, refundOpId: string, refund: ProviderRefund): Promise<RefundRow> {
  return withTx(async (tx) => {
    const pre = (await one<RefundRow>(tx, "SELECT * FROM refund_operations WHERE tenant_id = $1 AND id = $2", [tenantId, refundOpId]))!;
    const job = await lockJob(tx, tenantId, pre.job_id);
    const op = (await one<RefundRow>(tx, "SELECT * FROM refund_operations WHERE id = $1 FOR UPDATE", [refundOpId]))!;
    let status = refundStatus(refund.status);
    if (op.status === "COMPLETED") status = "COMPLETED"; // never regress a completed refund
    if (refund.amount.minor !== op.amount_minor) status = "UNKNOWN";
    const row = (await one<RefundRow>(
      tx,
      "UPDATE refund_operations SET status = $2, provider_refund_id = $3, provider_status = $4, attempts = attempts + 1, updated_at = now() WHERE id = $1 RETURNING *",
      [op.id, status, refund.id, refund.status],
    ))!;
    const capture = (await one<CaptureRow>(tx, "SELECT * FROM captures WHERE id = $1 FOR UPDATE", [op.capture_id]))!;
    const refunds = await many<RefundRow>(tx, "SELECT * FROM refund_operations WHERE capture_id = $1", [capture.id]);
    const done = completedRefunds(refunds, capture.id);
    const o = await getObligation(tx, tenantId, capture.obligation_id, true);
    const next = obligationStatusAfterRefunds(capture.amount_minor, done);
    if (capture.credited && SETTLED.includes(o.status)) await setObligationStatus(tx, o, next);
    else if (!capture.credited && next === "REFUNDED") await setObligationStatus(tx, o, "REFUNDED");
    await audit(tx, { tenantId, jobId: job.id, actorType: "provider", actorId: "paypal", action: "refund.updated", details: { refundId: op.id, providerRefundId: refund.id, status } });
    return row;
  });
}

// ---------------------------------------------------------------- recovery

/** Re-checks one obligation's open operations with PayPal. Used by "check status" and the worker. */
export async function reconcileObligation(actor: PaymentActor, obligationId: string): Promise<FundingStatus> {
  const o = await getObligation(pool(), actor.tenantId, obligationId);
  if (actor.kind === "customer" && o.job_id !== actor.jobId) throw new NotFoundError("Payment");
  const system: SystemActor = { kind: "system", tenantId: actor.tenantId, reason: "reconcile" };
  const ops = await many<PaymentOperationRow>(pool(), "SELECT * FROM payment_operations WHERE obligation_id = $1 AND status <> 'FAILED' ORDER BY created_at", [o.id]);
  for (const op of ops) {
    if (op.kind === "CREATE_ORDER" && (op.status === "UNKNOWN" || op.status === "RESERVED")) {
      const job = (await one<JobRow>(pool(), "SELECT * FROM jobs WHERE id = $1", [o.job_id]))!;
      await createOrderForOperation(op, await getObligation(pool(), o.tenant_id, o.id), job, process.env.APP_ORIGIN ?? "http://localhost:3000").catch(() => undefined);
    } else if (op.kind === "CREATE_ORDER" && op.status === "SUCCEEDED" && ["PROCESSING", "UNKNOWN"].includes(o.status)) {
      await captureCheckout(system, op.id).catch(() => undefined);
    }
  }
  const captures = await many<CaptureRow>(pool(), "SELECT * FROM captures WHERE obligation_id = $1 AND provider_status = 'PENDING'", [o.id]);
  for (const c of captures) {
    const fresh = await paymentProvider().getCapture(c.provider_capture_id).catch(() => null);
    if (fresh) await recordCapture(o.tenant_id, o.id, { ...fresh, orderId: c.provider_order_id }, "reconcile");
  }
  return (await getObligation(pool(), actor.tenantId, obligationId)).status;
}

export async function reconcileRefund(tenantId: string, refundOpId: string): Promise<RefundRow> {
  const op = (await one<RefundRow>(pool(), "SELECT * FROM refund_operations WHERE tenant_id = $1 AND id = $2", [tenantId, refundOpId]))!;
  if (op.status === "RESERVED" || op.status === "UNKNOWN") return submitRefund(op); // same PayPal-Request-Id
  if (op.status === "PENDING" && op.provider_refund_id) {
    const fresh = await paymentProvider().getRefund(op.provider_refund_id).catch(() => null);
    if (fresh) return applyRefund(tenantId, op.id, fresh);
  }
  return op;
}

/** Worker sweep over anything not settled. Bounded per run. */
export async function reconcileAll(olderThanSeconds = 30): Promise<{ obligations: number; refunds: number }> {
  const obligations = await many<{ id: string; tenant_id: string }>(
    pool(),
    `SELECT DISTINCT o.id, o.tenant_id FROM payment_obligations o
     LEFT JOIN payment_operations p ON p.obligation_id = o.id
     WHERE (o.status IN ('UNKNOWN', 'PENDING') OR (o.status = 'PROCESSING' AND p.status IN ('UNKNOWN', 'RESERVED', 'SUCCEEDED')))
       AND o.updated_at < now() - make_interval(secs => $1)
     LIMIT 50`,
    [olderThanSeconds],
  );
  for (const o of obligations) await reconcileObligation({ kind: "system", tenantId: o.tenant_id, reason: "worker" }, o.id).catch(() => undefined);
  const refunds = await many<{ id: string; tenant_id: string }>(
    pool(),
    "SELECT id, tenant_id FROM refund_operations WHERE status IN ('RESERVED', 'UNKNOWN', 'PENDING') AND updated_at < now() - make_interval(secs => $1) LIMIT 50",
    [olderThanSeconds],
  );
  for (const r of refunds) await reconcileRefund(r.tenant_id, r.id).catch(() => undefined);
  return { obligations: obligations.length, refunds: refunds.length };
}

// ---------------------------------------------------------------- webhooks

type WebhookEvent = { id?: string; event_type?: string; resource_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };

/**
 * Verifies a PayPal webhook with PayPal before trusting it, stores it once by
 * event ID, then re-reads the referenced resource. Event bodies never set state directly.
 */
export async function handleWebhook(headers: WebhookHeaders, rawBody: string): Promise<{ status: number; result: string }> {
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return { status: 400, result: "invalid json" };
  }
  if (!event.id || !event.event_type) return { status: 400, result: "missing event id" };
  let verified = false;
  try {
    verified = await paymentProvider().verifyWebhook(headers, event);
  } catch {
    return { status: 503, result: "verification unavailable" }; // PayPal retries delivery
  }
  if (!verified) return { status: 400, result: "signature not verified" };
  const inserted = await one<{ id: string }>(
    pool(),
    `INSERT INTO payment_events (id, provider_event_id, event_type, resource_type, resource_id, status) VALUES ($1, $2, $3, $4, $5, 'RECEIVED')
     ON CONFLICT (provider_event_id) DO NOTHING RETURNING id`,
    [newId(), event.id, event.event_type, event.resource_type ?? null, event.resource?.id ?? null],
  );
  if (!inserted) {
    const prior = await one<{ status: string }>(pool(), "SELECT status FROM payment_events WHERE provider_event_id = $1", [event.id]);
    if (prior?.status !== "FAILED" && prior?.status !== "RECEIVED") return { status: 200, result: "duplicate" };
  }
  await processWebhookEvent(event.id);
  return { status: 200, result: "accepted" };
}

export async function processWebhookEvent(providerEventId: string): Promise<string> {
  const ev = await one<{ id: string; event_type: string; resource_id: string | null }>(pool(), "SELECT id, event_type, resource_id FROM payment_events WHERE provider_event_id = $1", [providerEventId]);
  if (!ev || !ev.resource_id) return "ignored";
  const finish = async (status: "PROCESSED" | "UNMATCHED" | "FAILED", tenantId: string | null, error?: string) => {
    await pool().query(
      "UPDATE payment_events SET status = $2, tenant_id = COALESCE($3, tenant_id), attempts = attempts + 1, last_error = $4, processed_at = now() WHERE id = $1",
      [ev.id, status, tenantId, error ?? null],
    );
    return status;
  };
  try {
    const provider = paymentProvider();
    if (ev.event_type === "CHECKOUT.ORDER.APPROVED") {
      const op = await one<PaymentOperationRow>(pool(), "SELECT * FROM payment_operations WHERE provider_order_id = $1 AND kind = 'CREATE_ORDER' AND status = 'SUCCEEDED'", [ev.resource_id]);
      if (!op) return finish("UNMATCHED", null);
      await captureCheckout({ kind: "system", tenantId: op.tenant_id, reason: "webhook" }, op.id);
      return finish("PROCESSED", op.tenant_id);
    }
    if (ev.event_type === "PAYMENT.CAPTURE.REFUNDED" || ev.event_type === "PAYMENT.REFUND.PENDING" || ev.event_type === "PAYMENT.REFUND.FAILED") {
      // For refund events the resource is the refund.
      const refund = await provider.getRefund(ev.resource_id);
      const op = await one<RefundRow>(pool(), "SELECT * FROM refund_operations WHERE provider_refund_id = $1", [refund.id]);
      if (!op) return finish("UNMATCHED", null, "refund not initiated by Pact");
      await applyRefund(op.tenant_id, op.id, refund);
      return finish("PROCESSED", op.tenant_id);
    }
    if (ev.event_type.startsWith("PAYMENT.CAPTURE.")) {
      const capture = await provider.getCapture(ev.resource_id);
      const known = await one<CaptureRow>(pool(), "SELECT * FROM captures WHERE provider_capture_id = $1", [capture.id]);
      const op = known
        ? null
        : capture.orderId
          ? await one<PaymentOperationRow>(pool(), "SELECT * FROM payment_operations WHERE provider_order_id = $1 AND kind = 'CREATE_ORDER'", [capture.orderId])
          : null;
      const tenantId = known?.tenant_id ?? op?.tenant_id;
      const obligationId = known?.obligation_id ?? op?.obligation_id;
      if (!tenantId || !obligationId) return finish("UNMATCHED", null);
      await recordCapture(tenantId, obligationId, { ...capture, orderId: capture.orderId ?? known?.provider_order_id ?? null }, "webhook");
      return finish("PROCESSED", tenantId);
    }
    return finish("PROCESSED", null);
  } catch (err) {
    return finish("FAILED", null, errorText(err));
  }
}
