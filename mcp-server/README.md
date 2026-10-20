# Pact MCP server

Pact MCP exposes a local job context to an AI host and lets the host save an evidence-backed amendment **draft** for merchant review. It uses the official TypeScript MCP SDK and stdio transport. This is a prototype adapter over a local synthetic JSON store, not a production Pact API or payment integration.

The model’s useful job is interpreting a natural-language customer message: identify which agreed fields might change, distinguish a question from a commitment, and carry exact source quotes into a proposed patch. The server verifies revision freshness, editable fields, and literal evidence quotes, then stores the proposal without changing the effective scope. A human still decides feasibility, price, timing, publication and what to tell the customer.

## Tools

| Tool | Effect |
| --- | --- |
| `list_jobs` | Read job summaries from the local workspace. |
| `get_job_context` | Read a job’s current revision, scope, source messages and draft history. |
| `create_amendment_draft` | Write a cited proposal requiring merchant review; rejects stale revisions, non-editable fields and unsupported quotes. |

The fixture intentionally includes an ambiguous apparel substitution. “Could we switch 8…” is a request and “What would that cost?” is a question. The agent should not invent the hoodie price or treat the question as approval.

## Run

Requires Node.js 20+. From this directory:

```sh
npm install
npm test
npm run typecheck
npm start
```

The server waits on stdin/stdout for an MCP host. Its default store is `../.data/pact-mcp-store.json`, initialized from the synthetic fixture on first run. Set `PACT_MCP_STORE` to an absolute path to choose another local file. The store is ignored by git. Do not put customer data or secrets in this prototype.

To inspect the server with MCP Inspector:

```sh
npm run build
npx @modelcontextprotocol/inspector node dist/src/index.js
```

## Connect a local MCP host

After `npm install` and `npm run build`, configure a stdio MCP server with command `node`, argument `<absolute-path-to-project>/mcp-server/dist/src/index.js`, and working directory `<absolute-path-to-project>/mcp-server`. In hosts that accept an `env` map, set `PACT_MCP_STORE` to a writable local JSON path. The host must have this project’s dependencies installed. Do not point multiple users at one shared file or expose this stdio process as an unauthenticated network service.

The synthetic job id is `job-apparel-001`. A complete demo is: call `list_jobs`; read `job-apparel-001`; infer a possible garment substitution from `msg-1`; call `create_amendment_draft` with a literal supporting quote; fetch the job again and show that the draft is pending while the agreed scope remains unchanged. Then try a fabricated quote or stale revision to show the guardrails.

## Security and limits

- This process trusts its local MCP host. Stdio is not tenant authentication; production needs Pact’s authenticated, tenant-scoped application API.
- Customer text is untrusted data. The host must not follow instructions embedded in message content.
- No tool approves/publishes an amendment, sends email/WhatsApp, changes prices, confirms payment, captures or refunds PayPal, or releases fulfillment.
- The store is a single-process prototype. Writes are serialized within one process and replaced atomically, but it is not a multi-user database and has no backup/recovery guarantees.
- Exact substring checking verifies that a quote exists in the supplied message, not that the customer authored it or that the proposed interpretation is correct.

## Implementation status

This MCP server is a first working slice alongside Pact’s product blueprint. It does not complete the web app, authentication, production persistence, model evaluation, PayPal sandbox flow or hackathon submission requirements.
