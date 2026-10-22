# Operations and implementation handoff

## Environments

Local development and hosted demonstration use PayPal sandbox exclusively. Keep synthetic public demo tenants separate from any consented research records. Production deployment is not authorized or represented by a successful sandbox demo.

Expected secret/configuration categories: database URL; application origin; auth/session secret; PayPal sandbox client ID and secret; PayPal webhook ID; model provider key and pinned model ID; private storage configuration. Populate a real .env.example only when chosen modules define exact names. Never put server secrets in NEXT_PUBLIC variables or fixtures.

## Runtime behavior

Persist all authoritative state in PostgreSQL. Worker retries have bounded exponential backoff and dead-letter/exception visibility. Periodically reconcile UNKNOWN/PENDING operations against known provider IDs. Model retries are safe only because proposals have no execution authority. Notifications use an outbox with recipient/job validation and send deduplication.

Structured logs include internal correlation ID, operation ID and error category. Do not log raw customer text, private files, access tokens or full provider payloads. Metrics: extraction latency, schema/citation rejection, review correction, payment uncertainty, webhook delay, stale revision conflicts and unresolved exceptions. No unmeasured 'money saved' counter.

## Recovery

- Database outage: block writes and payment initiation; do not accept money without durable operation reservation.
- Model outage: allow merchant-authored revisions with the same approval/payment safeguards.
- Payment timeout: UNKNOWN and recover; never ask the user to create another payment immediately.
- Webhook outage: retain provider state checks and reconcile outstanding operations; alert merchant/judge diagnostically.
- Deployment restart: reprocess durable outbox safely; restore job and operation state.
- Attachment deletion: retain only permitted metadata/audit references according to policy; surface missing evidence honestly.

Before public demo, test backup restore and expire/reset synthetic workspaces without erasing unresolved payment operations. A fixture reset must not make old provider events attach to a new unrelated job.

## Judge experience

Provide a hosted sandbox demo with constrained synthetic tenants, clear sandbox labeling and rate limits. Give judges secure instructions for test buyer access. Also provide reproducible local setup, migration and seed instructions. Keep hosting and model access valid through judging; a trial expiring after submission is not sufficient.

## Delivery status

Completed: product blueprint, specifications, fixtures and checks. Local Pact runtime (see README implementation status), with 70 automated tests (unit plus PostgreSQL integration, payment failures injected through a test double). Sandbox order creation verified. A first synthetic AI evaluation is in `reports/ai-eval-latest.json` (12 development cases: baseline 12/12, a set it was written against; model 8/12, with all 4 misses being provider 503 or timeout errors and 8/8 correct on the cases it answered).

Not completed: sandbox buyer approval plus capture through the app, refunds and webhook delivery; held-out AI evaluation; deployment; backup/restore test; user interviews; production permissions; legal clearance; hackathon submission. Update implementation claims only with actual test evidence.
