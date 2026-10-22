import type { NextRequest } from "next/server";
import { reissueInvitation } from "@/application/revisions";
import { appOrigin, currentMerchant, handle } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/invitations">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const token = await reissueInvitation(await currentMerchant(), id);
    return { reviewUrl: `${appOrigin(req)}/review/${token}` };
  });
}
