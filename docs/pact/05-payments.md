# PayPal integration and recovery

## Integration decision

Use independent Orders v2 CAPTURE checkouts for an initial deposit, approved additional deposit and later balance. Each payment requires explicit buyer approval. No long-duration authorization, escrow, payouts or automatic charge against a previous approval.

Initial demo: one sandbox merchant and synthetic buyers. This establishes first-party functionality, not permission to serve arbitrary production merchants. Before SaaS onboarding, verify the applicable partner/merchant authorization route with PayPal. Transaction Search is not a dependency.

## Endpoints

- POST /v2/checkout/orders: create a CAPTURE order for one obligation.
- GET /v2/checkout/orders/{id}: verify provider order details.
- POST /v2/checkout/orders/{id}/capture: capture after approval and local validation.
- GET /v2/payments/captures/{id}: retrieve authoritative capture state.
- POST /v2/payments/captures/{id}/refund: merchant-approved full/partial refund.
- GET /v2/payments/refunds/{id}: confirm refund outcome.
- Webhook signature verification using PayPal's documented mechanism and configured webhook ID.

Follow current official schemas rather than this document as field-level API reference. Put opaque local obligation/revision references into supported invoice_id/custom_id fields within documented limits; keep full scope and customer messages out of payment metadata. Physical goods need appropriate shipping handling; service orders have different requirements.

## Payment math: synthetic apparel example

Original total 60,000 USD cents; 50% deposit target 30,000; completed initial capture 30,000.
Revised total 80,000; target 40,000; authorized prior funding 30,000; additional obligation 10,000; remaining final balance 40,000 after top-up completes.

Code computes deposit rounding using a documented minor-unit rounding policy. One currency per job. Merchant approves prices and taxes before publication. Never subtract PayPal merchant fees from the amount the customer has paid.

## Idempotency and failure handling

Store operation ID, purpose, payload hash, provider order/capture/refund IDs and stable PayPal-Request-Id before a write. A repeated local request returns the existing operation. PayPal retention is endpoint-specific and finite; local deduplication must outlast it.

If a create/capture/refund request times out, keep its outcome UNKNOWN. Reuse the original idempotency key while supported and retrieve known provider resources. If an order ID was never recovered and the provider key window has expired, require reconciliation/manual investigation rather than generating another charge. Never represent uncertainty as FAILED merely because the network failed.

On capture response: verify merchant/payee, currency, amount and expected order association from authoritative data. Completed capture can establish funding; pending cannot. Persist payment and re-evaluate revision relevance under a database lock. Browser query parameters never mark a payment paid.

Webhook processing: verify before trusting; deduplicate event ID; durably acknowledge then process. Out-of-order events cause resource re-fetch, not blind status regression. Unmatched events enter an exception queue. Real sandbox event delivery is an acceptance gate; simulator-only success is insufficient.

## Races and refunds

If a customer pays while the merchant supersedes a proposal, preserve the charge and enter REVIEW_REQUIRED. Do not release work, silently transfer approval or issue an automatic refund. Merchant resolves carry-forward or refund with customer-visible explanation.

Reserve refundable capacity across concurrent operations. Pending refunds block conflicting refunds. On completion, update the ledger using refund ID and amount. Capture status alone does not prove cumulative refunded balance. Reconcile external refunds where accessible; external payment activity can otherwise leave local balances stale and must be disclosed as a production concern.

A refund request is not a promise of immediate cash arrival. Record submitted/pending/completed/failed distinctly. Repeated refund execution must not refund twice.

## Sandbox proof checklist

Create, approve and capture initial deposit; independently retrieve capture. Repeat for top-up. Replay requests and events. Create one partial refund and independently retrieve refund. Exercise decline/cancel, pending/unknown handling and stale revisions. Save redacted request IDs and outcomes in validation notes; never publish credentials.

Sources: [Orders](https://developer.paypal.com/api/orders/v2/), [Payments](https://developer.paypal.com/api/payments/v2/), [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [Webhooks](https://developer.paypal.com/api/rest/webhooks/rest/).
