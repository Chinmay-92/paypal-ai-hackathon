import sharp from "sharp";
import { sampleRegion, type RGB } from "./color";

export type DecodedPhoto = {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Downscaled JPEG for the vision model (long edge ≤ 1568 px). */
  modelJpegBase64: string;
};

export async function decodePhoto(input: Buffer): Promise<DecodedPhoto> {
  // Apply EXIF orientation so tap coordinates from the browser match the pixels.
  const oriented = sharp(input, { failOn: "error" }).rotate();
  const { data, info } = await oriented.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const modelJpeg = await oriented
    .clone()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return {
    rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    modelJpegBase64: modelJpeg.toString("base64"),
  };
}

/** Samples a point given as fractions of the image size (what the browser reports). */
export function samplePoint(photo: DecodedPhoto, fx: number, fy: number): RGB {
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) throw new Error("Sample point must be inside the image");
  const radius = Math.max(2, Math.round(Math.min(photo.width, photo.height) * 0.01));
  return sampleRegion(photo.rgba, photo.width, photo.height, fx * (photo.width - 1), fy * (photo.height - 1), radius);
}
