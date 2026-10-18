# SpecLock — PayPal AI Hackathon

Buyer and supplier agents lock a structured spec, pay the deposit through PayPal, verify pre-shipment photos against the spec with vision QC, and release the balance or negotiate a remedy within limits each side has set. The spec and QC record serve as evidence if a PayPal dispute follows.

## How it works

1. **Spec lock.** Claude extracts a structured spec from the negotiation. Every field cites the message it came from, and citations are checked verbatim in code. Both parties approve the exact version (by hash).
2. **Authorize, capture the deposit.** The buyer authorizes the full order once through PayPal (`intent: AUTHORIZE`). Only the 30% deposit is captured (`final_capture: false`).
3. **Photo challenge.** The buyer agent asks for randomly chosen units and cartons, with a one-time code on paper in every frame.
4. **Hybrid QC.**
   - Claude judges only what photos show reliably: logo/print presence and placement, label text, packaging, gross defects.
   - Exact colour is computed in code: CIEDE2000 against the agreed target, white-balanced on a reference card's neutral patch.
   - Material, weight and fine tolerances always go to a human.
   - A verdict only counts if its photo carried the correct code.
5. **Release or remedy.**
   - All-pass within the buyer's limit → the balance is captured automatically.
   - Failures → the supplier agent proposes a remedy, and deterministic code checks it against both parties' limits.
   - An agreed discount is applied by capturing a smaller final amount.

Every PayPal call that moves money carries its own `PayPal-Request-Id`, so retries never double-capture.

## Run locally

```bash
cp .env.example .env.local   # add PayPal sandbox + Claude credentials
npm install
npm test                     # unit + workflow tests (no network)
npm run spike:paypal         # day-1 sandbox spike: authorize → partial captures → idempotent refund
npm run dev                  # http://localhost:3000
```

Sandbox setup:
1. Create a REST app at developer.paypal.com with a **US sandbox business** account as the merchant.
2. Pay with a sandbox **personal** account.
3. If capturing fails with `AUTH_CAPTURE_NOT_ENABLED`, partial capture isn't enabled for that merchant. The fallback is in the stress test.

## Status

| Area | State |
|---|---|
| Money math, CIEDE2000 colour check, mandates, photo challenge, PayPal client, deal workflow | Built, unit-tested with a fake PayPal API |
| Claude spec extraction, vision QC, remedy offers | Built; **not yet run against the live API** |
| PayPal sandbox | **Not yet run against the live sandbox** (`npm run spike:paypal`) |
| Storage | Local JSON files; needs a database before hosting |
| Auth | None: one browser plays both parties (demo only) |
| Stretch | AG Grid QC board, vault-based balance charge, dispute evidence, C2PA photo signing |

## Docs

- [SpecLock deep stress test + head-to-head vs ClaimIt (decision)](docs/stress-test-speclock.md)
- [ClaimIt stress test (pre-agreed fallback)](docs/stress-test-claimit.md)
- [Stress test of every earlier idea](docs/stress-test.md)
- [Brainstorm history](docs/brainstorm.md)
- [Background research](docs/research.md)

Hackathon: https://paypalaihackathon.devpost.com/ — deadline 12 Nov 2026, 12:00 PST.
