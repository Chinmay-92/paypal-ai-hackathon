import { describe, expect, it } from "vitest";
import { checkColor, deltaE2000, hexToRgb, rgbToLab, sampleRegion, whiteBalance } from "./color";

describe("deltaE2000", () => {
  // Reference pairs from Sharma, Wu & Dalal (2005) CIEDE2000 test data.
  const cases: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];
  it.each(cases)("matches reference %#", (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
  });

  it("is zero for identical colours", () => {
    expect(deltaE2000([40, 10, -10], [40, 10, -10])).toBe(0);
  });
});

describe("rgbToLab", () => {
  it("maps white and black to the Lab extremes", () => {
    const [L] = rgbToLab([255, 255, 255]);
    expect(L).toBeCloseTo(100, 2);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 5);
  });

  it("matches a known sRGB red", () => {
    const [L, a, b] = rgbToLab(hexToRgb("#ff0000"));
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });
});

describe("whiteBalance", () => {
  it("removes a warm colour cast measured on the neutral patch", () => {
    const reference: [number, number, number] = [240, 240, 240];
    const warmNeutral: [number, number, number] = [250, 235, 205];
    const corrected = whiteBalance(warmNeutral, warmNeutral, reference);
    corrected.forEach((c) => expect(c).toBeCloseTo(240, 6));
  });
});

describe("checkColor", () => {
  it("passes a sample that matches the target after correction and fails a distinct one", () => {
    const target = rgbToLab(hexToRgb("#1f4e9c"));
    const neutral: [number, number, number] = [230, 230, 230];
    const pass = checkColor(hexToRgb("#1f4e9c"), neutral, neutral, target, 3);
    expect(pass.verdict).toBe("pass");
    const fail = checkColor(hexToRgb("#2a2a2a"), neutral, neutral, target, 3);
    expect(fail.verdict).toBe("fail");
    expect(fail.deltaE).toBeGreaterThan(10);
  });
});

describe("sampleRegion", () => {
  it("averages the pixels inside the region and clamps at edges", () => {
    const w = 4, h = 4;
    const buf = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) buf.set([i < 8 ? 100 : 200, 50, 0, 255], i * 4);
    expect(sampleRegion(buf, w, h, 1, 0, 1)).toEqual([100, 50, 0]);
    expect(sampleRegion(buf, w, h, 3, 3, 0)).toEqual([200, 50, 0]);
  });
});
