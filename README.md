# Pact

**Changes agreed. Work aligned.**

Pact is a responsive web application for businesses selling custom goods and project services. It turns customer amendment requests into reviewed revisions, explicit approvals, correct PayPal payments, and current fulfillment instructions.

**Status: early runnable prototype (sandbox only).** One vertical amendment workflow runs end to end locally across both demonstration domains. Several P0 items are still missing; see [Implementation status](#implementation-status). Nothing here is evidence of demand, users or production readiness.

## The problem

Customer changes arrive through messages and documents, while scope, price, payment and delivery instructions live elsewhere. A missed amendment can cause unpaid work, incorrect production or disagreement about what was authorized.

## The first product

- Merchant workspace: review a request beside the agreed scope, resolve ambiguity, price and publish a revision.
- Mobile customer portal: compare changes, approve or decline, then explicitly approve any additional PayPal payment.
- Fulfillment view: show the current authorized job sheet and blockers.
- Shared engine demonstrated with custom apparel and a website project. Domain templates change; revision and payment safeguards remain the same.

Pact starts as a web app. No extension, native mobile app, CLI product or WhatsApp bot is required. Uploaded/pasted correspondence and messages sent inside Pact form the initial intake. External channels are adapters added after the core works.

## Read the blueprint

1. [Product and scope](docs/pact/01-product.md)
2. [Experience and screens](docs/pact/02-experience.md)
3. [Domain model and state rules](docs/pact/03-domain-model.md)
4. [Architecture and application API](docs/pact/04-architecture.md)
5. [PayPal integration and payment recovery](docs/pact/05-payments.md)
6. [AI behavior and evaluation](docs/pact/06-ai-evaluation.md)
7. [Security, privacy and legal boundaries](docs/pact/07-security-legal.md)
8. [Build plan and acceptance tests](docs/pact/08-build-plan.md)
9. [Validation, competition and business hypotheses](docs/pact/09-validation.md)
10. [Demo and submission](docs/pact/10-demo-submission.md)
11. [Evidence and decisions](docs/pact/11-evidence-decisions.md)
12. [Operations and implementation handoff](docs/pact/12-operations.md)

[Machine-readable demonstration fixtures](fixtures/pact/scenarios.json) contain synthetic examples and expected outcomes. They are not customer records. [AI evaluation cases](fixtures/pact/ai-cases.json) define the initial evaluation contract.

## Implementation starting point

The remote branch `feat/speclock-mvp` contains earlier SpecLock code. Do not treat its authorization/QC flow as the Pact implementation. [The migration assessment](docs/pact/04-architecture.md#existing-code) identifies reusable candidates and incompatible assumptions. This documentation branch starts from `main` and leaves that implementation intact.

Stack in use: TypeScript, Next.js 16.4.2 / React 19.3, PostgreSQL via `pg`, zod 4, Gemini via `@google/genai`, PayPal REST (sandbox). Versions are pinned in `package.json` and locked in `package-lock.json`. Private attachment storage and Render hosting are still planned. APIMatic/Postman may help development; other sponsors are outside the committed scope.

## Run locally

Requirements: Node.js 20.9+ (tested with 26.12), PostgreSQL 15+ (tested with 15.15), PayPal **sandbox** REST app credentials. A Gemini API key is optional; without one the deterministic baseline extractor is used.

```sh
npm install
createdb pact_dev && createdb pact_test
cp .env.example .env.local        # fill in DATABASE_URL, PAYPAL_CLIENT_ID/SECRET, optional GEMINI_API_KEY
npm run db:migrate
npm run db:seed                   # synthetic tenant, users and two published demo jobs; prints customer review links
npm run dev                       # http://localhost:3000 (set APP_ORIGIN if you use another port)
npm run worker                    # optional: outbox analysis, payment reconciliation, webhook retries
```

Sign in as `owner@northwind.example.test` (or `team@northwind.example.test` for the fulfillment view) with the seed password (`pact-demo-only` unless `SEED_PASSWORD` is set). Open a printed review link in a separate (mobile-sized) browser session to act as the customer. Paying requires a PayPal sandbox buyer account.

Checks:

```sh
npm run typecheck
npm run lint
npm test                          # unit + PostgreSQL integration tests (uses TEST_DATABASE_URL, default postgres://localhost:5432/pact_test)
npm run build
npm run check:docs                # blueprint links and fixture invariants
npm run eval:ai                   # synthetic AI cases: baseline, plus the model if configured
npm run smoke:paypal              # real sandbox order creation; `-- <orderId>` captures after buyer approval
```

Integration tests inject failures through an in-memory PayPal **test double** (`test/fake-paypal.ts`). Those tests prove Pact's own recovery logic, not PayPal behavior.

## Implementation status

Last verified 2026-10-22 on branch `feat/pact-app`.

Working locally:

- Merchant login with hashed sessions and tenant-scoped queries; owner and fulfillment roles. Customer review links are stored hashed and swapped for a short job-scoped session.
- Apparel and website templates on one engine. Merchant rate cards and artwork catalogs. Original agreement entered manually, then published.
- Message intake (pasted or portal) → outbox analysis → validated proposal with citations. Gemini (`gemini-3.7-flash`) with fallback to a deterministic baseline. Literal-quote, field, catalog and base-revision checks. Questions, approval-like wording and injected instructions cannot change the agreement.
- Merchant review: resolve missing fields, set prices, create a draft, publish an immutable revision. Database triggers enforce revision immutability and an append-only audit log.
- Customer portal: see the diff and money effect, then approve or decline that exact revision and content hash. Stale proposals and replaced links are refused.
- Separate buyer-approved PayPal Orders v2 CAPTURE checkouts for the deposit, additional deposit and balance. Durable operations with stable `PayPal-Request-Id`s. Lost responses become UNKNOWN and are reconciled. Payments for a replaced revision become REVIEW_REQUIRED and need an explicit credit or refund decision. Merchant-reviewed partial refunds use reserved capacity. Webhooks are verified, deduplicated and re-read from the provider.
- Readiness blockers, merchant release, started-work exceptions, manual holds, printable job sheet and history timeline.

Verified against the real PayPal sandbox: OAuth, order creation (smoke script and the app's checkout redirect to sandbox approval), order retrieval, and a capture refused for an unapproved order (`PAYER_ACTION_REQUIRED`). **Not yet verified in the sandbox:** buyer approval plus capture through the app, refunds, and webhook delivery and signature verification. These need a sandbox buyer account and a public webhook URL.

Not implemented yet: attachment upload and storage (artwork is chosen from catalog IDs), creating the original agreement from extraction, email notifications, deployment (Render), backup/restore test, held-out AI evaluation set (only 12 development cases exist), real-user replay. See [decisions](docs/pact/11-evidence-decisions.md) D11–D20 for deviations from the blueprint.

## Hackathon

[Official event](https://paypalaihackathon.devpost.com/) · [Rules](https://paypalaihackathon.devpost.com/rules)

Deadline: **November 13, 2026, 01:30 IST** (November 12, 12:00 PST). Runnable build, meaningful PayPal sandbox + AI, public licensed repository, and public YouTube demo under three minutes are required. Keep judge access functional through the stated judging period; see submission notes.

## Historical research

Earlier concepts remain historical and do not define current Pact requirements: [brainstorm](docs/brainstorm.md), [research](docs/research.md), [general stress test](docs/stress-test.md), [ClaimIt](docs/stress-test-claimit.md), [SpecLock](docs/stress-test-speclock.md).

Code and original documentation are MIT licensed; third-party materials retain their own rights. Pact is a working name selected by the project owner, not a trademark-cleared brand.
