# Validation and business hypotheses

## Evidence status

Observed: print-shop discussions describe overloaded intake, email proofing and reliance on approval histories. Competitors already offer approvals, payment requests and AI quoting. These facts do not establish that Pact's amendment coordination is underserved.

Inference: scattered communication can make approved records stale.
Hypothesis: enough businesses repeatedly spend time propagating consequential amendments that they will adopt a separate coordinator.
Unknown: frequency, loss distribution, buyer budget, willingness to change workflow, PayPal usage, and retention.

## Initial participants and records

Interview owners/order coordinators at two custom-goods shops and project managers/owners at two small service agencies. Request consented, anonymized examples of recent jobs that changed after quote/deposit: original scope, actual messages, versions, payment adjustments, final instructions and outcome. Include uneventful changes and cases solved by existing software, not just horror stories. Do not scrape private groups or claim interviews occurred.

Questions about past behavior:
- Walk through the last change after a customer paid. Where did it first arrive?
- Who noticed it, and which records were updated?
- Show the last discrepancy between approval, payment and execution.
- How often did this occur in the last month, out of how many jobs?
- What tool already handles it? What still requires manual work?
- What was actually lost: time, materials, unpaid work, customer relationship?
- Who approves software spending, and what is already paid for?
- How many relevant jobs use PayPal? Would changing payment flow be unacceptable?

## Manual experiment before broad integration

Replay 20 historical changes across at least two businesses. A reviewer manually produces the same change table/approval packet proposed by Pact; time the existing process and assisted review. Compare with the business's existing software and a structured form. A synthetic demonstration cannot replace this test.

Proposed progression gate: at least two independent businesses show recurring consequential changes; at least ten records require contextual interpretation; median reviewed handling time falls at least 30% with no additional material mistakes; at least one buyer agrees to a concrete pilot and discusses a paid price. These thresholds are decisions to test, not findings.

Abandon the business claim if incidents are rare, a structured form solves most cases, incumbent configuration resolves the problem, or merchants will not route approvals/payments through Pact. Keep hackathon technical claims distinct from business validation.

## Competitive checks

Printavo: separate artwork/quote approvals and automated payment requests.
Aleyant: AI reads emailed specifications into estimates.
Printcore/My Print Shop MIS: AI intake/quoting claims.
Scopey: messages linked to contract/commercial changes in construction, important for expansion claims.
Manual alternatives: email approval, written change orders, spreadsheets and a dedicated coordinator.

The hypothesized gap is cross-message amendment interpretation plus reliable propagation into approved payment and execution state. No novelty claim until tested against actual competitor workflows.

## Business model and defensibility

Potential buyer: owner or operations manager; recurring SaaS per business is a hypothesis. No transaction surcharge or revenue forecast is assumed. Measure case volume, review savings, onboarding time, support cost and model cost before choosing pricing.

Competitors can copy UI, prompts, diffs and checkout quickly. Possible compounding advantages are integration reliability, consented domain evaluation cases, amendment templates and trusted distribution via service providers. Do not train on cross-customer documents by default. Open source means trust/support and workflow quality must carry value.
