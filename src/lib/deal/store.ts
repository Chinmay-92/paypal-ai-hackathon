import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Deal } from "./types";

// File-backed store for local development and the self-hosted demo. Writes are
// atomic (temp file + rename). Swap for a database before running multiple instances.

const DATA_DIR = process.env.SPECLOCK_DATA_DIR ?? path.join(process.cwd(), ".data", "deals");

function filePath(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid deal id: ${id}`);
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveDeal(deal: Deal): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const target = filePath(deal.id);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(deal, null, 2));
  await rename(tmp, target);
}

export async function loadDeal(id: string): Promise<Deal | null> {
  try {
    return JSON.parse(await readFile(filePath(id), "utf8")) as Deal;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// Serialize mutations per deal within this process so concurrent requests
// (e.g. a double-clicked "release") can't interleave read-modify-write cycles.
const locks = new Map<string, Promise<unknown>>();

export async function withDeal<T>(id: string, fn: (deal: Deal) => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const run = previous.then(async () => {
    const deal = await loadDeal(id);
    if (!deal) throw new DealNotFoundError(id);
    try {
      return await fn(deal);
    } finally {
      await saveDeal(deal);
    }
  });
  locks.set(id, run.catch(() => undefined));
  return run;
}

export class DealNotFoundError extends Error {
  constructor(id: string) {
    super(`Deal ${id} not found`);
  }
}
