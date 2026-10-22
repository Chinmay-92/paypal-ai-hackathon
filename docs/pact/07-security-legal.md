# Security, privacy and legal boundaries

This is a product risk register, not a jurisdiction-specific legal opinion. Production rollout depends on actual customer location, contracting entity, business model and applicable agreements.

## Required controls

Tenant isolation on every query and file; merchant/admin/fulfillment/customer role separation; scoped expiring invitation tokens stored hashed; server-side authorization and CSRF protection; rate limits; private attachments with short-lived authorized URLs; upload content validation; secret management; log redaction; encrypted transport; retention/deletion policy; audit logs; backup and restore test. No live personal data in public fixtures or sandbox.

Never store passwords, full card/bank details or payment tokens in model context. Treat all correspondence as untrusted. No automatic sending of model-drafted external messages. Customer approval records actor, exact revision, timestamp and disclosed terms, but do not claim legal identity certainty from possession of a URL.

## PayPal terms requiring production resolution

The published Developer Agreement includes consent requirements, anonymous non-live sandbox data, and region-specific restrictions on data retention/disclosure. Its US section contains a 48-hour deletion rule for specified balance/history information. Determine the applicable contract and permissions before retaining API-derived records or sending them to an external model. Partner-specific terms may matter; do not infer an exemption. Keep model inputs focused on merchant-supplied scope and messages; even these need lawful processing authority.

A production data map must classify merchant-authored contracts, customer correspondence, API-derived transaction information, identifiers and audit events separately. Establish permitted retention for each. A desire for permanent evidence does not override contractual limits. Customer-controlled export or local hosting is not automatically a legal workaround.

## Consumer and commercial rights

Approval is not a waiver of statutory rights, and payment is not proof of satisfactory delivery. Refunds and cancellation costs depend on contracts and law, not an LLM recommendation. US PayPal Purchase Protection excludes certain significantly-not-as-described claims for wholly/partly custom-made goods; do not advertise blanket protection. Website-service rules may differ. Indian PayPal accounts cannot receive domestic payments according to PayPal's India help page; sandbox fixtures do not demonstrate Indian domestic commerce.

## Product liability boundaries

Pact records and coordinates decisions; merchant decides feasibility, price, tax, deadlines and the right to perform changed work. No escrow, custody, dispute arbitration, automatic legal advice or autonomous debit. Human review reduces error exposure without eliminating responsibility. Production needs appropriate customer terms, privacy notice, data-processing agreements and subprocessors review; no boilerplate published as if lawyer-approved.

## Brand and open source

The owner selected 'Pact'. The prior PactPop search does not clear Pact; existing Pact products were found during naming research. Brand/domain/trademark clearance remains open. Use an original wordmark; no implication of PayPal endorsement. MIT license covers project-authored code/docs, not vendor SDK terms, artwork or supplied documents. Use synthetic original demo artwork and clear rights for all submission assets.

Sources: [Developer Agreement](https://www.paypal.com/us/legalhub/paypal/xdeveloper-full), [US Purchase Protection](https://www.paypal.com/us/legalhub/buyer-protection), [India domestic limitation](https://www.paypal.com/in/cshelp/article/can-i-use-paypal-to-receive-payments-from-indian-customers-help1049), [ICO processor contracts](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/).
