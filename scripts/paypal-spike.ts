// Day-1 sandbox spike from docs/stress-test-speclock.md §9:
//   1. AUTHORIZE order → capture 30% (final_capture=false) → capture 70% (final_capture=true)
//   3. Partial refund, then replay the same PayPal-Request-Id and confirm no second refund
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... npm run spike:paypal
// You approve the order once in a browser with a sandbox *personal* account.

import { randomUUID } from "node:crypto";
import { PayPalClient, PayPalError, configFromEnv } from "../src/lib/paypal/client";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  refundCapture,
  type Order,
} from "../src/lib/paypal/payments";

let client: PayPalClient;
const run = `spike-${randomUUID().slice(0, 8)}`;
const total = { currency: "USD", minor: 10_000 };
const deposit = { currency: "USD", minor: 3_000 };
const balance = { currency: "USD", minor: 7_000 };

async function waitForApproval(orderId: string) {
  for (let i = 0; i < 120; i++) {
    const order = await client.request<Order>("GET", `/v2/checkout/orders/${orderId}`);
    if (order.status === "APPROVED") return;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for buyer approval (10 minutes)");
}

async function main() {
  client = new PayPalClient(configFromEnv());
  const { order, approveUrl } = await createAuthorizeOrder(client, {
    dealId: run,
    total,
    description: "SpecLock spike",
    returnUrl: "https://example.com/return",
    cancelUrl: "https://example.com/cancel",
    requestId: `${run}:create`,
  });
  console.log(`Order ${order.id}. Approve with a sandbox personal account:\n  ${approveUrl}\n(The return page may 404; that's fine.)`);
  await waitForApproval(order.id);

  const auth = await authorizeOrder(client, order.id, `${run}:authorize`);
  console.log(`✓ Authorized ${auth.id} (${auth.status}, expires ${auth.expiration_time ?? "?"})`);

  const first = await captureAuthorization(client, {
    authorizationId: auth.id, amount: deposit, finalCapture: false, invoiceId: `${run}-deposit`, requestId: `${run}:capture-deposit`,
  });
  console.log(`✓ Spike 1a: deposit capture ${first.id} ${first.status}`);

  const second = await captureAuthorization(client, {
    authorizationId: auth.id, amount: balance, finalCapture: true, invoiceId: `${run}-balance`, requestId: `${run}:capture-balance`,
  });
  console.log(`✓ Spike 1b: balance capture ${second.id} ${second.status}`);

  const refundArgs = { captureId: second.id, amount: { currency: "USD", minor: 1_000 }, noteToPayer: "Spike remedy", requestId: `${run}:refund` };
  const refund = await refundCapture(client, refundArgs);
  const replay = await refundCapture(client, refundArgs);
  console.log(`✓ Spike 3: refund ${refund.id}; replay returned ${replay.id} → ${refund.id === replay.id ? "idempotent" : "NOT idempotent (two refunds!)"}`);
}

main().catch((err) => {
  if (err instanceof PayPalError) {
    console.error(`✗ ${err.message}`);
    console.error(JSON.stringify(err.details, null, 2));
    if (JSON.stringify(err.details ?? "").includes("AUTH_CAPTURE_NOT_ENABLED")) {
      console.error("Partial capture is not enabled on this sandbox merchant. Fallback per stress test: two orders.");
    }
  } else console.error(err instanceof Error ? `✗ ${err.message}` : err);
  process.exit(1);
});
