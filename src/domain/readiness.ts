import type { FundingStatus } from "./funding";

export type FulfillmentState = "HOLD" | "READY" | "IN_PROGRESS" | "COMPLETED" | "EXCEPTION";

export type Blocker = { code: string; message: string };

export type ReadinessInput = {
  fulfillmentState: FulfillmentState;
  hasApprovedEffectiveRevision: boolean;
  hasPendingRevision: boolean;
  openMaterialChangeRequests: number;
  depositTargetMinor: number;
  creditedMinor: number;
  obligationStatuses: readonly FundingStatus[];
  holdReason: string | null;
};

/** Everything that prevents work from being released. Release requires an empty list. */
export function blockers(input: ReadinessInput): Blocker[] {
  const out: Blocker[] = [];
  if (!input.hasApprovedEffectiveRevision) {
    out.push({ code: "NO_APPROVED_REVISION", message: "The customer has not approved an agreement yet." });
  }
  if (input.hasPendingRevision) {
    out.push({ code: "PENDING_REVISION", message: "An amendment is waiting for the customer's decision." });
  }
  if (input.openMaterialChangeRequests > 0) {
    out.push({ code: "UNRESOLVED_AMENDMENT", message: "A change request needs merchant review." });
  }
  if (input.obligationStatuses.includes("UNKNOWN")) {
    out.push({ code: "PAYMENT_UNKNOWN", message: "We are checking the payment result. Do not pay again yet." });
  }
  if (input.obligationStatuses.includes("PENDING")) {
    out.push({ code: "PAYMENT_PENDING", message: "Payment is pending. Work has not been released." });
  }
  if (input.obligationStatuses.includes("REVIEW_REQUIRED")) {
    out.push({ code: "PAYMENT_REVIEW", message: "A payment arrived for a replaced revision and needs merchant review." });
  }
  if (input.hasApprovedEffectiveRevision && input.creditedMinor < input.depositTargetMinor) {
    out.push({ code: "DEPOSIT_DUE", message: "The deposit for the current revision has not been received." });
  }
  if (input.holdReason) out.push({ code: "MANUAL_HOLD", message: `On hold: ${input.holdReason}` });
  if (input.fulfillmentState === "EXCEPTION") {
    out.push({ code: "EXCEPTION", message: "Work has started. The shop must confirm whether this change is possible." });
  }
  return out;
}
