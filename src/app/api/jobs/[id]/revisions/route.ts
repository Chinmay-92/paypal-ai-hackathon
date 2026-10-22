import type { NextRequest } from "next/server";
import { createManualDraft } from "@/application/revisions";
import { ManualRevisionInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/revisions">) {
  return handle(
    req,
    async () => {
      const { id } = await ctx.params;
      const draft = await createManualDraft(await currentMerchant(), id, await parseBody(req, ManualRevisionInput));
      return { revisionId: draft.id };
    },
    { status: 201 },
  );
}
