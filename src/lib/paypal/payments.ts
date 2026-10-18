import { formatAmount, type Money } from "../money";
import type { PayPalClient } from "./client";

// Deposit + balance on one buyer approval: authorize the full order, capture the
// deposit with final_capture=false, then capture the (possibly discounted) balance
// with final_capture=true once QC passes. Requires partial capture to be enabled on
// the merchant account (error AUTH_CAPTURE_NOT_ENABLED otherwise). Authorizations
// last 29 days; the honor period is 3 days.

type Link = { href: string; rel: string; method?: string };

export type Order = {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    payments?: {
      authorizations?: Authorization[];
      captures?: Capture[];
    };
  }[];
};

export type Authorization = { id: string; status: string; amount?: { currency_code: string; value: string }; expiration_time?: string };
export type Capture = { id: string; status: string; amount?: { currency_code: string; value: string }; final_capture?: boolean };
export type Refund = { id: string; status: string; amount?: { currency_code: string; value: string } };

const amount = (m: Money) => ({ currency_code: m.currency, value: formatAmount(m) });

export async function createAuthorizeOrder(
  client: PayPalClient,
  args: {
    dealId: string;
    total: Money;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    requestId: string;
  },
): Promise<{ order: Order; approveUrl: string }> {
  const order = await client.request<Order>("POST", "/v2/checkout/orders", {
    requestId: args.requestId,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: args.dealId,
          custom_id: args.dealId,
          description: args.description.slice(0, 127),
          amount: amount(args.total),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: args.returnUrl,
            cancel_url: args.cancelUrl,
            user_action: "CONTINUE",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    },
  });
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new Error(`Order ${order.id} has no approval link`);
  return { order, approveUrl };
}

export async function authorizeOrder(client: PayPalClient, orderId: string, requestId: string): Promise<Authorization> {
  const order = await client.request<Order>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    requestId,
    body: {},
  });
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`Order ${orderId} returned no authorization`);
  return auth;
}

export function captureAuthorization(
  client: PayPalClient,
  args: { authorizationId: string; amount: Money; finalCapture: boolean; invoiceId: string; requestId: string },
): Promise<Capture> {
  return client.request<Capture>("POST", `/v2/payments/authorizations/${encodeURIComponent(args.authorizationId)}/capture`, {
    requestId: args.requestId,
    body: { amount: amount(args.amount), final_capture: args.finalCapture, invoice_id: args.invoiceId },
  });
}

export function voidAuthorization(client: PayPalClient, authorizationId: string, requestId: string): Promise<unknown> {
  return client.request("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    requestId,
    body: {},
  });
}

export function getAuthorization(client: PayPalClient, authorizationId: string): Promise<Authorization> {
  return client.request<Authorization>("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
}

export function refundCapture(
  client: PayPalClient,
  args: { captureId: string; amount: Money; noteToPayer: string; requestId: string },
): Promise<Refund> {
  return client.request<Refund>("POST", `/v2/payments/captures/${encodeURIComponent(args.captureId)}/refund`, {
    requestId: args.requestId,
    body: { amount: amount(args.amount), note_to_payer: args.noteToPayer.slice(0, 255) },
  });
}
