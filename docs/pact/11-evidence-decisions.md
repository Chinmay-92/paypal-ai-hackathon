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
- D10: At blueprint creation this branch contained documentation, fixtures and documentation checks only; the later MCP prototype is recorded in D11.
- D11: Add a local stdio MCP adapter as an AI-host interface. The host may interpret correspondence and propose structured changes; the adapter verifies quote presence and revision freshness, and stores only a merchant-review draft. It does not replace the planned authenticated Pact application API, and has no payment or outbound-message tools.

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
