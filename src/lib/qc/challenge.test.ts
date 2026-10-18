import { describe, expect, it } from "vitest";
import type { SpecField } from "../spec/schema";
import { buildChallenge, oneTimeCode } from "./challenge";

const field = (id: string, method: SpecField["method"]): SpecField => ({
  id,
  attribute: id,
  requirement: id,
  method,
  colorTargetHex: null,
  toleranceDeltaE: null,
  expectedCount: method === "count_per_layer" ? 20 : null,
  critical: false,
  citations: [],
});

describe("photo challenge", () => {
  it("issues distinct units, a carton layer shot and a batch shot, all carrying the code", () => {
    const c = buildChallenge(
      [field("logo", "vision"), field("count", "count_per_layer"), field("material", "human")],
      1000,
      50,
      new Date("2026-10-18T00:00:00Z"),
    );
    const units = c.shots.filter((s) => s.unitNumber !== null).map((s) => s.unitNumber);
    expect(new Set(units).size).toBe(3);
    units.forEach((u) => expect(u).toBeGreaterThanOrEqual(1));
    expect(c.shots.map((s) => s.id)).toEqual(["unit-1", "unit-2", "unit-3", "carton-layer", "batch-wide"]);
    c.shots.forEach((s) => expect(s.instruction).toContain(c.code));
    expect(c.shots[0].fieldIds).toEqual(["logo"]);
    expect(c.expiresAt).toBe("2026-10-18T02:00:00.000Z");
  });

  it("handles orders smaller than the number of requested units", () => {
    const c = buildChallenge([field("logo", "vision")], 2, 50, new Date());
    expect(c.shots.filter((s) => s.unitNumber !== null)).toHaveLength(2);
  });

  it("generates codes without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(oneTimeCode()).toMatch(/^[ACDEFHJKMNPRTUVWXY34679]{6}$/);
  });
});
