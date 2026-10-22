import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createJob } from "../src/application/jobs";
import { extractOriginalAgreement } from "../src/application/originals";
import { publishRevision } from "../src/application/revisions";
import { closePool } from "../src/persistence/db";
import { expectStatus, suggested, world, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await world();
});
afterAll(closePool);

const APPAREL_QUOTE = `Hi Sam, confirming your order: 50 black t-shirts (S 10, M 20, L 15, XL 5) printed with logo-v1, no hoodies.
Delivery by November 30, 2026. Thanks!`;

const WEBSITE_QUOTE = `Scope: a 5-page clinic website with 2 rounds of revisions. No appointment booking.
Excludes copywriting and hosting fees. Launch target 2026-12-15.`;

describe("original agreement from a pasted quote (deterministic baseline)", () => {
  it("extracts cited apparel terms that publish without edits", async () => {
    const r = await extractOriginalAgreement(w.owner, { domain: "apparel", text: APPAREL_QUOTE });
    expect(r.extractor).toBe("baseline");
    expect(r.scope).toMatchObject({
      shirts_qty: 50,
      shirts_sizes: { S: 10, M: 20, L: 15, XL: 5 },
      hoodies_qty: 0,
      garment_color: "Black",
      artwork: "logo-v1",
      delivery_date: "2026-11-30",
    });
    expect(r.citations.every((c) => c.supported && APPAREL_QUOTE.includes(c.quotedSpan))).toBe(true);
    const { job, draft } = await createJob(w.owner, {
      domain: "apparel",
      title: "From quote",
      customer: { name: "Sam (synthetic)", email: "sam@example.test" },
      scope: r.scope,
      lineItems: suggested("apparel", r.scope),
      depositBps: 5000,
    });
    expect(draft.total_minor).toBe(60000);
    await publishRevision(w.owner, job.id, draft.id, { expectedVersion: job.version });
  });

  it("extracts website inclusions, exclusions and dates", async () => {
    const r = await extractOriginalAgreement(w.owner, { domain: "website", text: WEBSITE_QUOTE });
    expect(r.scope).toMatchObject({ pages: 5, revision_rounds: 2, booking_included: false, target_date: "2026-12-15" });
    expect(r.scope.exclusions).toMatch(/copywriting/);
  });

  it("leaves unstated terms unresolved and asks for them instead of guessing", async () => {
    const r = await extractOriginalAgreement(w.owner, { domain: "apparel", text: "We'd like some shirts with our logo, details to follow." });
    expect(r.scope.shirts_qty).toBeNull();
    expect(r.scope.delivery_date).toBeNull();
    expect(r.missingInformation).toEqual(expect.arrayContaining(["How many T-shirts?", "What delivery date was agreed?"]));
  });

  it("is owner-only", async () => {
    await expectStatus(extractOriginalAgreement(w.team, { domain: "apparel", text: APPAREL_QUOTE }), 403);
  });
});
