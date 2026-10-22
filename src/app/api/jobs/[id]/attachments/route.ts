import type { NextRequest } from "next/server";
import { uploadAttachment } from "@/application/attachments";
import { currentMerchant, handle } from "@/server/http";
import { readUpload } from "@/server/upload";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/attachments">) {
  return handle(
    req,
    async () => {
      const { id } = await ctx.params;
      return uploadAttachment(await currentMerchant(), id, await readUpload(req));
    },
    { status: 201 },
  );
}
