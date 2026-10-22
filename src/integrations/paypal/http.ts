import { parseDecimalString, toDecimalString, type Currency, type Money } from "@/domain/money";
import {
  PaymentsNotConfiguredError,
  ProviderRejectedError,
  ProviderUncertainError,
  type CreateOrderRequest,
  type PaymentProvider,
  type ProviderCapture,
  type ProviderOrder,
  type ProviderRefund,
  type RefundRequest,
  type WebhookHeaders,
} from "./provider";

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export type PayPalConfig = { clientId: string; clientSecret: string; webhookId: string | null; merchantId: string | null };

/** Sandbox only. Any other PayPal base URL is refused so public demo configuration cannot move real money. */
export function paypalConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  if (env.PAYPAL_BASE_URL && env.PAYPAL_BASE_URL !== SANDBOX_BASE_URL) {
    throw new PaymentsNotConfiguredError("Only the PayPal sandbox is allowed. Remove PAYPAL_BASE_URL or set it to the sandbox URL.");
  }
  if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox") {
    throw new PaymentsNotConfiguredError("PAYPAL_ENVIRONMENT must be sandbox");
  }
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new PaymentsNotConfiguredError("PayPal sandbox is not configured (set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)");
  }
  return {
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID || null,
    merchantId: env.PAYPAL_MERCHANT_ID || null,
  };
}

type Amount = { currency_code: string; value: string };
type Link = { href: string; rel: string };
type RawCapture = {
  id: string;
  status: string;
  amount?: Amount;
  custom_id?: string;
  invoice_id?: string;
  payee?: { merchant_id?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
};
type RawOrder = {
  id: string;
  status: string;
  links?: Link[];
  purchase_units?: {
    amount?: Amount;
    custom_id?: string;
    invoice_id?: string;
    payee?: { merchant_id?: string };
    payments?: { captures?: RawCapture[] };
  }[];
};
type RawRefund = { id: string; status: string; amount?: Amount; links?: Link[] };

function money(a: Amount | undefined): Money | null {
  if (!a) return null;
  if (a.currency_code !== "USD") throw new ProviderUncertainError(`Unsupported currency in provider response: ${a.currency_code}`);
  return parseDecimalString(a.value, a.currency_code as Currency);
}

function mapCapture(c: RawCapture, orderId: string | null): ProviderCapture {
  const amount = money(c.amount);
  if (!amount) throw new ProviderUncertainError(`Capture ${c.id} has no amount`);
  return {
    id: c.id,
    status: c.status,
    amount,
    orderId: c.supplementary_data?.related_ids?.order_id ?? orderId,
    customId: c.custom_id ?? null,
    invoiceId: c.invoice_id ?? null,
    payeeMerchantId: c.payee?.merchant_id ?? null,
  };
}

export function mapOrder(o: RawOrder): ProviderOrder {
  const pu = o.purchase_units?.[0];
  return {
    id: o.id,
    status: o.status,
    approveUrl: o.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href ?? null,
    amount: money(pu?.amount),
    customId: pu?.custom_id ?? null,
    invoiceId: pu?.invoice_id ?? null,
    payeeMerchantId: pu?.payee?.merchant_id ?? null,
    captures: (pu?.payments?.captures ?? []).map((c) => mapCapture(c, o.id)),
  };
}

function mapRefund(r: RawRefund): ProviderRefund {
  const amount = money(r.amount);
  if (!amount) throw new ProviderUncertainError(`Refund ${r.id} has no amount`);
  const up = r.links?.find((l) => l.rel === "up")?.href ?? "";
  return { id: r.id, status: r.status, amount, captureId: /\/captures\/([^/?]+)/.exec(up)?.[1] ?? null };
}

export class PayPalHttpProvider implements PaymentProvider {
  readonly name = "paypal-sandbox";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PayPalConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${SANDBOX_BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new ProviderUncertainError(`PayPal request did not complete: ${err instanceof Error ? err.name : "error"}`);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await this.send("/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) {
      if (res.status >= 500) throw new ProviderUncertainError(`PayPal auth unavailable (${res.status})`);
      throw new PaymentsNotConfiguredError(`PayPal sandbox credentials were rejected (${body.error ?? res.status})`);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 0) * 1000 };
    return this.token.value;
  }

  private async request<T>(method: "GET" | "POST", path: string, opts: { body?: unknown; requestId?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
    const res = await this.send(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    const debugId = res.headers.get("paypal-debug-id");
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ProviderUncertainError(`Unreadable PayPal response (${res.status})`, debugId);
    }
    if (res.ok) return json as T;
    if (res.status >= 500 || res.status === 408 || res.status === 409 || res.status === 429) {
      throw new ProviderUncertainError(`PayPal returned ${res.status}`, debugId);
    }
    const details = json.details as { issue?: string }[] | undefined;
    throw new ProviderRejectedError(
      res.status,
      String(json.name ?? "UNKNOWN"),
      details?.[0]?.issue ?? null,
      (json.debug_id as string | undefined) ?? debugId,
      `PayPal ${res.status} ${String(json.name ?? "")}${details?.[0]?.issue ? ` ${details[0].issue}` : ""}`,
    );
  }

  async createOrder(req: CreateOrderRequest): Promise<ProviderOrder> {
    const raw = await this.request<RawOrder>("POST", "/v2/checkout/orders", {
      requestId: req.requestId,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: req.customId,
            custom_id: req.customId,
            invoice_id: req.invoiceId,
            description: req.description.slice(0, 127),
            amount: { currency_code: req.amount.currency, value: toDecimalString(req.amount) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: req.brandName.slice(0, 127),
              return_url: req.returnUrl,
              cancel_url: req.cancelUrl,
              user_action: "PAY_NOW",
              shipping_preference: req.shipping,
            },
          },
        },
      },
    });
    return mapOrder(raw);
  }

  async getOrder(orderId: string): Promise<ProviderOrder> {
    return mapOrder(await this.request<RawOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`));
  }

  async captureOrder(orderId: string, requestId: string): Promise<ProviderOrder> {
    return mapOrder(await this.request<RawOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId, body: {} }));
  }

  async getCapture(captureId: string): Promise<ProviderCapture> {
    return mapCapture(await this.request<RawCapture>("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`), null);
  }

  async refundCapture(req: RefundRequest): Promise<ProviderRefund> {
    const raw = await this.request<RawRefund>("POST", `/v2/payments/captures/${encodeURIComponent(req.captureId)}/refund`, {
      requestId: req.requestId,
      body: {
        amount: { currency_code: req.amount.currency, value: toDecimalString(req.amount) },
        invoice_id: req.invoiceId,
        note_to_payer: req.noteToPayer.slice(0, 255),
      },
    });
    const refund = mapRefund(raw);
    return { ...refund, captureId: refund.captureId ?? req.captureId };
  }

  async getRefund(refundId: string): Promise<ProviderRefund> {
    return mapRefund(await this.request<RawRefund>("GET", `/v2/payments/refunds/${encodeURIComponent(refundId)}`));
  }

  async verifyWebhook(headers: WebhookHeaders, event: unknown): Promise<boolean> {
    if (!this.config.webhookId) return false;
    if (!headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) return false;
    const result = await this.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      body: {
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: this.config.webhookId,
        webhook_event: event,
      },
    });
    return result.verification_status === "SUCCESS";
  }
}

let cached: PaymentProvider | null = null;
let override: PaymentProvider | null = null;

/** Tests inject a fake provider here; the application never does. */
export function setProviderForTests(p: PaymentProvider | null): void {
  override = p;
}

export function paymentProvider(): PaymentProvider {
  if (override) return override;
  cached ??= new PayPalHttpProvider(paypalConfigFromEnv());
  return cached;
}

export function paymentsConfigured(): boolean {
  if (override) return true;
  try {
    paypalConfigFromEnv();
    return true;
  } catch {
    return false;
  }
}

export function configuredMerchantId(): string | null {
  try {
    return paypalConfigFromEnv().merchantId;
  } catch {
    return null;
  }
}
