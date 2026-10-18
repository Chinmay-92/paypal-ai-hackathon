// Deterministic colour measurement. The vision model never judges colour by eye
// (VLMs are unreliable at it); instead we white-balance against a neutral patch
// on the reference card in frame and compute CIEDE2000 against the spec's Lab target.

export type RGB = [number, number, number]; // 0..255 sRGB
export type Lab = [number, number, number];

const D65_WHITE = [0.95047, 1.0, 1.08883] as const;

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

export function rgbToLab([r, g, b]: RGB): Lab {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / D65_WHITE[0];
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / D65_WHITE[1];
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / D65_WHITE[2];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Von Kries-style white balance in linear RGB: scale each channel so the measured
 * neutral patch maps to the patch's known reference value.
 */
export function whiteBalance(sample: RGB, measuredNeutral: RGB, referenceNeutral: RGB): RGB {
  return sample.map((c, i) => {
    const measured = srgbToLinear(measuredNeutral[i]);
    if (measured <= 0) throw new Error("Neutral patch is black; cannot white-balance");
    const gain = srgbToLinear(referenceNeutral[i]) / measured;
    return linearToSrgb(srgbToLinear(c) * gain);
  }) as RGB;
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp /= 2;
    else hbarp = h1p + h2p < 360 ? (hbarp + 360) / 2 : (hbarp - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  );
}

/** Mean colour of a square region in an RGBA buffer (row-major, 4 bytes per pixel). */
export function sampleRegion(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): RGB {
  const x0 = Math.max(0, Math.round(cx - radius));
  const x1 = Math.min(width - 1, Math.round(cx + radius));
  const y0 = Math.max(0, Math.round(cy - radius));
  const y1 = Math.min(height - 1, Math.round(cy + radius));
  if (x0 > x1 || y0 > y1) throw new Error("Sample region is outside the image");
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      r += rgba[i];
      g += rgba[i + 1];
      b += rgba[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

export type ColorCheck = {
  measuredLab: Lab;
  targetLab: Lab;
  deltaE: number;
  tolerance: number;
  verdict: "pass" | "fail";
};

export function checkColor(
  sample: RGB,
  measuredNeutral: RGB,
  referenceNeutral: RGB,
  targetLab: Lab,
  tolerance: number,
): ColorCheck {
  const measuredLab = rgbToLab(whiteBalance(sample, measuredNeutral, referenceNeutral));
  const deltaE = deltaE2000(measuredLab, targetLab);
  return { measuredLab, targetLab, deltaE, tolerance, verdict: deltaE <= tolerance ? "pass" : "fail" };
}
