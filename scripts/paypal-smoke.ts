import { randomUUID } from "node:crypto";
import { PayPalHttpProvider, paypalConfigFromEnv } from "../src/integrations/paypal/http";

// Real PayPal sandbox smoke test (not a mock). Usage:
//   npm run smoke:paypal                 create a $1.00 sandbox CAPTURE order and print its approval link
//   npm run smoke:paypal -- <orderId>    after approving as a sandbox buyer, capture it and re-read the capture
async function main() {
  const provider = new PayPalHttpProvider(paypalConfigFromEnv());
  const orderId = process.argv[2];
  if (!orderId) {
    const id = randomUUID();
    const order = await provider.createOrder({
      requestId: `pact-smoke-${id}`,
      amount: { currency: "USD", minor: 100 },
      customId: `smoke-${id}`,
      invoiceId: `pact-smoke-${id}`,
      description: "Pact sandbox smoke test",
      returnUrl: "http://localhost:3000/smoke-return",
      cancelUrl: "http://localhost:3000/smoke-cancel",
      shipping: "NO_SHIPPING",
      brandName: "Pact sandbox smoke test",
    });
    const reread = await provider.getOrder(order.id);
    console.log(JSON.stringify({ created: { id: order.id, status: order.status }, reread: { status: reread.status, amount: reread.amount }, approveUrl: order.approveUrl }, null, 2));
    return;
  }
  const captured = await provider.captureOrder(orderId, `pact-smoke-capture-${orderId}`);
  for (const c of captured.captures) {
    const fresh = await provider.getCapture(c.id);
    console.log(JSON.stringify({ orderStatus: captured.status, capture: { id: fresh.id, status: fresh.status, amount: fresh.amount, orderId: fresh.orderId } }, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
