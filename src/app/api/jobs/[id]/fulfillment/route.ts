import type { NextRequest } from "next/server";
import { fulfillmentSheet } from "@/application/fulfillment";
import { currentMerchant, handle } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/fulfillment">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    return fulfillmentSheet(await currentMerchant(), id);
  });
}
