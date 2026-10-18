import type { BuyerMandate, FieldVerdict, RemedyOffer, OfferCheck, ReleaseDecision, SupplierMandate } from "../mandate";
import type { Money } from "../money";
import type { PhotoChallenge } from "../qc/challenge";
import type { ColorCheck } from "../qc/color";
import type { ChatMessage, ExtractedSpec } from "../spec/schema";

export type DealStatus =
  | "negotiating"
  | "spec_proposed"
  | "spec_locked"
  | "awaiting_buyer_payment"
  | "deposit_captured"
  | "challenge_issued"
  | "awaiting_decision"
  | "balance_captured"
  | "cancelled";

export type AuditEvent = { at: string; actor: "buyer" | "supplier" | "buyer_agent" | "supplier_agent" | "system"; message: string };

export type FieldResult = FieldVerdict & { evidence: string; color?: ColorCheck };

export type Deal = {
  id: string;
  createdAt: string;
  status: DealStatus;
  messages: ChatMessage[];
  spec: ExtractedSpec | null;
  specProblems: string[];
  specHash: string | null;
  approvals: { buyer: boolean; supplier: boolean };
  depositBps: number;
  unitsPerCarton: number;
  referenceNeutralHex: string;
  buyerMandate: BuyerMandate;
  supplierMandate: SupplierMandate;
  total: Money | null;
  deposit: Money | null;
  balance: Money | null;
  paypal: {
    orderId: string | null;
    approveUrl: string | null;
    authorizationId: string | null;
    depositCaptureId: string | null;
    balanceCaptureId: string | null;
  };
  challenge: PhotoChallenge | null;
  qc: { at: string; fields: FieldResult[]; decision: ReleaseDecision } | null;
  remedy: { offer: RemedyOffer; check: OfferCheck; buyerAccepted: boolean; supplierApproved: boolean } | null;
  audit: AuditEvent[];
};
