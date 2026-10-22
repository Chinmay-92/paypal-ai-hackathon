import type { Money } from "@/domain/money";

// The provider boundary. The application talks to PayPal only through this
// interface; tests use an explicit in-memory fake for failure injection.

export type ProviderCapture = {
  id: string;
  status: string; // PayPal capture status, e.g. COMPLETED, PENDING, DECLINED, REFUNDED, PARTIALLY_REFUNDED, FAILED
  amount: Money;
  orderId: string | null;
  customId: string | null;
  invoiceId: string | null;
  payeeMerchantId: string | null;
};

export type ProviderOrder = {
  id: string;
  status: string; // CREATED, SAVED, APPROVED, VOIDED, COMPLETED, PAYER_ACTION_REQUIRED
  approveUrl: string | null;
  amount: Money | null;
  customId: string | null;
  invoiceId: string | null;
  payeeMerchantId: string | null;
  captures: ProviderCapture[];
  debugId?: string | null;
};

export type ProviderRefund = {
  id: string;
  status: string; // COMPLETED, PENDING, FAILED, CANCELLED
  amount: Money;
  captureId: string | null;
};

export type CreateOrderRequest = {
  requestId: string;
  amount: Money;
  customId: string;
  invoiceId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  shipping: "GET_FROM_FILE" | "NO_SHIPPING";
  brandName: string;
};

export type RefundRequest = {
  requestId: string;
  captureId: string;
  amount: Money;
  invoiceId: string;
  noteToPayer: string;
};

export type WebhookHeaders = {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  createOrder(req: CreateOrderRequest): Promise<ProviderOrder>;
  getOrder(orderId: string): Promise<ProviderOrder>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderOrder>;
  getCapture(captureId: string): Promise<ProviderCapture>;
  refundCapture(req: RefundRequest): Promise<ProviderRefund>;
  getRefund(refundId: string): Promise<ProviderRefund>;
  verifyWebhook(headers: WebhookHeaders, event: unknown): Promise<boolean>;
}

/** The provider definitively rejected the request (4xx other than timeouts/conflicts). Nothing happened. */
export class ProviderRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string,
    readonly issue: string | null,
    readonly debugId: string | null,
    message: string,
  ) {
    super(message);
  }
}

/** The outcome is unknown: timeout, network failure, 5xx or unreadable response. Never treat as failure. */
export class ProviderUncertainError extends Error {
  constructor(
    message: string,
    readonly debugId: string | null = null,
  ) {
    super(message);
  }
}

export class PaymentsNotConfiguredError extends Error {}
