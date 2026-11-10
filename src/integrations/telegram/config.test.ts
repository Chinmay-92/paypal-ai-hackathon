import { afterEach, describe, expect, it, vi } from "vitest";
import { validWebhookSecret, webhookSecret } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("Telegram webhook authentication", () => {
  it("accepts only the secret derived from the configured bot token", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "example-token");
    expect(validWebhookSecret(null)).toBe(false);
    expect(validWebhookSecret("bad-secret")).toBe(false);
    expect(validWebhookSecret(webhookSecret("other-token"))).toBe(false);
    expect(validWebhookSecret(webhookSecret("example-token"))).toBe(true);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(validWebhookSecret(webhookSecret("example-token"))).toBe(false);
  });
});
