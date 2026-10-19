# Pact

**Changes agreed. Work aligned.**

Pact is a responsive web application for businesses selling custom goods and project services. It turns customer amendment requests into reviewed revisions, explicit approvals, correct PayPal payments, and current fulfillment instructions.

**Status: product and implementation blueprint. This branch does not contain a runnable Pact application.** All proposed behavior and acceptance criteria below are requirements, not claims of completed functionality or proven demand.

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

Target stack: TypeScript, React/Next.js, PostgreSQL, private attachment storage, one model provider, PayPal sandbox and Render hosting. Exact dependency versions are selected and locked during implementation. APIMatic/Postman may help development; other sponsors are outside the committed scope.

## Repository checks available now

```sh
python3 scripts/check_pact_docs.py
```

This checks blueprint links and synthetic fixture invariants. It is not an application test. Application install/run commands must be added when the implementation exists.

## Hackathon

[Official event](https://paypalaihackathon.devpost.com/) · [Rules](https://paypalaihackathon.devpost.com/rules)

Deadline: **November 13, 2026, 01:30 IST** (November 12, 12:00 PST). Runnable build, meaningful PayPal sandbox + AI, public licensed repository, and public YouTube demo under three minutes are required. Keep judge access functional through the stated judging period; see submission notes.

## Historical research

Earlier concepts remain historical and do not define current Pact requirements: [brainstorm](docs/brainstorm.md), [research](docs/research.md), [general stress test](docs/stress-test.md), [ClaimIt](docs/stress-test-claimit.md), [SpecLock](docs/stress-test-speclock.md).

Code and original documentation are MIT licensed; third-party materials retain their own rights. Pact is a working name selected by the project owner, not a trademark-cleared brand.
