import type { NextRequest } from "next/server";
import { startWork } from "@/application/fulfillment";
import { VersionInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/start">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const { expectedVersion } = await parseBody(req, VersionInput);
    await startWork(await currentMerchant(), id, expectedVersion);
  });
}
