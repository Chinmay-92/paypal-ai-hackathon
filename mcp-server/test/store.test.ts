import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PactStore } from '../src/store.js';

test('creates a cited amendment draft without changing the current scope', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pact-mcp-'));
  try {
    const store = new PactStore(join(dir, 'store.json'));
    const before = await store.getJob('job-apparel-001');
    const draft = await store.createDraft({
      jobId: 'job-apparel-001', baseRevision: 3, sourceMessageId: 'msg-1',
      rationale: 'The customer asks for a substitution and asks what it costs.',
      changes: [{ field: 'garment', proposedValue: '8 hoodies and 16 classic tees', sourceQuote: 'switch 8 of the 24 classic tees to hoodies' }]
    });
    const after = await store.getJob('job-apparel-001');
    assert.equal(draft.status, 'merchant_review_required');
    assert.equal(draft.changes[0]?.oldValue, 'Classic tee');
    assert.deepEqual(after?.scope, before?.scope);
    assert.equal(after?.drafts.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects fabricated evidence and stale revisions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pact-mcp-'));
  try {
    const store = new PactStore(join(dir, 'store.json'));
    const base = { jobId: 'job-apparel-001', sourceMessageId: 'msg-1', rationale: 'test', changes: [{ field: 'garment', proposedValue: 'Hoodie', sourceQuote: 'make it a hoodie' }] };
    await assert.rejects(store.createDraft({ ...base, baseRevision: 3 }), /does not exactly match/);
    await assert.rejects(store.createDraft({ ...base, baseRevision: 2 }), /Stale revision/);
    const unchanged = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8')) as { jobs: Array<{ drafts: unknown[] }> };
    assert.equal(unchanged.jobs[0]?.drafts.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('serializes concurrent draft writes instead of dropping one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pact-mcp-'));
  try {
    const store = new PactStore(join(dir, 'store.json'));
    const make = (field: 'garment' | 'deliveryDate', quote: string, value: string) => store.createDraft({
      jobId: 'job-apparel-001', baseRevision: 3, sourceMessageId: 'msg-1', rationale: 'parallel test',
      changes: [{ field, proposedValue: value, sourceQuote: quote }]
    });
    await Promise.all([
      make('garment', 'switch 8 of the 24 classic tees to hoodies', '8 hoodies'),
      make('deliveryDate', 'We need the order by November 18.', '2026-11-18')
    ]);
    assert.equal((await store.getJob('job-apparel-001'))?.drafts.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
