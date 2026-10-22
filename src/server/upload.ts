import type { NextRequest } from "next/server";
import { MAX_ATTACHMENT_BYTES } from "@/application/attachments";
import { AppError } from "@/application/errors";

/** Reads one multipart "file" field with a size cap enforced before buffering the body. */
export async function readUpload(req: NextRequest): Promise<{ name: string; bytes: Uint8Array }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) throw new AppError(413, "TOO_LARGE", "Files must be 5 MB or smaller");
  const form = await req.formData().catch(() => {
    throw new AppError(400, "BAD_REQUEST", "Expected a multipart form with a file");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(400, "BAD_REQUEST", "Expected a file field named \"file\"");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError(413, "TOO_LARGE", "Files must be 5 MB or smaller");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
