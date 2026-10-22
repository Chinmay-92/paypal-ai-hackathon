# Domain model and state rules

## Records

- Tenant and User: business ownership, roles and membership.
- Job: tenant, customer, domain, currency, effective_revision_id, pending_revision_id, version, fulfillment_state.
- AgreementRevision: immutable scope, line items, totals, deposit policy, dates, artwork IDs, terms version, content hash and predecessor. Draft editing creates a draft version; published content cannot change.
- SourceMessage/Attachment: tenant/job, supplied or verified provenance, author/time, immutable content reference/hash and retention metadata.
- ChangeRequest: source IDs, base revision, classification, proposed patch, questions and review status.
- Approval: revision/hash, actor, authentication context, action, server timestamp and disclosed terms.
- PaymentObligation: purpose, revision, amount/currency, status and previous completed payments considered.
- PaymentOperation: stable idempotency key, provider IDs, intended action, payload hash, attempts, uncertain result and reconciliation status.
- PaymentEvent: append-only external ID, verified source, event type and processing status.
- RefundOperation: capture, amount, reason, reviewer and provider status.
- AuditEvent/OutboxEvent: authoritative transitions and durable asynchronous work.

Money uses integer minor units. Every query is tenant scoped. UUIDs do not replace authorization. Unique constraints cover provider event IDs, capture IDs, operation keys and one active obligation per revision/purpose.

## Independent states

Revision: DRAFT -> MERCHANT_REVIEW -> PUBLISHED -> CUSTOMER_APPROVED or DECLINED or SUPERSEDED. Approval is historical and remains true for its recorded revision even if later superseded.

Funding: NOT_REQUIRED, DUE, PROCESSING, UNKNOWN, PENDING, COMPLETED, PARTIALLY_REFUNDED, REFUNDED, FAILED, REVIEW_REQUIRED. These are local states mapped explicitly from provider responses; never invent a PayPal status.

Fulfillment: HOLD, READY, IN_PROGRESS, COMPLETED, EXCEPTION.

Keep an effective agreement distinct from a proposed amendment. Customer approval records consent; production activation additionally requires payment and business checks. Define in the presented terms whether activation is conditional on payment. Do not assume database status alone determines legal contract formation.

## Core invariants

1. AI creates proposals only; no authoritative money or scope mutation.
2. A source-backed proposed change must reference the base revision reviewed.
3. A new revision invalidates pending approval links for older proposals; it never deletes historical approvals.
4. Fulfillment READY requires current approved effective revision, required verified funding, no unresolved hold and merchant release.
5. Payment for revision A cannot silently fund changed revision B. Carry-forward is explicit and auditable after review.
6. Pending/unknown payment is not available funding. Only completed refunds reduce settled receipts; pending refunds reserve refundable capacity and block conflicting operations.
7. Question-only messages do not mutate scope. Potential material instructions create a review hold once identified. Intake cannot guarantee detection of messages never supplied to Pact.
8. Work already started requires manual feasibility approval; no automatic stop of physical machinery or reversal of delivered work.
9. Outstanding obligation is derived from the current approved policy, authorized carry-forward, completed captures and completed refunds. Payment processor fees are expenses, not reductions to customer credit.
10. A declining customer leaves the earlier agreement recorded; merchant resolves cancellation/change consequences explicitly.

## Concurrency

API mutations include expected job version and base revision. On mismatch return 409 with current state. Database transaction locks the job to commit proposal, approval or operation reservation. Do not keep a database transaction open across a PayPal call.

Reserve a durable operation in a transaction, call the provider, then finalize in a second transaction. If the response is lost, mark UNKNOWN and reconcile the same operation. Before activating a revision, recheck current pointers under lock. A successful remote charge against a now-stale revision becomes REVIEW_REQUIRED; preserve the money record and offer explicit carry-forward/refund review. Never retry it as a new payment.

## Reductions

A cheaper revision may create no payment due, credit against a later balance, or a proposed refund according to disclosed merchant policy. Lower total does not automatically imply an immediate refund. Do not exceed refundable completed captures or pretend retained work costs have been legally established by software.
