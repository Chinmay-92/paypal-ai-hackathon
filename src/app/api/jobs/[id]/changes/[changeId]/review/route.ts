import type { NextRequest } from "next/server";
import { reviewChangeRequest } from "@/application/changes";
import { ReviewChangeInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/changes/[changeId]/review">) {
  return handle(req, async () => {
    const { id, changeId } = await ctx.params;
    const result = await reviewChangeRequest(await currentMerchant(), id, changeId, await parseBody(req, ReviewChangeInput));
    return { status: result.status, revisionId: "draft" in result ? result.draft?.id : undefined };
  });
}
