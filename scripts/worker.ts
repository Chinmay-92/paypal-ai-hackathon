import { processAnalysisOutbox } from "../src/application/changes";
import { processWebhookEvent, reconcileAll } from "../src/application/payments";
import { many, pool } from "../src/persistence/db";

async function main() {
  // Background loop: pending analysis, payment reconciliation and failed webhook retries.
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
  let stopping = false;
  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));

  async function tick() {
    const analyzed = await processAnalysisOutbox(20);
    const reconciled = await reconcileAll(30);
    const failedEvents = await many<{ provider_event_id: string }>(
      pool(),
      "SELECT provider_event_id FROM payment_events WHERE status IN ('FAILED', 'RECEIVED') AND attempts < 10 AND received_at < now() - interval '30 seconds' LIMIT 20",
    );
    for (const e of failedEvents) await processWebhookEvent(e.provider_event_id);
    console.log(JSON.stringify({ level: "info", category: "worker.tick", analyzed, ...reconciled, webhookRetries: failedEvents.length }));
  }

  while (!stopping) {
    await tick().catch((err) => console.error(JSON.stringify({ level: "error", category: "worker.tick", message: String(err?.message ?? err).slice(0, 200) })));
    if (process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  await pool().end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
