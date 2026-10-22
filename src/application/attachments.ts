import { createHash } from "node:crypto";
import { one, pool, withTx } from "@/persistence/db";
import { audit, lockJob, newId } from "@/persistence/repo";
import { auditActor, requireOwner, type CustomerActor, type MerchantActor } from "./actors";
import { NotFoundError, UnprocessableError } from "./errors";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type AttachmentType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

/**
 * Detects the type from the file's bytes, never from its name or the
 * browser-declared type. SVG and anything else is refused.
 */
export function sniffType(bytes: Uint8Array): AttachmentType | null {
  const at = (i: number, sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

export type AttachmentMeta = { id: string; filename: string; contentType: AttachmentType; sizeBytes: number; sha256: string };

/** Stores an uploaded file as untrusted, immutable source material for one job. */
export async function uploadAttachment(
  actor: MerchantActor | CustomerActor,
  jobId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<AttachmentMeta> {
  if (actor.kind === "merchant") requireOwner(actor);
  if (file.bytes.length === 0) throw new UnprocessableError("The file is empty");
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) throw new UnprocessableError("Files must be 5 MB or smaller");
  const contentType = sniffType(file.bytes);
  if (!contentType) throw new UnprocessableError("Only PNG, JPEG, WebP images and PDF documents can be attached");
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const filename = safeFilename(file.name);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    if (actor.kind === "customer" && actor.jobId !== job.id) throw new NotFoundError("Job");
    const id = newId();
    const a = auditActor(actor);
    await tx.query(
      `INSERT INTO attachments (id, tenant_id, job_id, filename, content_type, size_bytes, sha256, data, uploaded_by_kind, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, job.tenant_id, job.id, filename, contentType, file.bytes.length, sha256, Buffer.from(file.bytes), actor.kind, a.actorId],
    );
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, ...a, action: "attachment.uploaded", details: { attachmentId: id, filename, contentType, sizeBytes: file.bytes.length, sha256 } });
    return { id, filename, contentType, sizeBytes: file.bytes.length, sha256 };
  });
}

/** Returns file bytes only to the job's merchant tenant or that job's customer session. */
export async function readAttachment(actor: MerchantActor | CustomerActor, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundError("File");
  const row = await one<{ job_id: string; filename: string; content_type: AttachmentType; data: Buffer; sha256: string }>(
    pool(),
    "SELECT job_id, filename, content_type, data, sha256 FROM attachments WHERE tenant_id = $1 AND id = $2",
    [actor.tenantId, id],
  );
  if (!row || (actor.kind === "customer" && row.job_id !== actor.jobId)) throw new NotFoundError("File");
  return row;
}

export async function listAttachments(tenantId: string, jobId: string) {
  const res = await pool().query(
    "SELECT id, filename, content_type, size_bytes, sha256, message_id, uploaded_by_kind, created_at FROM attachments WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at",
    [tenantId, jobId],
  );
  return res.rows as { id: string; filename: string; content_type: AttachmentType; size_bytes: number; sha256: string; message_id: string | null; uploaded_by_kind: string; created_at: Date }[];
}
