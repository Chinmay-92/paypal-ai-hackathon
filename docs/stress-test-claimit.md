# Stress test: ClaimIt (18 Oct 2026)

**Idea:** an AI agent for sellers who run "drops" inside group chats.
- Buyers post messy, multilingual claims ("me! blue one M", "same as her but L", "2 pls").
- The agent works out who claimed what, and in what order, citing the exact message.
- It sends each buyer a PayPal payment link and runs a payment timer.
- Unpaid items go to the next person waiting; stock-outs are refunded automatically; tracking is uploaded to PayPal.
- The seller supervises everything from a live claims board.

Same kill criteria as [`stress-test.md`](stress-test.md) §3 (K1 already shipped, K2 PayPal gated, K3 no live money in demo, K4 AI decorative, K5 not buildable in time, K6 obvious idea).

Desk research plus official-spec verification only. Nothing has been executed in sandbox yet.

## 1. Competitors

| Name | What it does | AI? | Platforms | Closeness (0–5) |
|---|---|---|---|---|
| [CommentSold](https://try.commentsold.com/?p=16471) | "sold" comment → invoice. **Has cart-expiration timer, waitlist auto-cart, reminders. Supports PayPal.** ~$149–999/mo (pricing unverified) | No | FB, IG, own app, web | **4** |
| [SoldLive](https://apps.shopify.com/soldlive) | Product number comment → Shopify draft order + DM invoice, waitlist. $35–75/mo | No | FB, IG, TikTok live | 3.5 |
| [Page365](https://www.page365.ph/features/facebook-live-selling) (PH) | "MINE" comments → auto-invoice, stock decrement | Not stated | FB, IG | 3.5 |
| [Upmesh](https://www.g2.com/products/upmesh/reviews) (SG/MY/PH) | Product-code comments → cart link | Not documented | FB | 3.5 |
| [ULive.me](https://www.ulive.me/en/facebook-live-shopping) (MY) | Comment capture, auto-invoice, stock sync. 2,000+ sellers claimed. AI on roadmap | Roadmap | FB, IG | 3.5 |
| BigSeller / EasyStore | Keyword capture → Messenger checkout | No | FB, TikTok Shop | 3 |
| [Dibsly](https://apps.shopify.com/dibsly-live) | FB comment orders → Shopify checkout | No | FB | 3 |
| LiveOrder Pro (Chrome extension) | **Multilingual keyword rules (Filipino, Malay, Vietnamese), ranks the fastest claimer**, CSV export. No payments | Rules | TikTok, FB, YouTube | 3 |
| [Inbox2Order AI](https://lablab.ai/ai-hackathons/nativebuilder-build-without-limits/team-believer/inbox2order-ai) (hackathon, Aug 2026) | LLM turns messy WhatsApp/IG/SMS messages into orders. Payments "future" | Yes | Pasted text | 2.5 |
| [StreamPulse AI](https://devpost.com/software/streampulse-ai-comment-management) (Devpost) | LLM classifies live-comment intent, auto-replies | Yes | Live streams | 2.5 |
| Meta Business AI, AiSensy, Wati, DialogPay | AI order bots in **1:1** chats, payment links | Yes | WhatsApp, Messenger | 2 |
| n8n / Make templates | Message → GPT → Sheets. Telegram shop + Paystack template | Yes | WhatsApp 1:1, Telegram | 2 |

**Verdict: the mechanics are crowded; the intelligence is not.**
- At least six paid tools already do claim → invoice → timer → waitlist → stock. CommentSold does all of it with PayPal.
- All of them depend on **strict syntax** ("sold", "mine A12", "#12") on FB/IG/TikTok. None targets Telegram or WhatsApp **group** chats.
- Two hackathon projects already apply LLMs to messy order text, but neither handles payments or arbitration.

**Remaining novelty:**
1. LLM **claim arbitration** for free-form, multilingual, context-dependent claims ("same as her but L"), with first-come ordering cited to the exact message.
2. Native **group-chat** operation.
3. The full PayPal loop run as a supervised agent: per-buyer payment, timer, waitlist release, oversell refund, tracking.

## 2. Pain evidence

- **Philippines "joy miners":** people who claim and never pay are "especially common" in PH live selling, per [Maya Business](https://www.maya.ph/business/stories/4-common-types-of-e-commerce-scams-that-affect-merchants-in-the-philippines). See also [MindaNews](https://mindanews.com/?p=124723) and [GoLocad](https://golocad.com/blog/6-steps-to-avoid-bogus-buyers-for-your-online-shop/).
- **Manual tallying persists:**
  - EasyStore (2026) says sellers still confirm comments by hand.
  - Malaysian vendors used pen and paper ([BFM](https://old.bfm.my/podcast/enterprise/open-for-business/community-driven-live-commerce)).
  - Sellers carried on after Facebook removed Live Shopping in Oct 2022 ([GMA](https://www.gmanetwork.com/news/money/companies/840840/facebook-live-selling-feature-to-be-removed-starting-oct-1-but-sellers-hope-to-continue-biz/story/)), and Instagram live shopping ended in Mar 2023 ([Hootsuite](https://blog.hootsuite.com/social-media-updates/instagram/instagram-live-shopping-is-officially-over/)).
- **Group selling in India:** sellers post daily in groups and collect payment manually ([TechCrunch 2016](https://techcrunch.com/2016/08/17/meesho-wants-to-make-selling-through-whatsapp-more-efficient-and-less-painful); old).
- **No hard statistic on unpaid-claim rates exists.** Do not quote a number in the pitch.

## 3. Technical feasibility (official specs)

| Capability | Status | Consequence |
|---|---|---|
| **Telegram bot reads every group message** (as admin, or with privacy off) | Verified ([bot features](https://core.telegram.org/bots/features)) | The clean, legitimate path. |
| Telegram send limit: **20 messages/min per group**, ~1/s per chat | Verified ([FAQ](https://core.telegram.org/bots/faq)) | A big drop hits the cap. Batch replies into one pinned/edited "claims board" message, and DM buyers who pressed /start. |
| Telegram inline "Pay" URL buttons; external payment links for physical goods | Buttons verified. External links not prohibited (no explicit rule) | OK. |
| **WhatsApp groups** via Cloud API | Official Business Account required, **max 8 participants**, business-created invite-only groups, no interactive messages ([docs](https://developers.facebook.com/docs/whatsapp/cloud-api/groups)) | **Not viable** for community drops. Unofficial clients break terms of service. WhatsApp is out of scope; say so in the README. |
| **Orders v2 per-buyer approve link → capture → refund → track** | Verified (checkout_orders_v2, payments_payment_v2 specs) | **Recommended core.** Don't capture if the timer expired, which avoids a cancel/pay race. A native `capture_id` makes refunds and `orders/{id}/track` the documented paths. |
| Invoicing v2: create / send / remind / cancel; share-link payment (`send_to_recipient:false`, `recipient_view_url`) | Verified | Optional "invoice" story. |
| Invoice due date granularity | **Day only** (`YYYY-MM-DD`) | The 15-minute timer is ours: we call `/cancel`. |
| Invoice reminders | **Max 2/day, custom text ignored** | Nudges go through the chat, not PayPal reminders. |
| Paying a cancelled invoice | "No longer payable". A payment in flight at cancel time is unverified | Spike. |
| **Real refund of an invoice payment** | `/refunds` on an invoice only *records* an external refund. A real refund needs `captures/{id}/refund`. Whether `payments[].payment_id` works as a capture_id is **unverified** | Key reason to prefer Orders. |
| Tracking for invoice payments | Only the deprecated `/v1/shipping/trackers` with the transaction ID. Unverified | Again prefer Orders (`/track` with `capture_id`). |
| `INVOICING.INVOICE.PAID` webhook | Event exists, but also fires for "pending". Sandbox delivery unverified | Back webhooks with polling. |
| Agent Toolkit invoice tools (create, send, remind, cancel, QR, record payment/refund) plus `create_refund`, `create_shipment_tracking` | Verified | Good toolkit coverage for judges. Issue #94 (fixed) hard-coded `send_to_recipient:true`; #40 still open. Pin the version or use REST. |
| Payment Links API (`/v1/checkout/payment-resources`) | Exists, sandbox OK, reusable links, no expiry or webhook documented | Poor fit for per-buyer holds. |

**Payment-market caveat:** PayPal is weak in the Philippines, Indonesia and India, where GCash, QRIS and UPI dominate. That's where most "mine" selling happens. **The audience must be sellers whose buyers already use PayPal:** US and diaspora communities, Latin America, and collectibles (for example trading cards, sneakers and plants). For the last group, **the claim that PayPal Goods & Services is the norm is unverified**; confirm with 3–5 community posts before using it in the pitch. Discord is the obvious US platform for these drops, but its bot message-content access was **not checked**; spike it if we target that audience.

## 4. Kill-criteria results

| Criterion | Result | Notes |
|---|---|---|
| K1 already shipped | **Partial** | Mechanics shipped (CommentSold). Free-form multilingual arbitration in group chats not found. **Innovation capped at moderate.** |
| K2 PayPal gated | Pass | Orders/refund/track are standard sandbox. Invoices optional. |
| K3 live money in demo | **Pass, strong** | Several real sandbox captures, a refund and a tracking upload in one drop. |
| K4 AI decorative | Pass | Rules break on "same as her but L", quoted replies, edits and mixed languages. Must be *shown* against a keyword baseline. |
| K5 buildable in ~25 days | **Pass, strong** | Telegram bot + Orders + board is a well-understood stack. |
| K6 obvious idea | **Risk** | Near PayPal's own "request money in a chat app" example. "Comment to buy" is well known. |

## 5. Judge objections and answers

| Objection | Answer |
|---|---|
| "This is CommentSold with GPT." | CommentSold needs strict syntax on FB/IG and ignores free-form claims. Show a side-by-side: 30 real-style messages, a keyword baseline catching ~half, ClaimIt resolving the rest **with citations**. |
| "Sellers could just enforce a syntax." | In community groups they can't. Buyers reply, quote, edit and mix languages, and sellers end up tallying by hand. Cite the PH/MY evidence. |
| "Who uses PayPal in group drops?" | Lead with a US or diaspora seller persona and PayPal-native buyers. Do not claim PH/ID/IN mass-market fit. |
| "What if the AI assigns an item to the wrong person?" | The model *proposes*, and deterministic code enforces stock and order. Ambiguous claims go to the seller in one tap. Every assignment cites the message ID and timestamp, and a buyer can contest it. |
| "Timer/waitlist isn't new." | Correct, and the pitch says so. The novelty is arbitration plus a closed PayPal loop in group chats. |

## 6. Scores (1–5, rough)

| Implementation | Design | Impact | Innovation | Presentation |
|---|---|---|---|---|
| 4.5 | 4.5 | 3.5 | **3** | **5** |

**Prize fit:**
- Strong for **Best Demo Delivery**.
- Plausible for **Best Use of PayPal + AI**.
- Weaker for the Grand Prize than SpecLock, because of the Innovation ceiling.
- Sponsor: AG Grid (claims board).

## 7. Day-1/2 spikes

1. Orders flow end to end in sandbox: create → buyer approves → capture → partial refund (own `PayPal-Request-Id`) → `/track`.
2. Timer expiry: buyer approves after the timer ends → we don't capture → the item is re-offered. Confirm the approved-but-uncaptured order lapses harmlessly.
3. Telegram bot as admin in a test group. Send 30 simulated claims in 60 s, measure the send cap, test the single edited claims-board message and the DM after /start.
4. Claim-arbitration eval: 50 hand-written messy claims (English, Hinglish, Taglish, Spanish) against a keyword baseline. **Target ≥90% correct assignment, with 100% of ambiguous cases routed to the seller.**
5. Optional invoice path: pay an invoice as a sandbox buyer, then try `captures/{payment_id}/refund`. If it fails, drop invoices.

## 8. Verdict

**ClaimIt survives, with a capped Innovation score.** It is the lower-risk, higher-polish option: it is strong on Implementation, Design and Presentation, and moderate on Innovation. Choose it if the priority is a guaranteed polished entry. Choose SpecLock if the priority is the Grand Prize. See [`stress-test-speclock.md`](stress-test-speclock.md) for the head-to-head.
