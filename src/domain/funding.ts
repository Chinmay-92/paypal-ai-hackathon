import { assertMinor } from "./money";

/**
 * Local funding states, mapped explicitly from provider data. CANCELLED is a
 * local-only state for an unpaid obligation whose revision was replaced.
 */
export type FundingStatus =
  | "NOT_REQUIRED"
  | "DUE"
  | "PROCESSING"
  | "UNKNOWN"
  | "PENDING"
  | "COMPLETED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED"
  | "REVIEW_REQUIRED"
  | "CANCELLED";

export type ObligationPurpose = "DEPOSIT" | "ADDITIONAL_DEPOSIT" | "BALANCE";

/** Obligation states in which another checkout must not be opened. */
export const UNSETTLED: readonly FundingStatus[] = ["PROCESSING", "UNKNOWN", "PENDING", "REVIEW_REQUIRED"];

export type LedgerCapture = {
  amountMinor: number;
  /** Last authoritative capture status from the provider. */
  providerStatus: string;
  /** Whether the merchant ledger credits this capture to the job. False while it awaits review. */
  credited: boolean;
  completedRefundsMinor: number;
};

const SETTLED_CAPTURE = new Set(["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"]);

/**
 * Funding available to the job: completed, credited captures net of completed
 * refunds. Pending or unknown captures are never available funding.
 */
export function creditedFunding(captures: readonly LedgerCapture[]): number {
  return captures.reduce((sum, c) => {
    if (!c.credited || !SETTLED_CAPTURE.has(c.providerStatus)) return sum;
    return sum + Math.max(0, assertMinor(c.amountMinor) - assertMinor(c.completedRefundsMinor));
  }, 0);
}

export function amountDue(targetMinor: number, creditedMinor: number): number {
  return Math.max(0, assertMinor(targetMinor) - assertMinor(creditedMinor));
}

export function remainingBalance(totalMinor: number, creditedMinor: number): number {
  return Math.max(0, assertMinor(totalMinor) - assertMinor(creditedMinor));
}

/** Refundable capacity reserves pending refunds so concurrent refunds cannot exceed the capture. */
export function refundableCapacity(captureMinor: number, completedRefundsMinor: number, reservedRefundsMinor: number): number {
  return Math.max(0, captureMinor - completedRefundsMinor - reservedRefundsMinor);
}

export function obligationStatusAfterRefunds(captureMinor: number, completedRefundsMinor: number): FundingStatus {
  if (completedRefundsMinor <= 0) return "COMPLETED";
  return completedRefundsMinor >= captureMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";
}
