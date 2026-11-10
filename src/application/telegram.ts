import { z } from "zod";
import { addMessageInTx } from "./changes";
import { requireOwner, type MerchantActor } from "./actors";
import { ConflictError } from "./errors";
import { hashToken, newToken } from "./tokens";
import { one, withTx } from "@/persistence/db";
import { lockJob, newId } from "@/persistence/repo";

const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z.object({
    text: z.string().max(8000).optional(),
    chat: z.object({ id: z.number().int().safe(), type: z.string() }),
    from: z.object({ id: z.number().int().safe(), is_bot: z.boolean().optional() }).optional(),
  }).optional(),
});

export async function createTelegramLink(actor: MerchantActor, jobId: string, username: string): Promise<string> {
  requireOwner(actor);
  const token = newToken();
  await withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    if (!job.effective_revision_id && !job.pending_revision_id) throw new ConflictError("Publish the original agreement first");
    await tx.query("UPDATE telegram_links SET revoked_at = now() WHERE tenant_id = $1 AND job_id = $2 AND revoked_at IS NULL", [actor.tenantId, jobId]);
    await tx.query("INSERT INTO telegram_links (id, tenant_id, job_id, customer_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5,now() + interval '24 hours')", [newId(), actor.tenantId, jobId, job.customer_id, token.hash]);
  });
  return `https://t.me/${username}?start=${token.raw}`;
}

export async function receiveTelegramUpdate(raw: unknown): Promise<boolean> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return false;
  const update = parsed.data;
  return withTx(async (tx) => {
    const claimed = await tx.query("INSERT INTO telegram_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING update_id", [update.update_id]);
    if (!claimed.rowCount) return false;
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== "private" || !msg.from || msg.from.is_bot || msg.chat.id !== msg.from.id) return false;
    const text = msg.text.trim();
    const start = /^\/start\s+([A-Za-z0-9_-]{43})$/.exec(text);
    const chatId = String(msg.chat.id);
    const userId = String(msg.from.id);
    if (start) {
      const link = await one<{ id: string }>(tx, "SELECT id FROM telegram_links WHERE token_hash = $1 AND expires_at > now() AND connected_at IS NULL AND revoked_at IS NULL FOR UPDATE", [hashToken(start[1])]);
      if (!link) return false;
      await tx.query("UPDATE telegram_links SET revoked_at = now() WHERE chat_id = $1 AND telegram_user_id = $2 AND revoked_at IS NULL", [chatId, userId]);
      await tx.query("UPDATE telegram_links SET chat_id = $1, telegram_user_id = $2, connected_at = now(), expires_at = now() + interval '30 days' WHERE id = $3", [chatId, userId, link.id]);
      return false;
    }
    if (!text || text.startsWith("/")) return false;
    const link = await one<{ tenant_id: string; job_id: string; customer_id: string; customer_name: string }>(tx,
      `SELECT l.tenant_id, l.job_id, l.customer_id, c.name AS customer_name FROM telegram_links l
       JOIN customers c ON c.id = l.customer_id AND c.tenant_id = l.tenant_id
       WHERE l.chat_id = $1 AND l.telegram_user_id = $2 AND l.connected_at IS NOT NULL AND l.revoked_at IS NULL AND l.expires_at > now() FOR UPDATE OF l`, [chatId, userId]);
    if (!link) return false;
    await addMessageInTx(tx, { kind: "customer", tenantId: link.tenant_id, jobId: link.job_id, customerId: link.customer_id, invitationId: "telegram" }, link.job_id,
      { authorLabel: "Telegram sender", authorRole: "customer", body: text, attachmentIds: [] }, "telegram");
    return true;
  });
}
