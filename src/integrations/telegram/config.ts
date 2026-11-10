import { createHmac, timingSafeEqual } from "node:crypto";

export function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  return token;
}

// Derived from the bot token so a second secret is not required.
export function webhookSecret(token: string): string {
  return createHmac("sha256", token).update("pact-telegram-webhook-v1").digest("hex");
}

export function validWebhookSecret(actual: string | null): boolean {
  if (!actual || !process.env.TELEGRAM_BOT_TOKEN) return false;
  const expected = Buffer.from(webhookSecret(process.env.TELEGRAM_BOT_TOKEN));
  const supplied = Buffer.from(actual);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function botUsername(): Promise<string> {
  const token = botToken();
  // Do not include request URLs in errors: Telegram puts the token in the path.
  let data: { ok?: boolean; result?: { username?: string } };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    data = await response.json();
  } catch {
    throw new Error("Could not contact Telegram");
  }
  const username = data.result?.username;
  if (!data.ok || !username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error("Telegram bot is unavailable");
  return username;
}
