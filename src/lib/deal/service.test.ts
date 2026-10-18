import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PayPalClient } from "../paypal/client";
import type { ExtractedSpec } from "../spec/schema";

process.env.SPECLOCK_DATA_DIR = mkdtempSync(path.join(tmpdir(), "speclock-"));

let service: typeof import("./service");

beforeAll(async () => {
  service = await import("./service");
});

const spec: ExtractedSpec = {
  product: "Printed cotton tote bag",
  quantity: 1000,
  unitPrice: "3.00",
  currency: "USD",
  fields: [
    {
      id: "logo",
      attribute: "Logo",
      requirement: "Front logo centred, 20 cm wide",
      method: "vision",
      colorTargetHex: null,
      toleranceDeltaE: null,
      expectedCount: null,
      critical: true,
      citations: [{ messageId: "m1", quote: "logo centred" }],
    },
    {
      id: "bag_color",
      attribute: "Bag colour",
      requirement: "Navy #1f3a68",
      method: "color_delta_e",
      colorTargetHex: "#1f3a68",
      toleranceDeltaE: 3,
      expectedCount: null,
      critical: false,
      citations: [{ messageId: "m1", quote: "navy" }],
    },
  ],
  unresolved: [],
};

function fakePayPal() {
  const captures: { authorizationId: string; body: { amount: { value: string }; final_capture: boolean }; requestId: string }[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = init.headers as Record<string, string>;
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === "/v1/oauth2/token") return json({ access_token: "t", expires_in: 3600 });
    if (url.pathname === "/v2/checkout/orders") {
      return json({ id: "ORD1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://paypal.test/approve" }] });
    }
    if (url.pathname === "/v2/checkout/orders/ORD1/authorize") {
      return json({ id: "ORD1", purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } }] });
    }
    const m = /^\/v2\/payments\/authorizations\/(\w+)\/capture$/.exec(url.pathname);
    if (m) {
      captures.push({ authorizationId: m[1], body: JSON.parse(String(init.body)), requestId: headers["PayPal-Request-Id"] });
      return json({ id: `CAP${captures.length}`, status: "COMPLETED" });
    }
    throw new Error(`Unexpected ${url.pathname}`);
  }) as typeof fetch;
  return { client: new PayPalClient({ clientId: "a", clientSecret: "b", baseUrl: "https://api.test", fetch: impl }), captures };
}

const navy: [number, number, number] = [31, 58, 104];
const neutral: [number, number, number] = [242, 242, 242];

function deps(paypal: PayPalClient, logoVerdict: "pass" | "fail"): import("./service").Deps {
  return {
    paypal: () => paypal,
    now: () => new Date("2026-10-19T10:00:00Z"),
    extractSpec: async () => ({ spec, problems: [] }),
    inspectPhotos: async (fields) => ({
      result: { shots: [], fields: [] },
      validShotIds: ["unit-1"],
      verdicts: fields
        .filter((f) => f.method === "vision")
        .map((f) => ({ fieldId: f.id, critical: f.critical, verdict: logoVerdict, evidence: "seen in unit-1" })),
    }),
    proposeRemedy: async ({ balance }) => ({
      offer: { kind: "discount", discountBps: 10_000, note: "Waive balance, logo misprinted" },
      check: { ok: true, needsSupplierApproval: true, buyerAutoAccepts: true, balanceToCapture: { currency: balance.currency, minor: 0 } },
    }),
  };
}

async function dealAtChallenge(d: import("./service").Deps) {
  const deal = await service.createDeal({
    messages: [{ id: "m1", author: "buyer", text: "navy bag, logo centred" }],
    buyerMandate: { maxAutoReleaseMinor: 500_000, autoAcceptDiscountBps: 1000, acceptRemake: true },
    supplierMandate: { maxDiscountBps: 1000, allowRemake: true, maxRemakeDays: 14 },
  });
  await service.proposeSpec(deal.id, d);
  const hash = service.specHash(spec);
  await service.approveSpec(deal.id, "buyer", hash);
  const locked = await service.approveSpec(deal.id, "supplier", hash);
  expect(locked.status).toBe("spec_locked");
  expect(locked.deposit).toEqual({ currency: "USD", minor: 90_000 });
  expect(locked.balance).toEqual({ currency: "USD", minor: 210_000 });
  await service.startPayment(deal.id, "https://app.test", d);
  await service.completeBuyerApproval(deal.id, "ORD1", d);
  const challenged = await service.issueChallenge(deal.id, d);
  expect(challenged.status).toBe("challenge_issued");
  return deal.id;
}

describe("deal workflow", () => {
  it("captures the deposit, then auto-releases the balance when QC passes", async () => {
    const { client, captures } = fakePayPal();
    const d = deps(client, "pass");
    const id = await dealAtChallenge(d);
    const done = await service.submitInspection(id, [{ shotId: "unit-1", mediaType: "image/jpeg", base64: "x" }], [
      { fieldId: "bag_color", shotId: "unit-1", sample: navy, neutral },
    ], d);
    expect(done.status).toBe("balance_captured");
    expect(captures.map((c) => [c.body.amount.value, c.body.final_capture, c.requestId])).toEqual([
      ["900.00", false, `${id}:capture-deposit`],
      ["2100.00", true, `${id}:capture-balance`],
    ]);
  });

  it("holds the balance and waits for the supplier when the remedy exceeds the agent's limit", async () => {
    const { client, captures } = fakePayPal();
    const d = deps(client, "fail");
    const id = await dealAtChallenge(d);
    const held = await service.submitInspection(id, [{ shotId: "unit-1", mediaType: "image/jpeg", base64: "x" }], [
      { fieldId: "bag_color", shotId: "unit-1", sample: navy, neutral },
    ], d);
    expect(held.status).toBe("awaiting_decision");
    expect(held.qc?.decision).toEqual({ action: "remedy", failedFieldIds: ["logo"], criticalFailure: true });
    expect(captures).toHaveLength(1);

    const settled = await service.resolve(id, "supplier_approve_remedy", d);
    expect(settled.status).toBe("balance_captured");
    expect(captures[1].body).toMatchObject({ amount: { value: "0.00" }, final_capture: true });
  });

  it("sends colour to a human when the sample comes from an unverified shot", async () => {
    const { client } = fakePayPal();
    const d = deps(client, "pass");
    const id = await dealAtChallenge(d);
    const deal = await service.submitInspection(id, [{ shotId: "unit-2", mediaType: "image/jpeg", base64: "x" }], [
      { fieldId: "bag_color", shotId: "unit-2", sample: navy, neutral },
    ], d);
    expect(deal.qc?.decision).toEqual({ action: "human_review", fieldIds: ["bag_color"] });
    expect(deal.status).toBe("awaiting_decision");
  });

  it("refuses to lock a spec that changed after review", async () => {
    const { client } = fakePayPal();
    const d = deps(client, "pass");
    const deal = await service.createDeal({
      messages: [],
      buyerMandate: { maxAutoReleaseMinor: 1, autoAcceptDiscountBps: 1, acceptRemake: true },
      supplierMandate: { maxDiscountBps: 1, allowRemake: true, maxRemakeDays: 1 },
    });
    await service.proposeSpec(deal.id, d);
    await expect(service.approveSpec(deal.id, "buyer", "stale-hash")).rejects.toThrow(/changed/);
  });
});
