import { randomUUID } from "node:crypto";
import type { Money } from "../src/domain/money";
import {
  ProviderRejectedError,
  ProviderUncertainError,
  type CreateOrderRequest,
  type PaymentProvider,
  type ProviderCapture,
  type ProviderOrder,
  type ProviderRefund,
  type RefundRequest,
  type WebhookHeaders,
} from "../src/integrations/paypal/provider";

// TEST DOUBLE ONLY. An in-memory stand-in for PayPal used to inject precise
// failures (lost responses, declines, pending captures). It proves nothing
// about the real PayPal API; sandbox behavior is checked by smoke:paypal.

type Fault = "lost-response" | "timeout-before" | "reject" | "crash";
type Method = "createOrder" | "captureOrder" | "refundCapture" | "getOrder" | "getCapture" | "getRefund";

export class FakePayPal implements PaymentProvider {
  readonly name = "fake-test-double";
  orders = new Map<string, ProviderOrder & { requestId: string }>();
  captures = new Map<string, ProviderCapture>();
  refunds = new Map<string, ProviderRefund>();
  private idempotent = new Map<string, unknown>();
  private faults: { method: Method; fault: Fault; issue?: string }[] = [];
  calls: Record<Method, number> = { createOrder: 0, captureOrder: 0, refundCapture: 0, getOrder: 0, getCapture: 0, getRefund: 0 };
  captureStatus: "COMPLETED" | "PENDING" | "DECLINED" = "COMPLETED";
  refundStatus: "COMPLETED" | "PENDING" = "COMPLETED";
  merchantId = "FAKEMERCHANT";

  failNext(method: Method, fault: Fault, issue?: string) {
    this.faults.push({ method, fault, issue });
  }

  private fault(method: Method): Fault | null {
    const i = this.faults.findIndex((f) => f.method === method);
    if (i < 0) return null;
    const [f] = this.faults.splice(i, 1);
    if (f.fault === "reject") throw new ProviderRejectedError(422, "UNPROCESSABLE_ENTITY", f.issue ?? "TEST_REJECT", "fake-debug", `fake reject ${f.issue}`);
    if (f.fault === "timeout-before") throw new ProviderUncertainError("fake timeout before reaching provider");
    if (f.fault === "crash") throw new Error("simulated process crash");
    return f.fault;
  }

  private async idem<T>(key: string, method: Method, run: () => T): Promise<T> {
    this.calls[method]++;
    const fault = this.fault(method);
    const prior = this.idempotent.get(key) as T | undefined;
    const result = prior ?? run();
    this.idempotent.set(key, result);
    if (fault === "lost-response") throw new ProviderUncertainError("fake response lost after provider succeeded");
    return structuredClone(result);
  }

  /** Simulates the buyer approving the order at PayPal. */
  approve(orderId: string) {
    const o = this.orders.get(orderId)!;
    o.status = "APPROVED";
  }

  createOrder(req: CreateOrderRequest): Promise<ProviderOrder> {
    return this.idem(`create:${req.requestId}`, "createOrder", () => {
      const id = `ORDER-${randomUUID().slice(0, 8)}`;
      const order = {
        id,
        status: "PAYER_ACTION_REQUIRED",
        approveUrl: `https://sandbox.example.test/checkoutnow?token=${id}`,
        amount: req.amount,
        customId: req.customId,
        invoiceId: req.invoiceId,
        payeeMerchantId: this.merchantId,
        captures: [],
        requestId: req.requestId,
      };
      this.orders.set(id, order);
      return order;
    });
  }

  async getOrder(orderId: string): Promise<ProviderOrder> {
    this.calls.getOrder++;
    this.fault("getOrder");
    const o = this.orders.get(orderId);
    if (!o) throw new ProviderRejectedError(404, "RESOURCE_NOT_FOUND", null, null, "not found");
    return structuredClone(o);
  }

  captureOrder(orderId: string, requestId: string): Promise<ProviderOrder> {
    return this.idem(`capture:${requestId}`, "captureOrder", () => {
      const o = this.orders.get(orderId)!;
      if (o.status === "COMPLETED") throw new ProviderRejectedError(422, "UNPROCESSABLE_ENTITY", "ORDER_ALREADY_CAPTURED", null, "already captured");
      if (o.status !== "APPROVED") throw new ProviderRejectedError(422, "UNPROCESSABLE_ENTITY", "ORDER_NOT_APPROVED", null, "not approved");
      const capture: ProviderCapture = {
        id: `CAP-${randomUUID().slice(0, 8)}`,
        status: this.captureStatus,
        amount: o.amount as Money,
        orderId,
        customId: o.customId,
        invoiceId: o.invoiceId,
        payeeMerchantId: this.merchantId,
      };
      this.captures.set(capture.id, capture);
      o.status = "COMPLETED";
      o.captures = [capture];
      return structuredClone(o);
    });
  }

  async getCapture(captureId: string): Promise<ProviderCapture> {
    this.calls.getCapture++;
    this.fault("getCapture");
    return structuredClone(this.captures.get(captureId)!);
  }

  /** Simulates PayPal settling a pending capture. */
  settle(captureId: string, status = "COMPLETED") {
    this.captures.get(captureId)!.status = status;
  }

  refundCapture(req: RefundRequest): Promise<ProviderRefund> {
    return this.idem(`refund:${req.requestId}`, "refundCapture", () => {
      const refund: ProviderRefund = { id: `REF-${randomUUID().slice(0, 8)}`, status: this.refundStatus, amount: req.amount, captureId: req.captureId };
      this.refunds.set(refund.id, refund);
      if (refund.status === "COMPLETED") {
        const cap = this.captures.get(req.captureId)!;
        const refunded = [...this.refunds.values()].filter((r) => r.captureId === req.captureId && r.status === "COMPLETED").reduce((n, r) => n + r.amount.minor, 0);
        cap.status = refunded >= cap.amount.minor ? "REFUNDED" : "PARTIALLY_REFUNDED";
      }
      return refund;
    });
  }

  async getRefund(refundId: string): Promise<ProviderRefund> {
    this.calls.getRefund++;
    this.fault("getRefund");
    return structuredClone(this.refunds.get(refundId)!);
  }

  async verifyWebhook(headers: WebhookHeaders): Promise<boolean> {
    return headers.transmissionSig === "valid-test-signature";
  }

  totalCaptured(): number {
    return [...this.captures.values()].reduce((s, c) => s + c.amount.minor, 0);
  }
}
