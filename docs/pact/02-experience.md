# Experience and interface

## Visual direction

A calm operational workspace with a compact job list, clear typography and generous reading space. Use a neutral palette with one brand accent; use text and icons as well as color for state. The important visual is the agreement diff next to its source. No chatbot landing page, decorative analytics or mascot interrupting payment.

## Merchant workspace

Routes are proposed implementation routes.

- `/app/jobs`: job, customer, current revision, unresolved request, deposit due and next responsible person. Filters: needs review, awaiting customer, awaiting payment, ready, in progress, exception.
- `/app/jobs/:id`: three areas: source conversation; proposed changes against current agreement; commercial/approval/payment summary. On mobile use labeled tabs.
- `/app/jobs/:id/history`: append-only revision and action timeline with actor, time and source. Separate system-observed events from user-supplied correspondence.
- `/app/jobs/:id/fulfillment`: print-friendly current job sheet, revision identifier and readiness. Superseded sheets carry a visible warning when accessed online.

Review actions: classify request, resolve missing fields, adjust merchant pricing, preview customer diff, publish proposal, reject request, place hold and mark production started. Destructive changes require an explanation. AI confidence is not an approval button.

## Customer portal

`/review/:token` exchanges a limited, expiring invitation for a secure job-scoped session. It shows merchant identity, original terms, proposed changes, total, previously paid amount, amount due now, remaining balance and date changes.

Buttons: ask a question, approve this revision, decline. Approval and PayPal checkout are distinct steps. Declining an amendment does not erase the original agreement or automatically resume production; merchant resolves the hold.

Customer identity: sandbox demo uses explicitly labeled synthetic participants. Production should verify the intended recipient and preserve the acting person's authority; a bearer link alone is weak evidence. Never claim a qualified electronic signature.

## Fulfillment view

Only current effective scope is actionable. Show requirements and blockers: unresolved amendment, approval missing, payment pending/unknown, or production exception. Once ready, merchant explicitly releases/starts work. A late request creates a visible hold or manual exception, not an automatic rewrite of instructions already being executed.

## Mandatory edge-state copy

- Question: 'This asks for a price; your order has not changed.'
- Ambiguity: 'Which ten sizes should move to hoodies?'
- Stale revision: 'This proposal has been replaced. Review the current version.'
- Unknown payment: 'We are checking the payment result. Do not pay again yet.'
- Pending capture: 'Payment is pending. Work has not been released.'
- New request after start: 'Work has started. The shop must confirm whether this change is possible.'
- Refund pending: 'Refund requested; completion is not yet confirmed.'

## Accessibility and usability acceptance

Keyboard-complete flows, visible focus, semantic labels, error summaries, screen-reader announcements for status, no color-only diffs, adequate contrast, touch targets, and no horizontal dependence for customer approval. Persist draft review state after refresh. Display timezone, currency and explicit revision throughout.

## Demo layout

Use two browser sessions: merchant desktop and customer mobile viewport. A compact fixture selector changes the domain. Demo fixtures are clearly labeled and separate from any real workspace. A payment trace panel is developer/judge-only, not part of the customer's normal purchase experience.
