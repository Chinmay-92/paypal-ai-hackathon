# Brainstorm: PayPal AI Hackathon (13 Oct 2026)

**Goal:** win the hackathon (judged on implementation, design, impact, innovation, presentation; ~13,400 entrants; PayPal judges).
**Deadline:** 12 Nov 2026, 12:00 PST (13 Nov 01:30 IST).

## Reframe

The research in [`research.md`](research.md) asks "is this a business?". The hackathon asks "does this win in a <3 min video?". Residual reconciliation is the best business lead and the weakest demo.

PayPal's own inspiration list leads with agents that *"actually transact — not just recommend"*, including agent-to-agent negotiation and settlement. The research's most valuable transferable asset is its design principle:

> The model interprets → deterministic code validates money → a human-set policy authorizes → re-fetch PayPal state to verify closure.

## Candidates considered (ranked for winning)

1. **Agent-to-agent cross-border return settlement (P10) + mandates (P13)** — chosen.
2. Pay-on-acceptance for service milestones (brief C) — clearest LLM role, but literally a PayPal inspiration example; will be crowded.
3. WooCommerce payment-exception agent (brief B) — safest build, reads as ops tooling; PaidRadar covers the simple case.
4. Agent spending mandates alone (P13) — PayPal-relevant but infrastructure, hard to make visual. Folded into #1.

## Chosen concept: Settle

Bounded agent autonomy over real money: agents negotiate inside a human-signed mandate that code enforces.

- **Merchant agent** operates under a plain-English mandate compiled into enforced rules, e.g. "partial refund up to 40%, no return, if item value < 1.5× return shipping; photo evidence required; escalate otherwise."
- **Buyer agent** submits photos and a complaint in any language, plus the desired outcome.
- **Vision model** compares photos to the listing and cites evidence ("listing: GoPro mount; photo: strap mount").
- **Negotiation** — every offer is checked against the mandate deterministically; the model never decides the amount on its own authority.
- **Real sandbox partial refund** via Payments v2 captures/refund; re-fetch capture to verify refundable balance; replay is idempotent.

### Judging fit

| Criterion | Proof point |
|---|---|
| Implementation | Real Orders/capture/partial refund, idempotency, mandate enforcement, post-action verification |
| Design | Split buyer/merchant UI with live negotiation transcript |
| Impact | Merchant avoids shipping + dispute + chargeback fee; buyer paid in minutes; one fewer return shipment (CO₂) |
| Innovation | Bounded agent autonomy over money, PayPal's own A2A example with the safety layer most entries skip |
| Presentation | "€23 item, €60 return shipping" is understood in five seconds |

### Risks and mitigations

- **"Fraud machine"** — demo a rejected claim (photo mismatches ordered product / history triggers escalation). A visible "no" builds trust.
- **"Why would merchants refund?"** — show the math: €60 return + €20 dispute fee + lost item vs. €9 partial refund.
- **Disputes API** — sandbox disputes need extra setup/permissions. Core flow is *pre-dispute* settlement via Payments v2. Disputes "make offer" is a stretch goal only if working by day 10.
- **Agent Toolkit / MCP** — use for agent read tools (credit with judges); keep the money-moving call behind mandate-checking code. Verify exposed tools on day 1.

### Riskiest assumption

Judges see "keep it + partial refund" as fair to merchants, not a giveaway. The mandate and the visible rejection are the defense — build them first.

## 3-minute video

- 0:00–0:20 — €23 bike light, €60 return shipping; today: dispute or write-off.
- 0:20–0:40 — merchant writes mandate in plain English → enforced rules.
- 0:40–1:30 — buyer agent files claim in German with photos; vision cites mismatch; agents negotiate; an over-limit offer is blocked by the mandate.
- 1:30–2:10 — real sandbox refund: capture ID, re-fetched balance, replay = no-op.
- 2:10–2:40 — fraudulent claim rejected and escalated to a human.
- 2:40–3:00 — savings math + avoided shipment CO₂.

## Feasibility: agentic plugins for Alibaba, Temu, AliExpress and similar marketplaces

Checked 13 Oct 2026. Desk research only, with no API access tested.

### What we found

- **Alibaba.com B2B + PayPal** ([seller blog](https://seller.alibaba.com/blogs/2026/southeast-asia/apparel-accessories/paypal-payment-buyer-protection-guide-alibaba-b2b)): the post recommends PayPal for **sample orders under $500** and a **30% PayPal deposit** on orders of $5,000 or more, with the rest via Trade Assurance or wire. It says PayPal coverage is weak for **subjective quality disputes on custom orders** and advises documenting specs with photos and written confirmation before production. It quotes an effective cost of 7–10% including FX, but its fee figures don't agree with each other. Treat it as seller marketing, not policy. It also never says who receives PayPal funds or who is merchant of record.
- **Alibaba Trade Assurance:** disputes run inside Alibaba's own escrow and case process. Buyers can escalate from day 4, and cases escalate automatically on day 31. We found no public developer API for buyer disputes or Trade Assurance.
- **Temu:** partner APIs reportedly exist for after-sales (`bg.aftersales.*`), but one integration guide says **sellers cannot initiate refunds or cancellations**. Refunds start with the customer and are controlled by the platform. API access reportedly needs about 30 days of selling history. None of this is verified against partner.temu.com.
- **AliExpress:** we found no public seller dispute or refund API. Buyer communities warn that **a seller offering a PayPal refund outside AliExpress is a known scam pattern**: the buyer closes the platform dispute, the seller files a chargeback later, and the buyer loses platform protection.
- **Terms of service:** we couldn't confirm Temu's rules on automated access. Assume browser automation on these marketplaces is restricted until their terms are read.

### Verdict

| Plugin type | Feasible for the hackathon? | Why |
|---|---|---|
| Seller-side agent on Temu, AliExpress or Alibaba that issues PayPal refunds | **No** | The marketplace, not the seller, controls the PayPal payment and the refund. Temu sellers reportedly can't refund at all. That would leave nothing for our PayPal integration to do. |
| Buyer-side browser extension that automates marketplace dispute forms | **No (risky)** | It probably breaks the marketplaces' terms, can't use the PayPal sandbox against real orders, and filing disputes through PayPal's API needs buyer scopes and consent. |
| Live integration with any of these marketplaces in sandbox | **No** | The hackathon requires PayPal sandbox; real marketplace orders can't run against it. |
| A **pluggable settlement core** with platform adapters, demoed on a merchant that owns its PayPal payment (independent store or B2B supplier) | **Yes** | The mandate engine, vision evidence check and Payments v2 refund all run on our own sandbox merchant. Marketplace adapters become future work that needs partner API access. |

**Design rule this adds:** the agent must **never move a settlement outside the platform** where the buyer is protected. That is exactly the AliExpress scam pattern, so it becomes a hard rule in the mandate engine and a talking point in the video.

**Branding:** don't use Alibaba, Temu or AliExpress names, logos or UI clones in the demo or video. The rules require permission to use third-party marks. Use a generic "cross-border marketplace" storefront.

### New candidate inspired by the Alibaba post: B2B sample-order agent

PayPal is the recommended method for **B2B samples and deposits**, and **unclear specs** are the documented cause of failed quality disputes. That points to a B2B variant of Settle:

1. The buyer's agent and the supplier's agent negotiate a sample order. The AI extracts a **structured spec** (material, dimensions, tolerances, finish) from the chat and the documents, and both sides acknowledge it.
2. A real sandbox PayPal payment is made for the sample or the 30% deposit.
3. The supplier uploads photos of the sample. A vision model checks them **against the acknowledged spec, with citations**, and flags anything outside tolerance.
4. If the sample passes, a second PayPal order pays the balance. If it fails, the mandate engine proposes a partial refund or a re-make, and the buyer approves.

| | Consumer Settle (current) | B2B sample-order agent |
|---|---|---|
| Story | €23 light, €60 return shipping. Emotional, instant. | $500 sample, $15k order at stake. Higher stakes, B2B. |
| AI role | Photo vs listing, multilingual claim | Spec extraction + photo vs spec. Stronger, more technical. |
| PayPal | Capture + partial refund | Deposit + balance captures + partial refund |
| Crowding | Moderate | Overlaps "pay on completion" entries, but the B2B spec focus is rarer |
| Risk | "Merchant giveaway" perception | Less relatable to a general audience |

**Recommendation:** keep consumer Settle as the main video story. Build the core as **mandate engine + evidence verifier + PayPal settlement, with platform adapters**. Ship the B2B sample-order flow as a second adapter only if the core is solid by about day 18. Two scenarios on one core show the plugin idea better than claiming Temu or Alibaba support.

## Open question

Team size and strongest stack decide whether both agents are fully built or the buyer side is simulated with polish concentrated on the merchant agent.
