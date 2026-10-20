import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as z from 'zod/v4';

const demoPath = resolve(process.cwd(), 'fixtures/demo-store.json');
const defaultPath = resolve(process.cwd(), '../.data/pact-mcp-store.json');

const Message = z.object({
  id: z.string(), author: z.string(), receivedAt: z.string(), body: z.string()
});
const Draft = z.object({
  id: z.string(), baseRevision: z.number().int(), status: z.literal('merchant_review_required'),
  createdAt: z.string(), rationale: z.string(),
  changes: z.array(z.object({ field: z.string(), oldValue: z.string(), proposedValue: z.string(), sourceMessageId: z.string(), sourceQuote: z.string() }))
});
const Job = z.object({
  id: z.string(), customer: z.string(), domain: z.string(), currency: z.string(), revision: z.number().int(),
  scope: z.record(z.string(), z.string()), editableFields: z.array(z.string()), messages: z.array(Message), drafts: z.array(Draft)
});
const Store = z.object({ jobs: z.array(Job) });
export type PactJob = z.infer<typeof Job>;
export type ChangeDraft = z.infer<typeof Draft>;
type StoreData = z.infer<typeof Store>;

export class PactStore {
  readonly path: string;
  private writeTail: Promise<void> = Promise.resolve();
  private initPromise?: Promise<void>;

  constructor(path = process.env.PACT_MCP_STORE ?? defaultPath) {
    this.path = resolve(path);
  }

  async init(): Promise<void> {
    this.initPromise ??= (async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      try {
        await readFile(this.path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        try {
          await writeFile(this.path, await readFile(demoPath, 'utf8'), { flag: 'wx', mode: 0o600 });
        } catch (writeError) {
          if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        }
      }
    })();
    await this.initPromise;
  }

  private async read(): Promise<StoreData> {
    await this.init();
    return Store.parse(JSON.parse(await readFile(this.path, 'utf8')));
  }

  async listJobs() {
    const data = await this.read();
    return data.jobs.map(({ id, customer, domain, currency, revision, drafts }) => ({
      id, customer, domain, currency, revision, pendingDrafts: drafts.filter((draft) => draft.status === 'merchant_review_required').length
    }));
  }

  async getJob(id: string): Promise<PactJob | undefined> {
    return (await this.read()).jobs.find((job) => job.id === id);
  }

  async createDraft(input: {
    jobId: string; baseRevision: number; sourceMessageId: string;
    changes: Array<{ field: string; proposedValue: string; sourceQuote: string }>;
    rationale: string;
  }): Promise<ChangeDraft> {
    let created!: ChangeDraft;
    const operation = async () => {
      const data = await this.read();
      const job = data.jobs.find((item) => item.id === input.jobId);
      if (!job) throw new Error('Job not found.');
      if (job.revision !== input.baseRevision) throw new Error(`Stale revision: current revision is ${job.revision}. Fetch the job again before drafting.`);
      const message = job.messages.find((item) => item.id === input.sourceMessageId);
      if (!message) throw new Error('Source message is not attached to this job.');
      if (input.changes.length === 0) throw new Error('At least one proposed change is required.');
      const seen = new Set<string>();
      const changes = input.changes.map((change) => {
        if (!job.editableFields.includes(change.field) || !(change.field in job.scope)) throw new Error(`Field is not editable: ${change.field}`);
        if (seen.has(change.field)) throw new Error(`Duplicate field: ${change.field}`);
        seen.add(change.field);
        if (!change.sourceQuote.trim() || !message.body.includes(change.sourceQuote)) throw new Error(`Evidence quote does not exactly match source message for ${change.field}.`);
        if (!change.proposedValue.trim() || change.proposedValue.length > 500) throw new Error(`Invalid proposed value for ${change.field}.`);
        return { ...change, oldValue: job.scope[change.field]!, sourceMessageId: message.id };
      });
      created = Draft.parse({
        id: randomUUID(), baseRevision: job.revision, status: 'merchant_review_required', createdAt: new Date().toISOString(),
        rationale: input.rationale.slice(0, 1000), changes
      });
      job.drafts.push(created);
      const tempPath = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(tempPath, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
      await rename(tempPath, this.path);
    };
    const next = this.writeTail.then(operation);
    this.writeTail = next.catch(() => undefined);
    await next;
    return created;
  }
}
