import type { NextRequest } from "next/server";
import { merchantJobView } from "@/application/jobs";
import { currentMerchant, handle } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const view = await merchantJobView(await currentMerchant(), id);
    // Operation rows are diagnostic; approval links are never stored in raw form.
    return view;
  });
}
