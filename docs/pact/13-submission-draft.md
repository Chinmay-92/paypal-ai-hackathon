# Submission draft (not submitted)

Working draft for the Devpost entry. Every claim must match the build and evidence at submission time. Re-check [demo and submission rules](10-demo-submission.md) and update anything marked TODO. Submitting is a separate, explicit action by the entrant.

## Track

Business Solutions (decision D28).

## Tagline

Pact — Changes agreed. Work aligned.

## What it does

When a customer changes an agreed custom job, Pact helps the business update the scope, get approval for that exact revision, collect the correct PayPal payment and give the team the current instructions.

- Paste or receive a customer message (with attachments). Pact proposes a structured amendment with quotes from the message. It never sets prices, approves anything or moves money.
- The merchant resolves anything ambiguous (for example "which sizes move to hoodies?"), confirms prices from their rate card, and publishes an immutable revision.
- The customer sees the exact change and its money effect on a mobile page, then approves or declines that revision. Stale links and replaced proposals cannot be approved.
- Each payment (deposit, top-up, balance) is a separate PayPal checkout the buyer approves. Lost responses, duplicate clicks, late webhooks and payments for replaced revisions are all handled without double charging.
- The team sees only the current authorized job sheet, and work is held while anything is unresolved.

The same engine runs two domains: custom apparel and a website project.

## How we built it

TypeScript, Next.js 16 / React 19, PostgreSQL, PayPal Orders v2 and Payments v2 REST APIs (sandbox), and Gemini through `@google/genai`. Hosted on Render: https://pact-web-h9pp.onrender.com

PayPal usage:
- An Orders v2 `CAPTURE` checkout per payment obligation, with a stable `PayPal-Request-Id` for each durable operation.
- Server-side capture after re-reading the order (amount, reference, payee).
- Independent retrieval of captures and refunds.
- Merchant-reviewed partial refunds.
- Verified webhooks (`verify-webhook-signature`), deduplicated by event ID.

AI usage: Gemini (`gemini-3.7-flash`, falling back to `gemini-3.5-flash`) classifies each message's intent and proposes field changes as JSON. Every proposal is validated:
- Quotes must be literal spans of the message.
- Fields and catalog items must exist.
- Old values must match the current agreement.

A deterministic baseline runs if the model is unavailable. Model output can only create proposal records.

## Verified (2026-10-22)

- PayPal sandbox, driven through the UI with a sandbox buyer: $300 deposit captured; amendment approved and $100 top-up captured; work released; $10 partial refund completed. Each provider resource was re-read independently. Three real webhook deliveries (order approved, capture completed, capture refunded) were signature-verified and processed once each.
- Hosted on Render: a sandbox deposit capture plus webhook, and a partial refund plus webhook, verified on https://pact-web-h9pp.onrender.com (2026-10-22).
- Automated tests: unit plus PostgreSQL integration tests (83 at the time of writing). They cover duplicate payments, lost provider responses, payment after a revision was replaced, forged webhooks, stale approvals, concurrent edits, cross-tenant access, attachments, and the model being unavailable. Failure injection uses an in-memory PayPal test double.
- AI evaluation (`reports/ai-eval-latest.json`, synthetic): deterministic baseline 12/12 on dev cases (which it was written against) and 20/32 intent on held-out cases, with field recall 6/20 and precision 6/8. TODO: model numbers. The model run is blocked by the free-tier Gemini quota (all calls returned HTTP 429 on 2026-10-22).

## Limitations (state them plainly)

- A prototype in the PayPal sandbox only; no real money and no production merchants.
- Synthetic demo data. No user interviews or real historical cases yet, so there are no claims about time saved or demand.
- The AI evaluation is small and synthetic. The deterministic baseline does not generalize well to the held-out cases.
- Attachments are stored in PostgreSQL. Customer identity is a review-link session, not a verified signature.
- TODO: hosting tier and any known issues at submission.

## Testing instructions template

Put credentials **only** in Devpost's private testing-instructions field, never in the repository.

1. Open https://pact-web-h9pp.onrender.com/demo and click **Create my demo workspace**. You are signed in as the business owner of a private synthetic workspace.
2. Open a customer link in a private window. Approve, then pay with the PayPal sandbox buyer: email TODO, password TODO. Always log in on PayPal's page; never enter a real card.
3. Back in the workspace, paste `Make ten of those hoodies instead. Use the attached logo on everything.` (optionally attach an image), resolve sizes, publish, approve as the customer, and pay the top-up.
4. Release work and open the job sheet. Try a refund from Payments.

## Video (under 3 minutes)

Follow the storyboard in [10-demo-submission.md](10-demo-submission.md). Show real sandbox screens, and do not disguise test-double behavior as PayPal.
