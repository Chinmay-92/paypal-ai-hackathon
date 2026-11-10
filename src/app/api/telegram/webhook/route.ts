import { processAnalysisOutbox } from "@/application/changes";
import { receiveTelegramUpdate } from "@/application/telegram";
import { validWebhookSecret } from "@/integrations/telegram/config";

export async function POST(req: Request) {
  if (!validWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) return new Response(null, { status: 403 });
  const raw = await req.text();
  if (raw.length > 32000) return new Response(null, { status: 413 });
  try {
    const accepted = await receiveTelegramUpdate(JSON.parse(raw));
    if (accepted) await processAnalysisOutbox(3).catch(() => undefined);
    return Response.json({ ok: true });
  } catch {
    // Telegram retries failed deliveries; never log the update or bot token.
    return new Response(null, { status: 503 });
  }
}
