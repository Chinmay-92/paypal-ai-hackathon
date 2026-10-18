# Stress test: SpecLock (18 Oct 2026)

**Idea:** a small brand ordering custom goods from an overseas supplier, with agents on both sides.
- Buyer and supplier agents lock a structured spec, with every field cited to its source.
- The buyer authorizes the order through PayPal; 30% is captured as a deposit.
- Before shipment, the buyer's agent issues a **photo challenge** and the supplier answers it.
- Each spec field is checked: **pass / fail / can't verify → human**.
- An all-pass releases the 70% balance under the buyer's preset limits.
- A fail starts a remedy the supplier's agent negotiates within its own limits.
- If the goods arrive wrong anyway, the locked spec and QC record become PayPal dispute evidence.

Deepens §6 of [`stress-test.md`](stress-test.md). Same kill criteria (K1–K6). Desk research plus official-spec verification. **Nothing has been executed in sandbox yet.**

## 1. Competitors (new, beyond Accio / Pietra / Sourcy / Escrow.com / QIMA / Inspectorio / crypto escrow)

| Name | What it does | AI? | Closeness (0–5) |
|---|---|---|---|
| **PayKeeper AI Verification** ([site](https://paykeeper.com/ai-verifications-for-fund-control/)) | Computer vision checks contractor photos against spec **before releasing construction-loan draws** | Yes | **4.** Same mechanism, different domain. Strongest prior art. Vendor claims only. |
| **Tazapay** Escrow-as-a-Service | Cross-border B2B escrow with milestones, released on conditions (e.g. shipping docs). Asia focus, Standard Chartered partner | No | 3.5. Same payment shape. |
| **Alibaba Trade Assurance + Inspection add-on** | Escrowed order + **human** pre-shipment inspection (~$300). No AI photo QC found | No | 3.5. The incumbent judges will name. |
| QIMAone supplier self-inspection app | Supplier-run inspection, blur detection, GPS-tagged photo reports. No AI spec verdict confirmed | Partial | 3 |
| [Receipt](https://github.com/mimisco-git/receipt) (hackathon, Jun 2026) | Agent scores a delivery against the brief: ≥75 auto-release, <40 freeze. **Digital work only** | Yes | 3. Same release rule, no vision. |
| KeyBS Verify AI + Trade Escrow | AI supplier vetting + escrow released on delivery | Yes | 2.5 |
| Optioryx / Elevenais | Phone-photo AI checks against client criteria; cargo/QC reports | Yes | 2.5 |
| TrustArc AI Escrow (lablab) | LLM checks digital work vs scope → releases USDC | Yes | 2.5 |
| Truepic Lens | Signed (C2PA) photo provenance at capture | Yes | 2. A building block, not a competitor. |
| Genpire / Style3D / Onbrand | AI tech-pack/spec generation | Yes | 2. Covers the spec half only. |
| V-Trust / HQTS / SGS | Human pre-shipment inspection, $220–382 per man-day | No | 2 |

**Verdict:**
- **Crowded:** milestone escrow, AI tech packs, human inspection, and AI-judged release for *digital* work (several 2026 hackathon entries).
- **Still novel, all together:**
  1. A per-field vision verdict on supplier photos that releases a **physical-goods** balance.
  2. The photo challenge: random unit and carton IDs plus a one-time code, i.e. liveness.
  3. A **can't-verify** route instead of a forced verdict.
  4. The locked spec + QC record reused as PayPal dispute evidence.
  5. Agent-negotiated remedy inside limits.

**Pitch line:** PayKeeper-style evidence-gated release, for small-brand sourcing, on PayPal rails.

## 2. Pain evidence

- **PayPal's own policy leaves a gap.** US buyer protection lists as ineligible "Significantly Not as Described claims for wholly or partly custom-made items". Seller protection also excludes SNAD ([legalhub](https://www.paypal.com/us/legalhub/paypal/buyer-protection)). **For custom goods, the quality gate has to come before the money, and SpecLock is that gate.** This is the strongest line for PayPal judges.
- **Inspection cost:** $220–382 per man-day (HQTS $220, V-Trust/HKTDC ~$268, SGS ~$382). On a $5k first order, that is **5–8% of order value** just to inspect.
- **Sample vs bulk mismatch** is the known pattern: hand-finished samples, substituted materials in bulk. The standard advice is "detailed spec + inspection before balance", i.e. SpecLock done manually ([Fulfillbot](https://fulfillbot.com/blog/why-is-my-alibaba-bulk-order-different-from-the-sample/)).
- **Illustrative story** (single unverified Trustpilot review of a supplier): ordered Pantone 540C, received 286C. SGS reported "color: FAIL"; a $6,387 deposit was lost on a second order and the Alibaba dispute refunded $0. Use it as a *shape* for the video story, with an invented brand, not as a citation.
- **Failure rates:** QIMA reported ~19.5% of goods outside acceptable quality limits (Q2 2018). Newer barometer figures weren't retrieved, so don't quote 2025 numbers.

## 3. Can vision actually verify the spec? (the riskiest assumption)

Published benchmarks say **no for an LLM alone** on colour, measurement and dense counting:

| Task | Evidence | Implication |
|---|---|---|
| Defect detection | MMAD (ICLR 2025): GPT-4o 74.9%, Gemini 1.5 Pro 73%, "far short of industrial requirements" | Only gross visible defects. Everything else → human. |
| Colour | ColorBench (NeurIPS 2025): VLMs far below humans. Small test: GPT-4o 49/77 colour prompts. Lighting and white balance dominate | **Never let the LLM judge Pantone by eye.** |
| Counting | Reliable below ~10–20 objects. CountQA best model 42.9% on dense scenes | Count per carton layer, or cross-check by carton weight. |
| Rulers / measurement | InSituMeasure (very recent preprint, unverified): best of 24 models 25.7% | LLMs can't read ±mm tolerances. |

**Design consequence: hybrid QC.** The LLM orchestrates and judges presence and placement; deterministic computer vision does the numbers.

| Tier | Attributes | Method |
|---|---|---|
| **LLM / OCR, high confidence** | Logo or print present and matches the artwork file; placement within ±10% of the zone; packaging type; label/barcode text; gross visible defects; colour *family*; correct unit ID; one-time code present | Vision model + OCR, cited per field |
| **Deterministic CV with calibration aid** | Pantone **ΔE** using a colour reference card in frame (Pantone Color Match Card ~$15, verify price) to white-balance; dimensions via a printed **ArUco/fiducial grid**; count per carton layer | OpenCV, numbers computed in code |
| **Always "can't verify" → human** | Material composition, GSM/weight, durability, odour, function, tolerances under 2 mm | Explicitly listed in the spec as human-checked |

This is the most important design decision. It turns the weakest point, judges citing VLM benchmarks, into a demonstrated strength: the AI knows what it cannot verify.

## 4. Money flow (verified against official specs; sandbox behaviour unverified)

| Capability | Status | Consequence |
|---|---|---|
| Orders `intent: AUTHORIZE` → capture 30% with `final_capture:false` → capture 70% with `final_capture:true` | Verified in spec ("Partial captures are supported during a single authorization period") | **Primary demo flow.** One buyer approval = the mandate. |
| Partial capture must be enabled on the account | Verified requirement (`AUTH_CAPTURE_NOT_ENABLED`). Sandbox default **unverified** | Day-1 spike #1. |
| Authorization lifetime: **29 days**, 3-day honor period, reauthorize ≤115% / +$75 | Verified | Fine for the demo. Too short for real production lead times, so be honest about it. |
| **Vault** PayPal wallet (`store_in_vault: ON_SUCCESS`, `usage_type: MERCHANT`) → merchant-initiated balance charge with `vault_id` | Documented. Needs the Vault setting in the app. Reference transactions need approval. Sandbox approval **unverified** | **Production story** that removes the 29-day limit. Day-1 spike #2. |
| Invoicing partial payments (`allow_partial_payment`) | Verified, but the buyer pays each part manually | **Not suitable** for automatic release. |
| Partial refund for remedies + idempotent replay (same `PayPal-Request-Id` → 200) | Verified (spec example). Orders keys kept 6 h | Remedy discount after capture. |
| Different payee per order (`payee.email_address` / `merchant_id`) | Mechanism verified. Refund/capture rights for a payee who isn't the API caller **unverified** | Hackathon: supplier = our sandbox merchant. Multiparty is future work (needs partner onboarding). |
| Dispute evidence: multipart `evidence-file`, jpg/png/gif/pdf, <10 MB/file, 50 MB/call; types PHOTOS_OF_SHIPPED_ITEM, COPY_OF_CONTRACT, PROOF_OF_FULFILLMENT, ITEM_DESCRIPTION, OTHER | Verified | The QC record and spec PDF upload as evidence. |
| `make-offer` (INQUIRY only; partial refund needs buyer acceptance); sandbox `require-evidence` / `adjudicate` (UNDER_REVIEW) | Verified in spec. Reaching UNDER_REVIEW from the buyer UI **unverified** | Post-delivery act is a stretch goal. **Caveat:** SNAD on custom goods is ineligible for protection, so frame the dispute act as "evidence on file", not "guaranteed win". |
| Agent Toolkit | Has orders (create_order hard-codes `intent: CAPTURE`), `pay_order`, refunds, disputes read/accept, tracking. **Missing:** authorize, capture-of-authorization, reauthorize, void, vault, provide-evidence, make-offer. Issue #98: no per-call `PayPal-Request-Id` | Build these as our own agent tools on REST. Use the toolkit for reads, refunds and tracking. |
| Webhooks: PAYMENT.AUTHORIZATION.*, PAYMENT.CAPTURE.*, CUSTOMER.DISPUTE.*, VAULT.PAYMENT-TOKEN.CREATED | Event names verified. Sandbox delivery unverified | Subscribe on the sandbox app. |

## 5. Kill-criteria results

| Criterion | Result | Notes |
|---|---|---|
| K1 already shipped | **Pass (narrowly)** | Pieces exist (PayKeeper in construction, Tazapay escrow, human inspection). The full physical-goods loop on PayPal was not found. |
| K2 PayPal gated | **Pass, with spikes** | Authorize/partial capture is standard but needs an account setting. Vault is documented. Disputes are optional. |
| K3 live money in demo | Pass | Authorization, two captures and a partial refund, all real sandbox calls. |
| K4 AI decorative | Pass | Spec extraction with citations, photo-challenge generation, per-field visual verdicts, remedy negotiation. Honest about what goes to deterministic CV. |
| K5 buildable in ~25 days | **Risk, the main one** | Two roles, agents, vision + OpenCV calibration, authorize/capture and remedies. Needs strict scope (see §7). |
| K6 obvious idea | Pass | Unlike "AI shopping agent", "pay contractor on completion" and "split bill", this is not one of PayPal's inspiration examples. |

## 6. Judge objections and answers

| Objection | Answer |
|---|---|
| "The supplier photographs the golden sample, not the bulk." | Random unit/carton IDs chosen at challenge time, a one-time code in frame, in-app capture with timestamp (C2PA signing as an upgrade), and a wide shot of stacked cartons. Be honest: this **raises the cost** of fraud, it doesn't eliminate it. An optional human inspection upgrade covers high-value orders. |
| "VLMs fail at colour and measurement." | Agreed, and the design reflects that: ΔE and dimensions are computed deterministically from calibration targets. The LLM judges presence and placement only. Only an all-pass under the buyer's limit auto-releases. |
| "PayPal isn't escrow; authorizations last 29 days." | The demo uses authorize/partial capture inside 29 days. Production uses vault + merchant-initiated balance charge, so nothing is held. Never call it escrow. |
| "Alibaba Trade Assurance already does this." | Trade Assurance plus a *human* inspector costs ~$300/day and takes days to schedule. SpecLock does the first pass in minutes from supplier photos and routes only can't-verify fields to humans. And PayPal itself excludes SNAD for custom goods, so the gate must come before payment. |
| "Isn't this just PayKeeper?" | Same principle, different domain and rails. Cite it as validation that evidence-gated release works. |

## 7. Scope that fits 25 days

**Must ship:**
1. Spec lock from a pasted brief and chat, with citations, both parties approving and a hashed version.
2. Authorize 100% → capture the 30% deposit.
3. Photo challenge → supplier upload page (mobile web).
4. Hybrid QC on ~6 fields, including LLM logo/placement/defects/label OCR, ΔE colour with a reference card, and count per layer.
5. Release the 70% on all-pass, or a remedy offer within limits → partial capture or partial refund.
6. AG Grid QC board and audit trail.
7. Hosted demo with sandbox logins for judges.

**Stretch, only if by day 18:**
- Vault-based balance charge.
- Dispute act (make-offer / provide-evidence / adjudicate).
- C2PA signing.
- ArUco dimension check.

**Cut:**
- Real supplier onboarding.
- Multiparty payee.
- Multilingual negotiation beyond one demo language pair.

## 8. Scores (1–5, rough)

| Implementation | Design | Impact | Innovation | Presentation |
|---|---|---|---|---|
| **5** | 4 | **4.5** | **4** | 3.5 |

**Prize fit:** **Grand Prize**, **Best Use of Agentic Commerce**, **Most Impactful**. Sponsor: AG Grid.

## 9. Day-1/2 spikes (go/no-go by end of day 3)

1. AUTHORIZE → capture 30% (`final_capture:false`) → capture 70%. Watch for `AUTH_CAPTURE_NOT_ENABLED`.
2. Vault ON_SUCCESS → merchant-initiated order with `vault_id`. Watch for `NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE`.
3. Partial refund + replay of the same `PayPal-Request-Id`.
4. **Vision QC eval:** 20 real product photos (e.g. printed tote bags or mugs) with a reference card in frame, against a written spec. Measure LLM accuracy on tier-1 fields and ΔE stability across 3 lighting setups.
5. Webhooks received: CAPTURE.COMPLETED, AUTHORIZATION.CREATED.
6. Optional: sandbox buyer opens an SNAD dispute → time to reach the API / UNDER_REVIEW → make-offer and multipart evidence.

**Go/no-go:**
- If spike 1 **and** spike 2 both fail → use two orders, with the buyer re-approving the balance in a one-tap "release" step. Still SpecLock.
- If spike 4 gives <85% on tier-1 fields → shrink to the fields that pass. Still SpecLock.
- **Switch to ClaimIt only** if, by end of day 3, spike 4 shows tier-1 fields can't reach ~80% **and** no calibration helps. That's the one decision point. Decide it on evidence, not mood.

---

# Head-to-head: SpecLock vs ClaimIt

| | **SpecLock** | **ClaimIt** ([stress test](stress-test-claimit.md)) |
|---|---|---|
| Closest prior art | PayKeeper (other domain), Tazapay, human inspection | **CommentSold already does timer + waitlist + PayPal** |
| Innovation | **4** | 3 |
| Impact story | **PayPal itself excludes SNAD for custom goods**; inspection costs 5–8% of a small order | Joy miners and manual tallying; but PayPal is weak where "mine" selling is biggest |
| Implementation depth | **Authorize/partial capture, vault, refunds, dispute evidence, OpenCV** | Orders, refunds, tracking, Telegram |
| Riskiest assumption | Vision accuracy (mitigated with hybrid CV + can't-verify) | Judges see "CommentSold + GPT" |
| Build risk (K5) | **Higher** | Lower |
| Video appeal | Good (wrong-colour totes story) | **Best** (live chat chaos → order) |
| Inspiration-list overlap (K6) | None | Near "request money in chat" |
| Best prize shot | **Grand Prize / Agentic Commerce / Most Impactful** | Best Demo Delivery / PayPal + AI |

## Recommendation

**Build SpecLock.** It has the higher ceiling on the criteria that decide grand prizes (Innovation and Impact). Implementation is the tie-breaker, and SpecLock's goes deeper. It also comes with an argument PayPal judges can't dismiss: their own policy leaves custom goods unprotected.

Its main risk is build scope (K5), and that is controlled by §7 and one evidence-based decision point at the end of day 3. ClaimIt stays documented as the pre-agreed fallback, not a future pivot.
