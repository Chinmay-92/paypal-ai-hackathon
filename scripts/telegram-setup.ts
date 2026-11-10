import { botToken, webhookSecret } from "../src/integrations/telegram/config";

const token = botToken();
const origin = process.env.APP_ORIGIN;
if (!token || !origin) throw new Error("Set TELEGRAM_BOT_TOKEN and APP_ORIGIN first");
const url = new URL("/api/telegram/webhook", origin);
if (url.protocol !== "https:") throw new Error("APP_ORIGIN must use HTTPS");
async function api(method: string, body?: object): Promise<{ ok: boolean; result?: { url?: string } }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(10000),
    });
    return await response.json();
  } catch { throw new Error("Telegram request failed"); }
}
async function main() {
  const existing = await api("getWebhookInfo");
  if (!existing.ok) throw new Error("Could not inspect the existing Telegram webhook");
  if (existing.result?.url && existing.result.url !== url.href) throw new Error("The bot already has a different webhook; inspect it before changing it");
  const result = await api("setWebhook", { url: url.href, secret_token: webhookSecret(token), allowed_updates: ["message"] });
  if (!result.ok) throw new Error("Telegram refused webhook setup");
  console.log("Telegram webhook configured.");
}
main().catch(() => { console.error("Telegram webhook setup failed; check the configuration and existing webhook."); process.exitCode = 1; });
