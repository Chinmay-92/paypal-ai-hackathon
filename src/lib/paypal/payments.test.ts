import { describe, expect, it } from "vitest";
import { PayPalClient, PayPalError } from "./client";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, refundCapture } from "./payments";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const match = responses[path];
    if (!match) throw new Error(`Unexpected request ${path}`);
    return new Response(JSON.stringify(match.body), { status: match.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const token = { "/v1/oauth2/token": { body: { access_token: "tok", expires_in: 3600 } } };
const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];

describe("PayPal payments", () => {
  it("creates an AUTHORIZE order and returns the payer approval link", async () => {
    const { impl, calls } = fakeFetch({
      ...token,
      "/v2/checkout/orders": {
        body: { id: "ORD1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://pp/approve" }] },
      },
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: "https://api.test", fetch: impl });
    const { approveUrl } = await createAuthorizeOrder(client, {
      dealId: "deal-1",
      total: { currency: "USD", minor: 300000 },
      description: "1,000 tote bags",
      returnUrl: "https://app/return",
      cancelUrl: "https://app/cancel",
      requestId: "deal-1:create-order",
    });
    expect(approveUrl).toBe("https://pp/approve");
    const orderCall = calls[1];
    expect(header(orderCall, "PayPal-Request-Id")).toBe("deal-1:create-order");
    expect(header(orderCall, "Authorization")).toBe("Bearer tok");
    const body = JSON.parse(String(orderCall.init.body));
    expect(body.intent).toBe("AUTHORIZE");
    expect(body.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "3000.00" });
  });

  it("captures partial amounts against an authorization with distinct request IDs", async () => {
    const { impl, calls } = fakeFetch({
      ...token,
      "/v2/checkout/orders/ORD1/authorize": {
        body: { id: "ORD1", status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } }] },
      },
      "/v2/payments/authorizations/AUTH1/capture": { body: { id: "CAP1", status: "COMPLETED" } },
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: "https://api.test", fetch: impl });
    const auth = await authorizeOrder(client, "ORD1", "deal-1:authorize");
    expect(auth.id).toBe("AUTH1");
    await captureAuthorization(client, {
      authorizationId: "AUTH1",
      amount: { currency: "USD", minor: 90000 },
      finalCapture: false,
      invoiceId: "deal-1-deposit",
      requestId: "deal-1:capture-deposit",
    });
    const capture = calls.at(-1)!;
    expect(header(capture, "PayPal-Request-Id")).toBe("deal-1:capture-deposit");
    expect(JSON.parse(String(capture.init.body))).toEqual({
      amount: { currency_code: "USD", value: "900.00" },
      final_capture: false,
      invoice_id: "deal-1-deposit",
    });
    // Token is cached across calls.
    expect(calls.filter((c) => c.url.endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("surfaces PayPal error names and debug IDs", async () => {
    const { impl } = fakeFetch({
      ...token,
      "/v2/payments/captures/CAP1/refund": {
        status: 422,
        body: { name: "UNPROCESSABLE_ENTITY", message: "Refund exceeds capture", debug_id: "dbg123", details: [{ issue: "REFUND_AMOUNT_EXCEEDED" }] },
      },
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: "https://api.test", fetch: impl });
    const err = await refundCapture(client, {
      captureId: "CAP1",
      amount: { currency: "USD", minor: 1 },
      noteToPayer: "x",
      requestId: "r",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.debugId).toBe("dbg123");
    expect(err.status).toBe(422);
  });
});
