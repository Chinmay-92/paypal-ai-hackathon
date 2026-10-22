import type { NextRequest } from "next/server";
import { readAttachment } from "@/application/attachments";
import { currentCustomer, currentMerchant, errorResponse } from "@/server/http";

// Private file download: the merchant's tenant or that job's customer session only.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    const actor = await currentMerchant().catch(() => currentCustomer());
    const file = await readAttachment(actor, id);
    const inline = file.content_type.startsWith("image/");
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.content_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ETag: `"${file.sha256}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
