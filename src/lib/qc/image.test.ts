import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodePhoto, samplePoint } from "./image";

describe("decodePhoto", () => {
  it("decodes pixels and samples colour at fractional points", async () => {
    // Left half navy, right half light grey.
    const width = 200, height = 100;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        raw.set(x < width / 2 ? [31, 58, 104] : [242, 242, 242], (y * width + x) * 3);
      }
    }
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const photo = await decodePhoto(png);
    expect([photo.width, photo.height]).toEqual([200, 100]);
    expect(samplePoint(photo, 0.2, 0.5)).toEqual([31, 58, 104]);
    expect(samplePoint(photo, 0.8, 0.5)).toEqual([242, 242, 242]);
    expect(photo.modelJpegBase64.length).toBeGreaterThan(100);
    expect(() => samplePoint(photo, 1.2, 0.5)).toThrow();
  });
});
