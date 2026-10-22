import type { NextRequest } from "next/server";
import { uploadAttachment } from "@/application/attachments";
import { currentCustomer, handle, rateLimit } from "@/server/http";
import { readUpload } from "@/server/upload";

export async function POST(req: NextRequest) {
  return handle(
    req,
    async () => {
      rateLimit(req, "portal-upload", 10);
      const actor = await currentCustomer();
      return uploadAttachment(actor, actor.jobId, await readUpload(req));
    },
    { status: 201 },
  );
}
