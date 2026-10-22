import type { NextRequest } from "next/server";
import { addMessage, processAnalysisOutbox } from "@/application/changes";
import { AddMessageInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/messages">) {
  return handle(
    req,
    async () => {
      const { id } = await ctx.params;
      const result = await addMessage(await currentMerchant(), id, await parseBody(req, AddMessageInput));
      // Analysis is durable in the outbox; run it now so the reviewer sees it immediately.
      await processAnalysisOutbox(3).catch(() => undefined);
      return result;
    },
    { status: 201 },
  );
}
