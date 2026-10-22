import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { amountDue, creditedFunding, refundableCapacity, remainingBalance } from "./funding";
import { depositTarget, formatMoney, parseDecimalString, toDecimalString } from "./money";
import { blockers } from "./readiness";
import { buildContent, contentHash, publishProblems, scopeDiff } from "./revision";
import { TEMPLATES, type Domain } from "./templates";

type Scenario = {
  id: Domain;
  original_total_minor: number;
  revised_total_minor: number;
  deposit_basis_points: number;
  prior_paid_minor: number;
  expected_additional_deposit_minor: number;
  expected_remaining_balance_minor: number;
};
const scenarios = JSON.parse(readFileSync("fixtures/pact/scenarios.json", "utf8")) as Scenario[];

const ORIGINAL = {
  apparel: { shirts_qty: 50, shirts_sizes: { S: 10, M: 20, L: 15, XL: 5 }, hoodies_qty: 0, hoodies_sizes: {}, garment_color: "Black", artwork: "logo-v1", delivery_date: "2026-11-30" },
  website: { pages: 5, booking_included: false, booking_provider: null, revision_rounds: 2, exclusions: "Hosting", acceptance: "Renders on mobile", target_date: "2026-12-15" },
};
const REVISED = {
  apparel: { ...ORIGINAL.apparel, shirts_qty: 40, shirts_sizes: { S: 10, M: 15, L: 10, XL: 5 }, hoodies_qty: 10, hoodies_sizes: { M: 5, L: 5 }, artwork: "logo-v2" },
  website: { ...ORIGINAL.website, booking_included: true, booking_provider: "Calendly, 30-minute slots" },
};

describe("money", () => {
  it("converts minor units at the provider boundary without floats", () => {
    expect(toDecimalString({ currency: "USD", minor: 10000 })).toBe("100.00");
    expect(toDecimalString({ currency: "USD", minor: 5 })).toBe("0.05");
    expect(parseDecimalString("300.1", "USD").minor).toBe(30010);
    expect(() => parseDecimalString("1.234", "USD")).toThrow();
    expect(formatMoney({ currency: "USD", minor: 80000 })).toBe("$800.00");
  });

  it("rounds deposits half-up to the minor unit", () => {
    expect(depositTarget(80000, 5000)).toBe(40000);
    expect(depositTarget(333, 5000)).toBe(167);
    expect(depositTarget(1, 3333)).toBe(0);
    expect(() => depositTarget(-1, 5000)).toThrow();
  });
});

describe.each(scenarios)("shared engine with the $id fixture", (s) => {
  const t = TEMPLATES[s.id];

  it("prices the original and revised scope from the merchant rate card", () => {
    const original = buildContent({ domain: s.id, currency: "USD", scope: ORIGINAL[s.id], lineItems: t.suggestLineItems(ORIGINAL[s.id], t.defaultRateCard), depositBps: s.deposit_basis_points });
    const revised = buildContent({ domain: s.id, currency: "USD", scope: REVISED[s.id], lineItems: t.suggestLineItems(REVISED[s.id], t.defaultRateCard), depositBps: s.deposit_basis_points });
    expect(original.totalMinor).toBe(s.original_total_minor);
    expect(revised.totalMinor).toBe(s.revised_total_minor);
    expect(publishProblems(revised, t.defaultCatalog)).toEqual([]);
  });

  it("computes the additional deposit and remaining balance", () => {
    const credited = creditedFunding([{ amountMinor: s.prior_paid_minor, providerStatus: "COMPLETED", credited: true, completedRefundsMinor: 0 }]);
    const due = amountDue(depositTarget(s.revised_total_minor, s.deposit_basis_points), credited);
    expect(due).toBe(s.expected_additional_deposit_minor);
    expect(remainingBalance(s.revised_total_minor, credited + due)).toBe(s.expected_remaining_balance_minor);
  });

  it("reports field-level differences", () => {
    const diff = scopeDiff(s.id, ORIGINAL[s.id], REVISED[s.id]);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((d) => d.oldValue !== d.newValue)).toBe(true);
  });
});

describe("revision rules", () => {
  it("blocks publishing an ambiguous substitution until sizes are resolved", () => {
    const t = TEMPLATES.apparel;
    const scope = { ...ORIGINAL.apparel, shirts_qty: 40, hoodies_qty: 10, shirts_sizes: null, hoodies_sizes: null };
    const content = buildContent({ domain: "apparel", currency: "USD", scope, lineItems: t.suggestLineItems(scope, t.defaultRateCard), depositBps: 5000 });
    const problems = publishProblems(content, t.defaultCatalog);
    expect(problems).toContain("Which T-shirt sizes are required?");
    expect(problems).toContain("Which hoodie sizes are required?");
  });

  it("requires booking details when booking is added to a website", () => {
    const t = TEMPLATES.website;
    const scope = { ...ORIGINAL.website, booking_included: true };
    const content = buildContent({ domain: "website", currency: "USD", scope, lineItems: t.suggestLineItems(scope, t.defaultRateCard), depositBps: 5000 });
    expect(publishProblems(content, t.defaultCatalog)).toContain("What booking provider and booking rules are required?");
  });

  it("rejects catalog values the merchant does not offer", () => {
    const t = TEMPLATES.apparel;
    const scope = { ...ORIGINAL.apparel, artwork: "logo-unknown" };
    const content = buildContent({ domain: "apparel", currency: "USD", scope, lineItems: t.suggestLineItems(scope, t.defaultRateCard), depositBps: 5000 });
    expect(publishProblems(content, t.defaultCatalog)).toContain("Artwork must be a catalog item");
  });

  it("hashes content canonically", () => {
    const t = TEMPLATES.website;
    const a = buildContent({ domain: "website", currency: "USD", scope: ORIGINAL.website, lineItems: t.suggestLineItems(ORIGINAL.website, t.defaultRateCard), depositBps: 5000 });
    const b = buildContent({ domain: "website", currency: "USD", scope: { ...ORIGINAL.website }, lineItems: t.suggestLineItems(ORIGINAL.website, t.defaultRateCard), depositBps: 5000 });
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).not.toBe(contentHash({ ...b, totalMinor: b.totalMinor + 1 }));
  });
});

describe("funding", () => {
  it("never counts pending, unknown or unreviewed captures as funding", () => {
    expect(
      creditedFunding([
        { amountMinor: 1000, providerStatus: "PENDING", credited: true, completedRefundsMinor: 0 },
        { amountMinor: 2000, providerStatus: "COMPLETED", credited: false, completedRefundsMinor: 0 },
        { amountMinor: 3000, providerStatus: "COMPLETED", credited: true, completedRefundsMinor: 500 },
      ]),
    ).toBe(2500);
  });

  it("reserves pending refunds against refundable capacity", () => {
    expect(refundableCapacity(30000, 5000, 10000)).toBe(15000);
    expect(refundableCapacity(30000, 30000, 0)).toBe(0);
  });

  it("lists every reason work cannot be released", () => {
    const codes = blockers({
      fulfillmentState: "HOLD",
      hasApprovedEffectiveRevision: true,
      hasPendingRevision: true,
      openMaterialChangeRequests: 1,
      depositTargetMinor: 40000,
      creditedMinor: 30000,
      obligationStatuses: ["PENDING", "UNKNOWN"],
      holdReason: "Waiting for artwork",
    }).map((b) => b.code);
    expect(codes).toEqual(["PENDING_REVISION", "UNRESOLVED_AMENDMENT", "PAYMENT_UNKNOWN", "PAYMENT_PENDING", "DEPOSIT_DUE", "MANUAL_HOLD"]);
  });
});
