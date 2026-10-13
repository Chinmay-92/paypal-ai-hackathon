# Stress test: every idea, one set of kill criteria (13 Oct 2026)

**Objective:** win the PayPal AI Hackathon, and pick an idea now that won't need a pivot later.
**Inputs:** [`research.md`](research.md), [`brainstorm.md`](brainstorm.md), plus three verification passes run today. The three passes covered the official rules and judging, PayPal's official technical docs and specs, and a competitor scan.

## 1. What the rules actually reward

- **Stage 1 is pass/fail:** does the project fit the theme and reasonably use PayPal APIs/SDKs?
- **Stage 2 has five equally weighted criteria:** Implementation, Design, Impact, Innovation, Presentation.
  - **Ties are broken in that order, so Implementation counts first.**
  - Judging may include "automated AI-driven analysis", which makes the README and repo quality matter.
- **Prizes:**
  - Grand: $12k / $8k / $5k.
  - Honorable mentions, $5k each: Most Creative, Most Impactful, Best Demo Delivery, **Best Use of PayPal + AI**, **Best Use of Agentic Commerce**.
  - Sponsor prizes: **AG Grid** has the largest pool (about $10k across 5 winners), plus APIMatic, Bryntum, Channel3 and Render.
  - Max win per project: **one Grand or Honorable Mention plus one Sponsor prize**.
- **Who judges:** 6 PayPal judges, mostly **developer advocates**, plus sponsor judges. They will reward deep, real PayPal API use.
- **Judges get no API keys.** A **hosted demo that works until Dec 15** is effectively mandatory. Provide sandbox buyer logins.
- **Eligibility and IP:** India is eligible and team size is unlimited. Repo must be public with a visible OSS licence. No third-party trademarks or copyrighted material without permission.
- **Gallery not yet published.** The PayPal/Devpost staff answer to "what should we build?" pointed at **Agentic Commerce** and **PayPal + AI**, so expect the agentic theme to be the most crowded.
- **2025 Dev Days winners:** an AI paywall agent, a JS SDK v6 Shopware upgrade, and a PYUSD social trading app. All were working, PayPal-native integrations.

## 2. Verified PayPal capabilities that decide feasibility

| Capability | Status | Consequence |
|---|---|---|
| Agent Toolkit v1.11 (~46 tools), sandbox default, remote MCP `mcp.sandbox.paypal.com` | Verified | Gives credit with judges for "PayPal + AI". Works with Claude via MCP, plus OpenAI Agents SDK, Vercel AI SDK and LangChain. |
| `create_refund` / `get_refund` tools | Verified | The tool reuses one fixed `PayPal-Request-Id` per client. **Wrap refunds in our own REST call** to get per-action idempotency (45-day replay window). |
| Dispute tools in toolkit | Only list / get / accept_claim | `make-offer`, `provide-evidence`, `send-message` must be our own REST tools. |
| Disputes `make-offer` (REFUND / REFUND_WITH_RETURN / REFUND_WITH_REPLACEMENT) | In spec. **Sandbox behaviour unverified** | INQUIRY stage only. Partial offer needs buyer acceptance (accept/deny-offer has sandbox examples). **Day-1 spike.** |
| Sandbox dispute creation | UI: yes (buyer sandbox account). API: **gated by account manager** | Seed demo disputes manually through buyer login. Can't automate creation. |
| `provide-evidence` + sandbox `require-evidence` / `adjudicate` | Verified | A full dispute lifecycle is demoable in sandbox. |
| Authorize + multiple partial captures | Spec yes. **Partial capture must be enabled on the account**. Sandbox default unverified | Fallback: two separate orders, or an Invoice. |
| Invoicing (~20 toolkit tools) | Verified tools. A forum report says sandbox MCP `create_invoice` returns "Unsupported cache mode" | Don't rely on the MCP invoice path without testing. REST fallback. |
| Payouts | No toolkit tool. **India accounts receive only** | Use US sandbox accounts. Avoid payouts as a core feature. |
| Agent Ready / Store Sync / ACP | Exist, access by form, no sandbox self-serve | Mention only. Not buildable. |
| PayPal "mandates" / AP2 | None | A mandate layer would be ours to build. |
| Transaction Search | Up to **3 h lag**, needs reporting scope | Live demos built on reporting are fragile. |
| Webhook simulator | Mock events, can't be verified | Use real sandbox events for the demo. |

## 3. Kill criteria

An idea is **killed** if any of these is true:

- **K1** The core mechanic is already shipped by an incumbent, so Innovation is capped.
- **K2** The core value depends on a PayPal capability that is gated or unavailable in sandbox.
- **K3** The demo can't show real money moving through PayPal within 3 minutes.
- **K4** AI is decorative, i.e. rules alone would do it.
- **K5** It can't be built solidly in about 25 days.
- **K6** It's the obvious idea many of the 13,454 entrants will build.

## 4. Brainstorm and research briefs

| Idea | Competitors found | Gates / feasibility | Verdict |
|---|---|---|---|
| **Settle, consumer pre-dispute "keep it + partial refund"** | **Marketing Science, Sept 2026:** multi-agent returnless partial refunds, 853k-customer field experiment, ~41% optimal refund ratio. **Gorgias AI Agent + Vision** does partial refunds from photos under merchant rules. Loop, Claimlane, Amazon Returnless | All feasible | **KILLED as primary (K1).** Any judge who knows Gorgias sees parity. Useful only as *evidence* that the mechanic works. |
| **Settle, PayPal dispute-stage negotiation** (make-offer in INQUIRY) | Nothing PayPal-native found. IETF draft for an agent dispute protocol. PolicyLayer gates toolkit tools | **make-offer in sandbox unverified (K2 risk).** Dispute seeding manual | **Alive as a component**, not a product. Too thin and fragile to carry a whole entry alone. |
| **B2B sample/order spec-QC agent** | Alibaba **Accio** negotiates, but humans pay. Pietra and Sourcy coordinate samples, but QC is by people. Escrow.com milestones has no AI. **Nobody found closes spec → vision QC → PayPal release** | Deposit + balance feasible (two orders, or partial capture if enabled). Disputes evidence feasible | **Survives — strongest whitespace.** Risks listed in §6. |
| Contractor pay-on-acceptance (brief C) | Boundly, ScopeAuditor (AI scope creep). Upwork escrow. Kroxy, Docket Arbiter, TrustEscrow (AI-verified escrow, a hackathon cliché). Literally a PayPal inspiration example | Feasible | **KILLED (K1, K6).** |
| WooCommerce payment-exception agent (brief B) | PaidRadar (Aug 2026, free) already re-queries PayPal and auto-completes orders. Web Plura, Payment Status Doctor | Feasible | **KILLED (K1, K4).** The deterministic core is free and the AI layer adds little. Weak impact story. |
| Agent spending mandates layer | **PolicyLayer** sits in front of the PayPal Agent Toolkit MCP. AP2, Nekuda ($5M), Payman, Skyfire, Visa / Mastercard agentic tokens | Feasible | **KILLED as product (K1).** Keep it as a *component* (value and semantic limits) inside the chosen idea. |
| Residual reconciliation (research brief A) | A2X, Synder, Digits, Truewind, Booke, QRecon | 3 h reporting lag. Sandbox lacks FX/reserve history, so synthetic data is needed | **KILLED for hackathon (K3).** Best *business* lead, worst demo. |
| Subscription cancellation parity (P2) | Native PayPal / WooCommerce / PMPro controls, Churnkey | Feasible | **KILLED (K4).** Deterministic polling solves it. |
| Marketplace plugins (Temu / Alibaba / AliExpress) | n/a | Marketplace controls refunds. No dispute APIs. Terms-of-service and trademark risk. No sandbox | **KILLED (K2).** Plugin *architecture* survives as future adapters. |

## 5. Research problem inventory (P1–P13)

| # | Problem | Verdict | Reason |
|---|---|---|---|
| P1 | Paid but order stuck pending | Kill | PaidRadar (K1) |
| P2 | Cancelled but still charged | Kill | Rules suffice (K4) |
| P3 | Store refund fails | Kill | Plugin bug, not a product (K4) |
| P4 | Misleading refund totals | Kill | Upstream patch (K4) |
| P5 | FX posting failures | Kill | Synder / A2X, weak demo (K1, K3) |
| P6 | Duplicate accounting feeds | Kill | Deterministic dedupe (K4) |
| P7 | Bespoke work chargeback | Kill as standalone | Crowded (K1, K6). Its evidence lesson feeds the B2B idea |
| P8 | Deposit / scope disagreement | **Absorbed** | Spec-lock + deposit is the B2B idea's core |
| P9 | Local service, no tracking | Kill | AI adds little, policy-limited (K4) |
| P10 | Uneconomic cross-border returns | Kill as primary | Gorgias and the Marketing Science paper cover it (K1) |
| P11 | Marketplace can't pay sellers | Kill | Permissions and liquidity, not AI (K2) |
| P12 | Checkout accessibility | Kill | Provider-controlled, AI layer obscures (K4) |
| P13 | Agent approval provenance | **Absorbed** | Mandate component inside the B2B idea |

## 6. Survivor deep stress test: B2B spec-locked trade agent (working name **SpecLock**)

### The flow (realistic B2B terms: 30% deposit, 70% after pre-shipment inspection)

1. **Agree the spec.** The buyer and supplier agents negotiate in chat and documents. The AI extracts a **structured spec**: material, colour (Pantone), print, dimensions with tolerances, count, packaging. Every field cites its source message. Both humans approve; the spec is hashed and versioned.
2. **Pay the deposit.** A real sandbox PayPal order captures the 30% deposit.
3. **Pre-shipment QC.**
   - The buyer's agent issues a **photo challenge**: random unit numbers and specific angles, plus a one-time code written on paper and shown in frame. This defeats "photos of a golden sample".
   - The supplier uploads the photos. Vision checks each spec field, citing evidence, with three outcomes: **pass**, **fail**, or **can't verify from photo → human**.
4. **Release or remedy.**
   - Pass → the buyer's **mandate** auto-releases the 70% balance (second PayPal order), within limits the buyer set.
   - Fail → the supplier's agent proposes a remedy within *its* mandate (re-make, discount via partial refund of the deposit). Code checks every offer; a human approves anything over the limit.
5. **After delivery.** If goods arrive off-spec, the buyer side opens a PayPal dispute with the **locked spec + QC record as evidence** (`provide-evidence`). The supplier side answers with `make-offer`. This step is a stretch goal, gated on the day-1 spike.

### Attacks and answers

| Attack | Severity | Answer / mitigation |
|---|---|---|
| "Alibaba's Accio already does this" | High | Accio negotiates and stops before money and QC ("humans handle POs and payment"). SpecLock is the part *after* the handshake: spec → evidence → payment. Say it in the video. |
| "AI-verified escrow is a crypto-hackathon cliché" | High | It's not escrow: it uses PayPal deposit/balance/dispute rails. The novelty is **tolerance-based physical-goods QC with photo challenges** and **spec as dispute evidence**. Avoid the word "escrow". |
| Vision can't measure 2 mm tolerances | High | Scope QC to visually verifiable attributes (colour vs Pantone swatch in frame, print / logo placement, count, packaging, visible defects). Measurements need a ruler/caliper in frame, read by the model and marked "needs human" if unreadable. **Day-2 spike: 20 real product photos, measure accuracy.** If below ~85% on visual attributes, narrow the attribute set rather than pivot. |
| Supplier fakes photos / reuses golden sample | Medium | Photo challenge with one-time code + random unit numbers; EXIF/timestamp check; post-delivery dispute path. |
| Less relatable than a €23 bike light | Medium | Open with a concrete story: a small brand pays a $3,000 deposit for 1,000 custom tote bags and gets the wrong colour and logo size. Cite the Alibaba seller blog: custom-order PayPal coverage is weak without documented specs. |
| Partial capture not enabled in sandbox | Low | Use two orders (deposit order + balance order). Same demo, no gate. |
| `make-offer` fails in sandbox | Low (stretch only) | Core flow doesn't depend on it. Fall back to `provide-evidence` + `adjudicate` (verified) or a partial refund. |
| Judges have no keys | Medium | Hosted demo on our sandbox creds, with sandbox buyer/supplier logins in the submission. Must stay up until Dec 15. |
| Indian developer account limits | Low | US sandbox business + personal accounts. No payouts in the core flow. |
| Two-sided demo is heavy for 25 days | Medium | One app, two role views, same backend. The supplier side can be mostly scripted except for the photo upload and offer. |

### Prize targets

- **Grand prize**.
- **Best Use of Agentic Commerce** (agent-to-agent negotiation that actually transacts).
- Sponsor: **AG Grid**. A QC / spec grid with pass/fail per field and order ledger is a natural fit, cheap to add, and the biggest sponsor pool.

## 7. Day-1/2 spikes: decide now what each result means, so nothing forces a pivot

| Spike | Pass → | Fail → (still the same product) |
|---|---|---|
| Sandbox: two orders captured + partial refund with own `PayPal-Request-Id` | Core money flow confirmed | Blocker. Debug; this is basic REST and should pass |
| Partial capture on auth | Use authorize + partial capture | Use two orders |
| Remote sandbox MCP with Claude (get_order, create_refund) | Agents use toolkit for reads | Use toolkit as local library or plain REST |
| Dispute created via sandbox buyer UI → `make-offer` → buyer accept | Post-delivery act included | Use `provide-evidence` + `adjudicate`, or drop act 5 |
| Vision QC on 20 real product photos vs a written spec | Keep attribute set | Narrow attributes; add "needs human" path |

**Decision:** SpecLock is the primary entry. Consumer Settle is retired as a product. Its negotiation and mandate engine is reused as SpecLock's remedy step.
