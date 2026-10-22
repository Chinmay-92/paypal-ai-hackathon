# Product definition

## Identity and target

**Pact — Changes agreed. Work aligned.**

A responsive web app for coordinating changes to agreed custom goods and services. The initial operating customer is an owner/order coordinator or project manager. The customer approver and fulfillment team are additional roles. The business pays for the product if repeated avoided administrative effort and mistakes justify it; pricing and willingness to pay are unvalidated.

Problem statement: Businesses accept customer changes through messages and documents, but changes do not reliably propagate into agreed scope, price, payment and fulfillment instructions. The result can be unpriced work, incorrect delivery and disputes over authorization.

## Positioning

Pact governs amendments to an existing agreement. It is compatible in principle with external CRM, quoting and accounting systems; integrations are future work. It does not need to replace them to demonstrate the amendment workflow. Existing quoting and approval competitors are substantial. Our hypothesized distinction is detecting consequential changes in incoming correspondence and coordinating their downstream effects.

## Two demonstration domains

1. Custom goods: apparel quantities, sizes, material/garment choice, artwork asset and delivery date.
2. Project services: website deliverables, exclusions, revision allowances, acceptance conditions and target date.

Future candidate templates include event services, furniture and fabrication, repair and installation. They require separate demand validation and local operating rules. Do not market all domains as validated.

## Product form and channels

Primary: desktop merchant web workspace plus mobile-first customer approval/payment pages. Fulfillment staff use a restricted job-sheet view. No installation required.

Initial intake: paste a message thread with explicit author/time labels, upload a supported document, or submit a change inside the customer portal. Imported messages are marked user-supplied and are not authenticated proof of authorship. Attachments have immutable IDs and hashes.

WhatsApp is a later intake/notification adapter, not the system of record. A future connector must use the official Business Platform, authorized business account and applicable permission/template rules after those are verified. No scraping personal chat history. A WhatsApp message alone never charges money or proves acceptance. Approval links return the customer to Pact's versioned agreement page. Email integration has the same separation.

## P0: complete submission scope

- Merchant login and tenant-scoped access; secure customer invitation/approval session.
- Create an original agreement manually or from a reviewed extraction.
- Two domain templates and small merchant-controlled catalogs/rate cards.
- Deposit checkout, verified completion and durable receipt references.
- Amendment intake with cited extraction, clarification and explicit proposal acceptance.
- Merchant-approved price/timing; customer approve/decline for that exact revision.
- Separate buyer-approved additional payment where required.
- Current fulfillment sheet, hold state, history and amendment resolution.
- Durable payment retry/recovery, duplicate event handling, and merchant-reviewed refund flow.
- Synthetic hosted sandbox demo, reproducible setup and model evaluation report.

## P1 after P0 passes

Attachment comparison beyond text extraction, one email connector, richer job-sheet export, and notifications. Accessibility and small-screen usability are P0, not polish to defer.

## Exclusions

Marketplace routing, escrow, arbitrary third-party account access, a general scheduling system, production AI QC, automatic dispute decisions, legal drafting, tax calculation, multi-currency conversion, native apps and browser extensions. USD-only fixtures initially. Merchant-entered taxes/fees are explicit totals; don't imply tax advice.

## Definition of product success

A customer amendment can travel from source message to agreed, funded and executable revision without staff retyping the same specification into each stage. We must measure that improvement on historical cases. A version history alone does not establish impact.
