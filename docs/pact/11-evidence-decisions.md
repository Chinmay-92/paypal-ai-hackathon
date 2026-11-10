# Evidence and decision log

Research accessed October 19–20, 2026. Evidence is not an endorsement of vendor efficacy. Reddit posts are self-reports, not representative incidence estimates.

## Evidence register

| Source | What it establishes | What it does not establish |
| --- | --- | --- |
| [Print-shop order management, Nov 14 2025](https://www.reddit.com/r/SCREENPRINTING/comments/1owitch/order_management/) | Owner reports overload and coordination problems; replies describe workarounds | Frequency of missed paid amendments or demand for Pact |
| [Proofing discussion, Aug 19 2026](https://www.reddit.com/r/SCREENPRINTING/comments/1vsqlpb/proofing/) | Email/approval histories and existing tools used; some report no issues | Universal dissatisfaction |
| [Printavo approvals](https://updates.printavo.com/multiple-approvals-automation-59338) | Vendor supports quote/artwork approval and payment automation | That Pact improves outcomes |
| [Aleyant AI Estimate](https://www.aleyant.com/ai-estimate/) | Vendor offers email-to-estimate AI | Unserved AI quoting market |
| [Scopey](https://www.scopeyonsite.com/) | Adjacent message-to-contract workflow exists | Novelty of domain expansion |
| [Orders v2](https://developer.paypal.com/api/orders/v2/) | Documented checkout capability | Successful Pact integration or merchant onboarding approval |
| [Payments v2](https://developer.paypal.com/api/payments/v2/) | Documented capture/refund resources | Guaranteed refund timing or dispute outcome |
| [PayPal Developer Agreement](https://www.paypal.com/us/legalhub/paypal/xdeveloper-full) | Contractual consent/data-use constraints | Legal clearance of proposed hosting/model setup |
| [Render sponsor page](https://paypalaihackathon.devpost.com/details/render) | Hosting/workflow offering and advertised credit | Credits claimed or deployment completed |
| [Event rules](https://paypalaihackathon.devpost.com/rules) | Requirements and dates | Eligibility of any particular entrant |

## Accepted decisions

- D01: User-selected working name Pact; tagline 'Changes agreed. Work aligned.' Naming clearance remains open.
- D02: Responsive web app with merchant/customer/fulfillment views. No native app or extension required.
- D03: General amendment engine demonstrated in custom goods and services, not print-shop-only branding.
- D04: Separate buyer-approved CAPTURE checkout per obligation. No escrow or delayed automatic release.
- D05: AI proposes cited changes; merchant decides commercial effects; customer explicitly approves.
- D06: One model, PostgreSQL and Render. Sponsor breadth is not a goal.
- D07: Initial explicit upload/paste/portal intake. WhatsApp/email connectors later and only through authorized routes.
- D08: Preserve historical docs and SpecLock code branch; current Pact blueprint supersedes their product direction.
- D09: Immutable published revisions, independent funding/fulfillment states and durable operation recovery.
- D10: The documentation branch contained documentation, fixtures and documentation checks only. Superseded by the implementation on `feat/pact-app` (D11 onwards).

## Implementation decisions and deviations (2026-10-22)

- D11: Pinned stack: Next.js 16.4.2, React 19.3.0, pg 8.23.1, zod 4.6.7, @google/genai 2.30.0, Vitest 5. Model: `gemini-3.7-flash` (`gemini-2.5-flash` is no longer offered to new keys). Override it with `GEMINI_MODEL`; every proposal records the model ID, model version and prompt version.
- D12: Revision states drop MERCHANT_REVIEW. The single editable DRAFT is the merchant review state. Database triggers enforce immutability after publish.
- D13: Added a local funding state, CANCELLED, for an unpaid obligation whose revision was replaced. NOT_REQUIRED is used when credited funding already covers a deposit. Neither is a PayPal status.
- D14: Carry-forward rule: completed payments already credited to the job count toward a newly approved revision. This is disclosed in the revision terms (`creditsPriorPayments`), and the amounts shown are snapshotted in `approvals.disclosed_terms`. A payment captured against a replaced revision is never credited automatically. It becomes REVIEW_REQUIRED until the merchant credits it or refunds it.
- D15: A record in another tenant returns 404, so its existence is not disclosed. Role violations inside a tenant return 403.
- D16: CSRF protection checks the Origin header on cookie-authenticated writes, plus SameSite=Lax cookies. Rate limits are per process, so a multi-instance deployment needs a shared store.
- D17: A verified CHECKOUT.ORDER.APPROVED webhook may trigger a server-side capture, because the buyer explicitly approved that order. The capture still re-reads the order and checks the amount, reference and payee.
- D18: An unexpected error during a provider call is recorded as UNKNOWN, never FAILED. Only a definitive 4xx rejection retires an order.
- D19: Attachments are not implemented yet. Artwork changes reference merchant catalog IDs, and a message such as "use the attached logo" proposes an unresolved artwork value. This is a P0 gap.
- D20: The original agreement is entered manually. Creating it from a reviewed extraction is not implemented yet (P0 gap).
- D21: Render Blueprint (`render.yaml`). The owner chose free tiers for now (2026-10-22): free web and free Postgres, no worker (Render has no free worker plan), and migrations on start. Gate: before submission, upgrade Postgres (free expires after 30 days, before judging ends December 15) and the web service (free sleeps after 15 minutes). Render docs checked 2026-10-22.
- D22: Hosted demo mode (`PACT_DEMO_MODE=true`) creates an isolated synthetic tenant per visitor at `/demo`, rate-limited per IP and capped per day, instead of sharing one demo login. Sandbox buyer credentials are given to judges privately, not in source.
- D23: `tsx` is a runtime dependency, because migrations and the worker run TypeScript directly on the host. In production, `APP_ORIGIN` is required for links and redirects behind the proxy.
- D24: Attachments are stored in PostgreSQL (`bytea`) with immutable bytes and hash, not in separate object storage, and access is authorized per request by session rather than through short-lived signed URLs. This is simpler for the prototype and fits Render's free database. Move to private object storage before real customer files. This supersedes the attachment gap in D19.
- D25: Creating the original agreement from a pasted quote is proposal-only: the endpoint stores nothing, and the merchant reviews cited values in the new-job form. This replaces the gap in D20.
- D26: When the primary model returns 429, 5xx or a timeout, the extractor retries once on `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash`), then falls back to the deterministic baseline. Every proposal records the model actually used.
- D27: The AI evaluation set has 44 synthetic cases: 12 development cases (which informed the baseline and prompt) and 32 held-out cases written after both were frozen. Held-out results are reported, never asserted in tests or used for tuning.
- D28: Hackathon track: **Business Solutions**. Pact is a tool that helps merchants and freelancers keep changes, approvals, payments and work instructions aligned. Not *AI Agents or Automation*: that track asks for agents that transact on a user's behalf, which conflicts with the rule that AI cannot authorize charges. Every PayPal payment in Pact is approved by the buyer.

## Deployment update (2026-11-10)

- The owner set a $0 limit. A separate Render Hobby workspace without a payment method has a new free web service and free PostgreSQL database; the earlier deployment was not replaced. Render reports the new database expires on December 10, before the stated December 15 judging end. A tested $0 continuity plan is still required. Free-service limits can cause suspension.
- Automatic Blueprint sync was disabled to prevent an unreviewed infrastructure change. The new demo's runtime is configured for `gemini-3.5-flash-lite` with its model retry disabled by setting the fallback to the same model; this differs from D11 and D26. Model performance and the current sandbox payment workflow are not yet verified by this configuration alone.
- The evaluation now stops on a reported Gemini rate or quota limit instead of continuing through remaining cases. Use a single free-tier model and disable model fallback when running it under the $0 constraint. No model evaluation result is claimed until a run completes and is reviewed.
- On November 10, the new host returned a healthy database and reported the sandbox and `gemini-3.5-flash-lite`. In a synthetic apparel workspace, a buyer approved R1 and paid a $300 sandbox deposit; a cited Gemini hoodie substitution was reviewed, published and approved; the buyer paid a $100 top-up. Pact displayed both captures as completed, released R2, displayed R2 on the job sheet and reported a $10 partial refund as completed. Its timeline recorded the captures as verified with PayPal, including webhook-sourced records for each, and the refund as verified with PayPal. This single model example is not the held-out evaluation.

## Interface refresh (2026-11-10)

- The local demo interface uses a cloudscape and crystalline agreement illustration on the landing page, plus a refreshed merchant sidebar. This is a presentation change; agreement, approval, and payment rules remain unchanged. The refresh has not been deployed.

## Telegram intake (2026-11-10)

- Added optional private-chat text intake using a one-use, job-scoped link. Telegram messages remain unverified source data and create reviewable change requests; no agreement or payment is approved by the bot. The bot sends no messages. This requires a database migration, a secret token, and webhook configuration; deployment and live end-to-end verification are separate steps. The supplied bot responded to Telegram getMe; its webhook was not configured. Local production build, typecheck, lint, documentation checks and isolated webhook-secret test passed. The PostgreSQL integration suite could not be run in this environment (Vitest startup failed and no local PostgreSQL server was available).

## Open decisions and gates

| Item | Gate |
| --- | --- |
| Exact framework/model versions | Choose at implementation; pin and evaluate |
| Real customer recurrence and budget | Historical cases and manual experiment |
| Production merchant authorization | PayPal-supported onboarding path verified |
| Data retention and external model permission | Applicable contract/privacy assessment |
| Brand/domain/trademark | Separate clearance for Pact |
| Production customer identity/signing needs | Jurisdiction and customer requirements |
| Paid pricing and domain expansion | Pilot evidence per segment |

A change to these decisions must record rationale, evidence and impact on acceptance tests. Do not silently revive a rejected dependency or convert a hypothesis into a fact.
