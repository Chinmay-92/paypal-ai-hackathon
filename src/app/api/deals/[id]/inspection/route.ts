import { z } from "zod";
import type { ShotPhoto } from "@/lib/ai/visionQc";
import { defaultDeps, submitInspection, type ColorSample } from "@/lib/deal/service";
import { handle } from "@/lib/http";
import { decodePhoto, samplePoint } from "@/lib/qc/image";

const Point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const ColorTaps = z.array(z.object({ fieldId: z.string(), shotId: z.string(), sample: Point, neutral: Point }));

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// multipart/form-data: one file per shot (field name = shot ID), plus "colorTaps",
// a JSON array of tap points on the product colour and the reference card's neutral patch.
export async function POST(req: Request, ctx: RouteContext<"/api/deals/[id]/inspection">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const taps = ColorTaps.parse(JSON.parse(String(form.get("colorTaps") ?? "[]")));

    const photos: ShotPhoto[] = [];
    const decoded = new Map<string, Awaited<ReturnType<typeof decodePhoto>>>();
    for (const [key, value] of form.entries()) {
      if (key === "colorTaps" || !(value instanceof File)) continue;
      if (value.size > MAX_PHOTO_BYTES) throw new z.ZodError([{ code: "custom", path: [key], message: "Photo larger than 4 MB", input: value.size }]);
      const photo = await decodePhoto(Buffer.from(await value.arrayBuffer()));
      decoded.set(key, photo);
      photos.push({ shotId: key, mediaType: "image/jpeg", base64: photo.modelJpegBase64 });
    }

    const colorSamples: ColorSample[] = taps.flatMap((tap) => {
      const photo = decoded.get(tap.shotId);
      if (!photo) return [];
      return [{
        fieldId: tap.fieldId,
        shotId: tap.shotId,
        sample: samplePoint(photo, tap.sample.x, tap.sample.y),
        neutral: samplePoint(photo, tap.neutral.x, tap.neutral.y),
      }];
    });

    return submitInspection(id, photos, colorSamples, await defaultDeps());
  });
}
