import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTelegramLink, receiveTelegramUpdate } from "../src/application/telegram";
import { validWebhookSecret, webhookSecret } from "../src/integrations/telegram/config";
import { closePool, one, pool } from "../src/persistence/db";
import { expectStatus, publishedJob, world, type World } from "./helpers";

let w: World;
beforeEach(async () => { w = await world(); });
afterAll(closePool);
const update = (id: number, sender: number, text: string, type = "private") => ({ update_id: id, message: { text, chat: { id: sender, type }, from: { id: sender, is_bot: false } } });

describe.each(["apparel", "website"] as const)("Telegram intake: %s", (domain) => {
  it("links one private sender and stores each update once, scoped to the job", async () => {
    const { jobId } = await publishedJob(w.owner, domain);
    await expectStatus(createTelegramLink(w.other, jobId, "example_bot"), 404);
    await expectStatus(createTelegramLink(w.team, jobId, "example_bot"), 403);
    const url = await createTelegramLink(w.owner, jobId, "example_bot");
    const secret = new URL(url).searchParams.get("start");
    await receiveTelegramUpdate(update(1, 101, `/start ${secret}`));
    expect(await receiveTelegramUpdate(update(2, 102, "Add ten more"))).toBe(false);
    expect(await receiveTelegramUpdate(update(3, 101, "Add ten more", "group"))).toBe(false);
    expect(await receiveTelegramUpdate(update(4, 101, "Add ten more"))).toBe(true);
    expect(await receiveTelegramUpdate(update(4, 101, "Add ten more"))).toBe(false);
    const row = await one<{ n: number }>(pool(), "SELECT count(*)::int n FROM source_messages WHERE job_id=$1 AND provenance='telegram'", [jobId]);
    expect(row?.n).toBe(1);
    await createTelegramLink(w.owner, jobId, "example_bot");
    expect(await receiveTelegramUpdate(update(5, 101, "Another change"))).toBe(false);
  });
});

describe("Telegram webhook authentication", () => {
  it("requires the derived secret and rejects other values", () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    expect(validWebhookSecret(null)).toBe(false);
    expect(validWebhookSecret("wrong")).toBe(false);
    expect(validWebhookSecret(webhookSecret("test-token"))).toBe(true);
    delete process.env.TELEGRAM_BOT_TOKEN;
  });
});
