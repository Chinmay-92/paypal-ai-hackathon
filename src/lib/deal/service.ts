import { createHash, randomUUID } from "node:crypto";
import { decideRelease, type BuyerMandate, type SupplierMandate } from "../mandate";
import { parseAmount, splitDeposit, type Money } from "../money";
import { PayPalClient, configFromEnv } from "../paypal/client";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder } from "../paypal/payments";
import { buildChallenge } from "../qc/challenge";
import { checkColor, hexToRgb, rgbToLab, type RGB } from "../qc/color";
import type { ChatMessage, ExtractedSpec } from "../spec/schema";
import { saveDeal, withDeal } from "./store";
import type { AuditEvent, Deal, FieldResult } from "./types";

// Orchestration only: every money movement here is gated by deterministic checks
// (spec locked by both parties, mandate decision, offer check). Model calls are
// injected so the workflow can be tested without network access.

export type Deps = {
  paypal: () => PayPalClient;
  extractSpec: (messages: ChatMessage[]) => Promise<{ spec: ExtractedSpec; problems: string[] }>;
  inspectPhotos: typeof import("../ai/visionQc").inspectPhotos;
  proposeRemedy: typeof import("../ai/remedy").proposeRemedy;
  now: () => Date;
};

let cachedPayPal: PayPalClient | null = null;
export async function defaultDeps(): Promise<Deps> {
  const [{ extractSpec }, { inspectPhotos }, { proposeRemedy }] = await Promise.all([
    import("../ai/extractSpec"),
    import("../ai/visionQc"),
    import("../ai/remedy"),
  ]);
  return {
    paypal: () => (cachedPayPal ??= new PayPalClient(configFromEnv())),
    extractSpec,
    inspectPhotos,
    proposeRemedy,
    now: () => new Date(),
  };
}

export class DealStateError extends Error {}

function log(deal: Deal, actor: AuditEvent["actor"], message: string, now: Date) {
  deal.audit.push({ at: now.toISOString(), actor, message });
}

function requireStatus(deal: Deal, ...allowed: Deal["status"][]) {
  if (!allowed.includes(deal.status)) {
    throw new DealStateError(`Deal is ${deal.status}; expected ${allowed.join(" or ")}`);
  }
}

export function specHash(spec: ExtractedSpec): string {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex");
}

export async function createDeal(args: {
  messages: ChatMessage[];
  buyerMandate: BuyerMandate;
  supplierMandate: SupplierMandate;
  depositBps?: number;
  unitsPerCarton?: number;
  referenceNeutralHex?: string;
  now?: Date;
}): Promise<Deal> {
  const now = args.now ?? new Date();
  const deal: Deal = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    status: "negotiating",
    messages: args.messages,
    spec: null,
    specProblems: [],
    specHash: null,
    approvals: { buyer: false, supplier: false },
    depositBps: args.depositBps ?? 3000,
    unitsPerCarton: args.unitsPerCarton ?? 50,
    referenceNeutralHex: args.referenceNeutralHex ?? "#f2f2f2",
    buyerMandate: args.buyerMandate,
    supplierMandate: args.supplierMandate,
    total: null,
    deposit: null,
    balance: null,
    paypal: { orderId: null, approveUrl: null, authorizationId: null, depositCaptureId: null, balanceCaptureId: null },
    challenge: null,
    qc: null,
    remedy: null,
    audit: [],
  };
  log(deal, "system", "Deal created from negotiation transcript", now);
  await saveDeal(deal);
  return deal;
}

export function proposeSpec(id: string, deps: Deps) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "negotiating", "spec_proposed");
    const { spec, problems } = await deps.extractSpec(deal.messages);
    deal.spec = spec;
    deal.specProblems = problems;
    deal.approvals = { buyer: false, supplier: false };
    deal.status = "spec_proposed";
    log(deal, "buyer_agent", `Proposed spec with ${spec.fields.length} fields${problems.length ? `; ${problems.length} citation problems` : ""}`, deps.now());
    return deal;
  });
}

export function approveSpec(id: string, party: "buyer" | "supplier", expectedHash: string, now = new Date()) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "spec_proposed");
    if (!deal.spec) throw new DealStateError("No spec to approve");
    if (deal.specProblems.length > 0) throw new DealStateError("Spec has citation problems; re-run extraction");
    if (specHash(deal.spec) !== expectedHash) throw new DealStateError("Spec changed since you reviewed it");
    deal.approvals[party] = true;
    log(deal, party, "Approved spec", now);
    if (deal.approvals.buyer && deal.approvals.supplier) {
      const unit = parseAmount(deal.spec.unitPrice, deal.spec.currency);
      const total: Money = { currency: unit.currency, minor: unit.minor * deal.spec.quantity };
      const { deposit, balance } = splitDeposit(total, deal.depositBps);
      Object.assign(deal, { total, deposit, balance, specHash: expectedHash, status: "spec_locked" });
      log(deal, "system", `Spec locked (sha256 ${expectedHash.slice(0, 12)})`, now);
    }
    return deal;
  });
}

export function startPayment(id: string, origin: string, deps: Deps) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "spec_locked", "awaiting_buyer_payment");
    if (deal.paypal.approveUrl) return deal; // idempotent: reuse the existing order
    const { order, approveUrl } = await createAuthorizeOrder(deps.paypal(), {
      dealId: deal.id,
      total: deal.total!,
      description: `${deal.spec!.quantity} x ${deal.spec!.product}`,
      returnUrl: `${origin}/api/deals/${deal.id}/paypal/return`,
      cancelUrl: `${origin}/deals/${deal.id}?payment=cancelled`,
      requestId: `${deal.id}:create-order`,
    });
    deal.paypal.orderId = order.id;
    deal.paypal.approveUrl = approveUrl;
    deal.status = "awaiting_buyer_payment";
    log(deal, "system", `PayPal order ${order.id} created for the full amount (authorize only)`, deps.now());
    return deal;
  });
}

/** Called when the buyer returns from PayPal: authorize the full order, capture the deposit. */
export function completeBuyerApproval(id: string, orderId: string, deps: Deps) {
  return withDeal(id, async (deal) => {
    if (deal.status === "deposit_captured") return deal;
    requireStatus(deal, "awaiting_buyer_payment");
    if (deal.paypal.orderId !== orderId) throw new DealStateError("Order does not belong to this deal");
    const client = deps.paypal();
    if (!deal.paypal.authorizationId) {
      const auth = await authorizeOrder(client, orderId, `${deal.id}:authorize`);
      deal.paypal.authorizationId = auth.id;
      log(deal, "system", `Authorized ${deal.total!.currency} total (authorization ${auth.id})`, deps.now());
    }
    const capture = await captureAuthorization(client, {
      authorizationId: deal.paypal.authorizationId,
      amount: deal.deposit!,
      finalCapture: false,
      invoiceId: `${deal.id}-deposit`,
      requestId: `${deal.id}:capture-deposit`,
    });
    deal.paypal.depositCaptureId = capture.id;
    deal.status = "deposit_captured";
    log(deal, "system", `Captured deposit (capture ${capture.id}, status ${capture.status})`, deps.now());
    return deal;
  });
}

export function issueChallenge(id: string, deps: Deps) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "deposit_captured", "challenge_issued");
    deal.challenge = buildChallenge(deal.spec!.fields, deal.spec!.quantity, deal.unitsPerCarton, deps.now());
    deal.status = "challenge_issued";
    log(deal, "buyer_agent", `Issued photo challenge with code ${deal.challenge.code} (${deal.challenge.shots.length} shots)`, deps.now());
    return deal;
  });
}

export type ColorSample = { fieldId: string; shotId: string; sample: RGB; neutral: RGB };

export function submitInspection(
  id: string,
  photos: Parameters<Deps["inspectPhotos"]>[2],
  colorSamples: ColorSample[],
  deps: Deps,
) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "challenge_issued");
    const now = deps.now();
    const challenge = deal.challenge!;
    if (now > new Date(challenge.expiresAt)) throw new DealStateError("Photo challenge expired; issue a new one");
    const spec = deal.spec!;

    const { verdicts, validShotIds } = await deps.inspectPhotos(spec.fields, challenge, photos);
    const results: FieldResult[] = [...verdicts];
    const shotsWithCode = new Set(validShotIds);

    for (const field of spec.fields) {
      if (field.method === "color_delta_e") {
        const sample = colorSamples.find((s) => s.fieldId === field.id && shotsWithCode.has(s.shotId));
        if (!sample || !field.colorTargetHex || field.toleranceDeltaE == null) {
          results.push({ fieldId: field.id, critical: field.critical, verdict: "cant_verify", evidence: "No colour sample from a verified shot with the reference card" });
          continue;
        }
        const color = checkColor(sample.sample, sample.neutral, hexToRgb(deal.referenceNeutralHex), rgbToLab(hexToRgb(field.colorTargetHex)), field.toleranceDeltaE);
        results.push({
          fieldId: field.id,
          critical: field.critical,
          verdict: color.verdict,
          evidence: `ΔE2000 ${color.deltaE.toFixed(2)} vs tolerance ${color.tolerance} (shot ${sample.shotId})`,
          color,
        });
      } else if (field.method === "count_per_layer" || field.method === "human") {
        results.push({ fieldId: field.id, critical: field.critical, verdict: "cant_verify", evidence: "Requires a human check" });
      }
    }

    const decision = decideRelease(results, deal.balance!, deal.buyerMandate);
    deal.qc = { at: now.toISOString(), fields: results, decision };
    deal.status = "awaiting_decision";
    log(deal, "buyer_agent", `QC complete: ${summarize(results)} → ${decision.action}`, now);

    if (decision.action === "release") await captureBalance(deal, decision.amount, deps, "Auto-released under buyer mandate");
    else if (decision.action === "remedy") await negotiate(deal, deps);
    return deal;
  });
}

function summarize(results: FieldResult[]): string {
  const count = (v: string) => results.filter((r) => r.verdict === v).length;
  return `${count("pass")} pass, ${count("fail")} fail, ${count("cant_verify")} need a human`;
}

async function negotiate(deal: Deal, deps: Deps, rejectedReason?: string) {
  const decision = deal.qc!.decision;
  if (decision.action !== "remedy") return;
  const failures = deal.qc!.fields
    .filter((f) => decision.failedFieldIds.includes(f.fieldId))
    .map((f) => ({ fieldId: f.fieldId, evidence: f.evidence }));
  const { offer, check } = await deps.proposeRemedy({
    failures,
    criticalFailure: decision.criticalFailure,
    balance: deal.balance!,
    supplier: deal.supplierMandate,
    buyer: deal.buyerMandate,
    rejectedReason,
  });
  if (!check.ok) {
    log(deal, "system", `Rejected supplier agent offer: ${check.reason}`, deps.now());
    deal.remedy = null;
    return;
  }
  deal.remedy = {
    offer,
    check,
    supplierApproved: !check.needsSupplierApproval,
    buyerAccepted: check.buyerAutoAccepts,
  };
  log(deal, "supplier_agent", `Offered ${offer.kind === "discount" ? `${offer.discountBps / 100}% off the balance` : `a remake in ${offer.days} days`}: ${offer.note}`, deps.now());
  await settleRemedyIfAgreed(deal, deps);
}

async function settleRemedyIfAgreed(deal: Deal, deps: Deps) {
  const remedy = deal.remedy;
  if (!remedy || !remedy.check.ok || !remedy.buyerAccepted || !remedy.supplierApproved) return;
  if (remedy.offer.kind === "discount" && remedy.check.balanceToCapture) {
    await captureBalance(deal, remedy.check.balanceToCapture, deps, "Captured discounted balance after agreed remedy");
  } else {
    log(deal, "system", "Remake agreed; a new photo challenge will be issued when the supplier is ready", deps.now());
    deal.status = "deposit_captured";
    deal.challenge = null;
    deal.qc = null;
  }
}

async function captureBalance(deal: Deal, amount: Money, deps: Deps, reason: string) {
  if (deal.paypal.balanceCaptureId) return;
  const capture = await captureAuthorization(deps.paypal(), {
    authorizationId: deal.paypal.authorizationId!,
    amount,
    finalCapture: true,
    invoiceId: `${deal.id}-balance`,
    requestId: `${deal.id}:capture-balance`,
  });
  deal.paypal.balanceCaptureId = capture.id;
  deal.status = "balance_captured";
  log(deal, "system", `${reason} (capture ${capture.id}, status ${capture.status})`, deps.now());
}

/** Human decisions: buyer approves a release, either party accepts or approves the open remedy. */
export function resolve(
  id: string,
  action: "buyer_release" | "buyer_accept_remedy" | "supplier_approve_remedy" | "request_new_offer",
  deps: Deps,
) {
  return withDeal(id, async (deal) => {
    requireStatus(deal, "awaiting_decision");
    const decision = deal.qc!.decision;
    switch (action) {
      case "buyer_release":
        if (decision.action === "remedy") throw new DealStateError("Failed fields must be resolved through a remedy");
        log(deal, "buyer", "Approved release of the balance", deps.now());
        await captureBalance(deal, deal.balance!, deps, "Captured balance on buyer approval");
        break;
      case "buyer_accept_remedy":
        if (!deal.remedy) throw new DealStateError("No open remedy");
        deal.remedy.buyerAccepted = true;
        log(deal, "buyer", "Accepted remedy", deps.now());
        await settleRemedyIfAgreed(deal, deps);
        break;
      case "supplier_approve_remedy":
        if (!deal.remedy) throw new DealStateError("No open remedy");
        deal.remedy.supplierApproved = true;
        log(deal, "supplier", "Approved remedy beyond agent limits", deps.now());
        await settleRemedyIfAgreed(deal, deps);
        break;
      case "request_new_offer":
        log(deal, "buyer", "Rejected the offer and asked for a new one", deps.now());
        await negotiate(deal, deps, "The buyer rejected it and asked for a better remedy");
        break;
    }
    return deal;
  });
}
