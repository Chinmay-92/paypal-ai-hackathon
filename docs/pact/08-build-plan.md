# Build plan and acceptance tests

Dates use Asia/Kolkata. Deadline November 13, 2026 01:30 IST. Target submission November 12 with buffer. No implementation milestone below is marked complete.

## Phase 1: October 20–23 — foundation and payment spike

- Establish app, locked dependencies, PostgreSQL migrations, auth/roles and tenant scope.
- Seed both synthetic jobs; implement original revision and manual review UI.
- Prove sandbox create/approve/capture/retrieve using a single merchant.
- Obtain anonymized historical amendment examples where available; review against competitors.

Exit: persisted original agreement and verified deposit survive restart; another tenant cannot access them. If sandbox access fails, resolve that before styling or additional integrations.

## Phase 2: October 24–28 — amendment intelligence

- Source intake, attachment records, model adapter and structured extraction.
- Side-by-side changes with source citations, clarification and merchant price/timing review.
- Immutable proposals, stale-version conflicts and customer approval portal.

Exit: question-only request cannot mutate scope; ambiguous substitution cannot publish; current proposal can be approved/declined; original remains intact.

## Phase 3: October 29–November 3 — payment-linked execution

- Additional CAPTURE checkout, durable operation/outbox handling, verified webhooks.
- Readiness and merchant release, current job sheet and started-work exceptions.
- Partial refund review/retrieval and explicit stale-payment resolution.

Exit: paid revision is the executed revision; retry/duplicate/out-of-order/restart scenarios pass.

## Phase 4: November 4–8 — complete both domains

- Service-specific inclusions/exclusions and scope-change case.
- Accessibility, responsive review, invitations and private attachment access.
- Held-out AI evaluation, baseline comparison and real-user replay if records obtained.
- Deployment, backup/recovery and structured diagnostic logs.

Exit: both domains run through the same engine; evaluation reports actual failures; no unsupported impact statistics.

## Phase 5: November 9–12 — submission

- Clean-machine setup, migration/seed, hosted sandbox test and credential instructions.
- Record 2:45 video, screenshots, public license, dependency/data rights check.
- Maintain judge access through December 15 judging end; budget hosting/model access.
- Final test pass and tag the demonstrated commit. Submission remains a separate explicit action.

## Required tests

| Test | Expected outcome |
| --- | --- |
| Duplicate checkout/capture | One durable operation and one charge |
| Concurrent top-up requests | One active obligation; unique constraints hold |
| Provider succeeds, response lost | UNKNOWN then recovered; no second charge |
| Payment after revision superseded | Recorded as exception; no production release |
| Forged webhook / browser success query | No funding change |
| Duplicate or out-of-order webhook | Idempotent processing and authoritative refresh |
| Pending capture | Fulfillment blocked |
| Partial refund retried | One refund; reserved capacity not exceeded |
| AI interprets question as instruction | Human review plus rules prevent commitment |
| Wrong source quote / unknown SKU | Unsupported proposal blocked |
| Customer approves old revision | 409/stale page, no current approval |
| Two amendments race | Version conflict, no lost update |
| Cross-tenant ID/file/token | Access denied |
| Change after work starts | Manual exception, no silent replacement |
| Process restarts mid-operation | Durable recovery |
| Model outage | Manual revision path remains available |

Use unit tests for policies/money; PostgreSQL integration tests for concurrency/authorization; provider mocks for precise failure injection; sandbox smoke tests for actual API behavior; browser E2E for full workflows. Mocks do not prove PayPal integration. Review deployed behavior with two separate sessions.
