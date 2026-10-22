import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { merchantJobView } from "../src/application/jobs";
import { closePool } from "../src/persistence/db";
import { createDemoWorkspace, demoModeEnabled } from "../src/server/demo";
import { expectStatus, ORIGIN, world } from "./helpers";

beforeEach(async () => {
  await world();
});
afterEach(() => {
  delete process.env.PACT_DEMO_DAILY_LIMIT;
});
afterAll(closePool);

describe("hosted demo workspaces", () => {
  it("is off unless explicitly enabled", () => {
    expect(demoModeEnabled({})).toBe(false);
    expect(demoModeEnabled({ PACT_DEMO_MODE: "true" })).toBe(true);
  });

  it("gives each visitor an isolated synthetic tenant with published demo jobs", async () => {
    const a = await createDemoWorkspace(ORIGIN);
    const b = await createDemoWorkspace(ORIGIN);
    expect(a.owner.tenantId).not.toBe(b.owner.tenantId);
    expect(a.jobs).toHaveLength(2);
    expect(a.ownerEmail).toMatch(/@demo\.pact\.invalid$/);
    await expectStatus(merchantJobView(b.owner, a.jobs[0].jobId), 404);
    const view = await merchantJobView(a.owner, a.jobs[0].jobId);
    expect(view.pending).not.toBeNull();
  });

  it("enforces the daily workspace cap", async () => {
    process.env.PACT_DEMO_DAILY_LIMIT = "1";
    await createDemoWorkspace(ORIGIN);
    await expectStatus(createDemoWorkspace(ORIGIN), 429);
  });
});
