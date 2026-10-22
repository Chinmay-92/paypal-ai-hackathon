# AI behavior and evaluation

## Specific responsibility

Given the current agreement, merchant-controlled catalog identifiers, relevant source messages and extracted attachment text, classify the customer's intent and propose a structured amendment with citations and missing information. The model may also draft a clarification for a human to send.

It cannot decide prices, authenticate authorship, establish legal entitlement, guarantee artwork fidelity, approve scope, charge/refund money or release work. A second negotiating agent is unnecessary.

## Output contract

Return validated JSON: baseRevisionId, intent (question/change_request/cancellation/approval_like/irrelevant/uncertain), proposedChanges [{field, oldValue, proposedValue, sourceId, quotedSpan}], missingInformation, affectedApprovals, and rationale. Model-described approvals never create Approval records. Use explicit unresolved values rather than invented quantities or dates.

Validate field paths against the domain schema; verify quotes are literal spans of the supplied source; compare oldValue to the authoritative base; resolve IDs only against the merchant catalog. Unknown SKU, missing citation, stale base or schema failure routes to review, not execution. Citations support extraction, not truth of the underlying message.

Untrusted messages/attachments can contain prompt injection. Isolate them as data, give extraction no payment tools, deny executable output, and do not let text redefine policies or system instructions. Limit file size/page count, handle extraction errors explicitly, and isolate tenant retrieval.

## Domain behavior

Apparel: 'make ten of those hoodies' proposes substitution, not ten extra garments; size breakdown may remain missing. Replacing artwork invalidates artwork approval. Images can be displayed/compared as aids, but no claim of production-quality color or dimensions from pixels.

Services: 'add booking' must be compared with explicit original inclusions/exclusions. A request may be clarification or a priced extension. The merchant decides classification in ambiguous contractual cases. Dates and scope both require renewed approval when changed.

## Evaluation plan

Start with fixtures/pact/ai-cases.json, then grow to at least 40 labeled cases across both domains, including paraphrases, ambiguous references, contradictory instructions and adversarial content. Split development examples and held-out cases; record model version, prompt version, input hash and latency. Synthetic performance is not proof of real-world demand.

Measure intent accuracy, field extraction precision/recall, exact citation validity, appropriate abstention, reviewer corrections, resolution time and cost. Compare against manual review and a deterministic keyword/field-diff baseline.

Proposed go/no-go targets, not achieved results:
- All output schema and citation checks pass before proposals are shown as supported.
- Zero authoritative state/payment mutations caused directly by model output.
- No invented critical fields in accepted proposals on the held-out set; report sample size and misses.
- At least 90% correct intent on the initial mixed held-out set; publish confusion matrix.
- In real historical-case replay, median reviewed resolution time improves at least 30% without increased material errors.

If AI only duplicates a structured form with negligible improvement, narrow or abandon the AI claim. Record failure examples in the submission, including a question deliberately left unexecuted.
