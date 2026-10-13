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

## Open question

Team size and strongest stack decide whether both agents are fully built or the buyer side is simulated with polish concentrated on the merchant agent.
