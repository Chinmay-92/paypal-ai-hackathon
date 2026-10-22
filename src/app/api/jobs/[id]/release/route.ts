import type { NextRequest } from "next/server";
import { releaseWork } from "@/application/fulfillment";
import { VersionInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/release">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const { expectedVersion } = await parseBody(req, VersionInput);
    await releaseWork(await currentMerchant(), id, expectedVersion);
  });
}
