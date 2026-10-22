import type { NextRequest } from "next/server";
import { discardDraft } from "@/application/revisions";
import { VersionInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/revisions/[revisionId]/discard">) {
  return handle(req, async () => {
    const { id, revisionId } = await ctx.params;
    const { expectedVersion } = await parseBody(req, VersionInput);
    await discardDraft(await currentMerchant(), id, revisionId, expectedVersion);
  });
}
