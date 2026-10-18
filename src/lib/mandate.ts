import { bpsOf, type Money } from "./money";

// Mandates are the limits each human sets before their agent acts. The model may
// propose anything; only this deterministic code decides whether money moves.

export type BuyerMandate = {
  /** Largest balance the agent may release without the buyer tapping approve. */
  maxAutoReleaseMinor: number;
  /** A remedy discount at or above this share of the balance is auto-accepted. */
  autoAcceptDiscountBps: number;
  acceptRemake: boolean;
};

export type SupplierMandate = {
  /** Largest discount the supplier agent may offer without the supplier approving. */
  maxDiscountBps: number;
  allowRemake: boolean;
  maxRemakeDays: number;
};

export type FieldVerdict = {
  fieldId: string;
  critical: boolean;
  verdict: "pass" | "fail" | "cant_verify";
};

export type ReleaseDecision =
  | { action: "release"; amount: Money }
  | { action: "buyer_approval"; amount: Money; reason: string }
  | { action: "human_review"; fieldIds: string[] }
  | { action: "remedy"; failedFieldIds: string[]; criticalFailure: boolean };

export function decideRelease(
  verdicts: FieldVerdict[],
  balance: Money,
  mandate: BuyerMandate,
): ReleaseDecision {
  if (verdicts.length === 0) return { action: "human_review", fieldIds: [] };
  const failed = verdicts.filter((v) => v.verdict === "fail");
  if (failed.length > 0) {
    return {
      action: "remedy",
      failedFieldIds: failed.map((v) => v.fieldId),
      criticalFailure: failed.some((v) => v.critical),
    };
  }
  const unverified = verdicts.filter((v) => v.verdict === "cant_verify");
  if (unverified.length > 0) return { action: "human_review", fieldIds: unverified.map((v) => v.fieldId) };
  if (balance.minor > mandate.maxAutoReleaseMinor) {
    return { action: "buyer_approval", amount: balance, reason: "Balance exceeds the buyer's auto-release limit" };
  }
  return { action: "release", amount: balance };
}

export type RemedyOffer =
  | { kind: "discount"; discountBps: number; note: string }
  | { kind: "remake"; days: number; note: string };

export type OfferCheck =
  | { ok: false; reason: string }
  | {
      ok: true;
      needsSupplierApproval: boolean;
      buyerAutoAccepts: boolean;
      /** What the final capture of the balance should be if this offer is accepted. */
      balanceToCapture: Money | null;
    };

export function checkOffer(
  offer: RemedyOffer,
  balance: Money,
  supplier: SupplierMandate,
  buyer: BuyerMandate,
  criticalFailure: boolean,
): OfferCheck {
  if (offer.kind === "discount") {
    if (!Number.isInteger(offer.discountBps) || offer.discountBps <= 0 || offer.discountBps > 10_000) {
      return { ok: false, reason: "Discount must be between 0.01% and 100% of the balance" };
    }
    if (criticalFailure && offer.discountBps < 10_000) {
      return { ok: false, reason: "A critical field failed; only a remake or full balance waiver can resolve it" };
    }
    const discount = bpsOf(balance, offer.discountBps);
    return {
      ok: true,
      needsSupplierApproval: offer.discountBps > supplier.maxDiscountBps,
      buyerAutoAccepts: offer.discountBps >= buyer.autoAcceptDiscountBps,
      balanceToCapture: { currency: balance.currency, minor: balance.minor - discount.minor },
    };
  }
  if (!Number.isInteger(offer.days) || offer.days <= 0) return { ok: false, reason: "Remake needs a positive number of days" };
  return {
    ok: true,
    needsSupplierApproval: !supplier.allowRemake || offer.days > supplier.maxRemakeDays,
    buyerAutoAccepts: buyer.acceptRemake,
    balanceToCapture: null,
  };
}
