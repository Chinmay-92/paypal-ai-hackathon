import type { NextRequest } from "next/server";
import { z } from "zod";
import { publishRevision } from "@/application/revisions";
import { appOrigin, currentMerchant, handle, parseBody } from "@/server/http";

const Input = z.object({ expectedVersion: z.number().int(), confirmFeasibility: z.boolean().optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/revisions/[revisionId]/publish">) {
  return handle(req, async () => {
    const { id, revisionId } = await ctx.params;
    const { revision, invitationToken } = await publishRevision(await currentMerchant(), id, revisionId, await parseBody(req, Input));
    // The raw link is returned once for the merchant to send; only its hash is stored.
    return { revisionId: revision.id, reviewUrl: `${appOrigin(req)}/review/${invitationToken}` };
  });
}
