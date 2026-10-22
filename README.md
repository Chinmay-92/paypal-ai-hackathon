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
13. [Submission draft (not submitted)](docs/pact/13-submission-draft.md)

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

## Deploy (Render)

`render.yaml` is a Render Blueprint: one web service (migrations run on start) and PostgreSQL, currently on **free** plans. **Upgrade before submission:** free Postgres expires 30 days after creation (before judging ends on December 15), and the free web service sleeps after 15 idle minutes. Render has no free worker, so the worker is omitted; payments still recover through verified webhooks and the "Check payment status" button. To add it back, run `npm run worker` as a Render background worker.

1. Merge to `main`, which the Blueprint deploys. In Render, choose **New → Blueprint** and pick this repository.
2. Enter the prompted secrets: `APP_ORIGIN` (the service URL, e.g. `https://pact-web.onrender.com`), PayPal sandbox client ID and secret, `PAYPAL_WEBHOOK_ID`, and `GEMINI_API_KEY`.
3. In the PayPal sandbox app, add the webhook `https://<service host>/api/paypal/webhook` for `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.*`. Put its ID in `PAYPAL_WEBHOOK_ID` on the web service and redeploy.
4. Open `https://<service host>/demo`. With `PACT_DEMO_MODE=true`, each visitor gets an isolated synthetic workspace (rate-limited, capped by `PACT_DEMO_DAILY_LIMIT`) and is signed in as its owner.

Give judges sandbox buyer credentials privately in the submission's testing instructions. Never put them in this repository.

## Implementation status

Last verified 2026-10-22 on branch `feat/pact-app`.

Working locally:

- Merchant login with hashed sessions and tenant-scoped queries; owner and fulfillment roles. Customer review links are stored hashed and swapped for a short job-scoped session.
- Apparel and website templates on one engine, with merchant rate cards and artwork catalogs. The original agreement is entered manually or proposed from a pasted quote or thread: cited values the merchant reviews before saving. Nothing is stored until then.
- Private attachments (PNG, JPEG, WebP, PDF; up to 5 MB, type checked from the bytes; no SVG). They can be added by the merchant or from the customer portal, can travel with a message, and are served only to the tenant or that job's customer. An uploaded image becomes selectable artwork for that job, so "use the attached logo" proposes that exact file.
- Message intake (pasted or portal) → outbox analysis → validated proposal with citations. Gemini `gemini-3.7-flash`, retried once on `gemini-3.5-flash` when overloaded or rate-limited, then the deterministic baseline. Literal-quote, field, catalog and base-revision checks. Questions, approval-like wording and injected instructions cannot change the agreement.
- Merchant review: resolve missing fields, set prices, create a draft, publish an immutable revision. Database triggers enforce revision immutability and an append-only audit log.
- Customer portal: see the diff and money effect, then approve or decline that exact revision and content hash. Stale proposals and replaced links are refused.
- Separate buyer-approved PayPal Orders v2 CAPTURE checkouts for the deposit, additional deposit and balance. Durable operations with stable `PayPal-Request-Id`s. Lost responses become UNKNOWN and are reconciled. Payments for a replaced revision become REVIEW_REQUIRED and need an explicit credit or refund decision. Merchant-reviewed partial refunds use reserved capacity. Webhooks are verified, deduplicated and re-read from the provider.
- Readiness blockers, merchant release, started-work exceptions, manual holds, printable job sheet and history timeline.

Verified against the real PayPal sandbox on 2026-10-22, driven through the app UI with a sandbox buyer account (synthetic apparel job):

- Deposit: $300.00 order created, approved by the buyer, captured server-side and re-read independently (`COMPLETED`).
- Amendment: substitution proposed by `gemini-3.7-flash`, sizes resolved by the merchant, R2 published and approved. Additional deposit of $100.00 captured and re-read (`COMPLETED`). Work released.
- Partial refund: $10.00 refund `COMPLETED`, re-read independently. The capture is now `PARTIALLY_REFUNDED` at PayPal.
- An unapproved order returning to the app was refused (`PAYER_ACTION_REQUIRED`) and recorded no funding.

- Webhooks: real sandbox deliveries through a temporary tunnel, for `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`. Each passed PayPal's signature verification, was stored once by event ID and was processed after re-reading the resource. The approval event and the browser return raced on the same order and produced exactly one capture.

Webhook setup: add `https://<public-url>/api/paypal/webhook` to the sandbox app, subscribe it to `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.*`, and put its ID in `PAYPAL_WEBHOOK_ID`. Unsigned or unverifiable events are rejected with 400. A hosted deployment needs a stable URL; quick tunnels change on restart.

Not implemented yet: email notifications, separate object storage (attachments live in PostgreSQL for now), a verified hosted deployment (the Render Blueprint exists but has not been deployed), backup/restore test, real-user replay. The AI evaluation has 44 synthetic cases (12 dev, 32 held-out); see `reports/ai-eval-latest.json`. See [decisions](docs/pact/11-evidence-decisions.md) D11–D20 for deviations from the blueprint.

## Hackathon

[Official event](https://paypalaihackathon.devpost.com/) · [Rules](https://paypalaihackathon.devpost.com/rules)

Deadline: **November 13, 2026, 01:30 IST** (November 12, 12:00 PST). Runnable build, meaningful PayPal sandbox + AI, public licensed repository, and public YouTube demo under three minutes are required. Keep judge access functional through the stated judging period; see submission notes.

## Historical research

Earlier concepts remain historical and do not define current Pact requirements: [brainstorm](docs/brainstorm.md), [research](docs/research.md), [general stress test](docs/stress-test.md), [ClaimIt](docs/stress-test-claimit.md), [SpecLock](docs/stress-test-speclock.md).

Code and original documentation are MIT licensed; third-party materials retain their own rights. Pact is a working name selected by the project owner, not a trademark-cleared brand.
