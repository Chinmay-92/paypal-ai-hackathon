import type { NextRequest } from "next/server";
import { resolveCaptureReview } from "@/application/payments";
import { ResolveCaptureInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/captures/[id]/resolve">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const input = await parseBody(req, ResolveCaptureInput);
    await resolveCaptureReview(await currentMerchant(), id, input.resolution, input.note);
  });
}
