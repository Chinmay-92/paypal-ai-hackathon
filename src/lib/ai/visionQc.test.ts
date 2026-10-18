import { describe, expect, it } from "vitest";
import type { PhotoChallenge } from "../qc/challenge";
import type { SpecField } from "../spec/schema";
import { applyChallengeRules, type VisionResult } from "./visionQc";

const field = (id: string, critical = false): SpecField => ({
  id,
  attribute: id,
  requirement: id,
  method: "vision",
  colorTargetHex: null,
  toleranceDeltaE: null,
  expectedCount: null,
  critical,
  citations: [],
});

const challenge: PhotoChallenge = { code: "K7RX4M", issuedAt: "", expiresAt: "", shots: [] };

describe("applyChallengeRules", () => {
  it("keeps verdicts supported by a shot with the right code and no problems", () => {
    const result: VisionResult = {
      shots: [{ shotId: "unit-1", codeReadInFrame: "k7rx 4m", unitOrCartonNumberRead: "412", problems: [] }],
      fields: [{ fieldId: "logo", verdict: "fail", evidence: "logo off-centre", shotIds: ["unit-1"] }],
    };
    expect(applyChallengeRules([field("logo", true)], challenge, result)).toEqual([
      { fieldId: "logo", critical: true, verdict: "fail", evidence: "logo off-centre" },
    ]);
  });

  it("downgrades verdicts resting only on shots with a wrong code or problems", () => {
    const result: VisionResult = {
      shots: [
        { shotId: "unit-1", codeReadInFrame: "K7RX4N", unitOrCartonNumberRead: null, problems: [] },
        { shotId: "unit-2", codeReadInFrame: "K7RX4M", unitOrCartonNumberRead: null, problems: ["blurred"] },
      ],
      fields: [{ fieldId: "logo", verdict: "pass", evidence: "logo fine", shotIds: ["unit-1", "unit-2"] }],
    };
    const [v] = applyChallengeRules([field("logo")], challenge, result);
    expect(v.verdict).toBe("cant_verify");
  });

  it("marks fields the model skipped as cant_verify", () => {
    const result: VisionResult = { shots: [], fields: [] };
    expect(applyChallengeRules([field("label")], challenge, result)[0].verdict).toBe("cant_verify");
  });
});
