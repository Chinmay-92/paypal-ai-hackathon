import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('speaks MCP over stdio and exposes guarded Pact tools', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pact-mcp-protocol-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(process.cwd(), 'dist/src/index.js')],
    cwd: process.cwd(),
    env: { ...process.env, PACT_MCP_STORE: join(dir, 'store.json') },
    stderr: 'inherit'
  });
  const client = new Client({ name: 'pact-test-client', version: '0.1.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'create_amendment_draft', 'get_job_context', 'list_jobs'
    ]);
    const result = await client.callTool({ name: 'get_job_context', arguments: { jobId: 'job-apparel-001' } });
    assert.equal(result.isError, undefined);
    const body = result.content.find((item) => item.type === 'text');
    assert.ok(body && body.type === 'text' && body.text.includes('msg-1'));
    const draftResult = await client.callTool({ name: 'create_amendment_draft', arguments: {
      jobId: 'job-apparel-001', baseRevision: 3, sourceMessageId: 'msg-1',
      rationale: 'Customer requests a substitution and asks for its cost.',
      changes: [{ field: 'garment', proposedValue: '8 hoodies and 16 classic tees', sourceQuote: 'switch 8 of the 24 classic tees to hoodies' }]
    } });
    assert.equal(draftResult.isError, undefined);
    const refreshed = await client.callTool({ name: 'get_job_context', arguments: { jobId: 'job-apparel-001' } });
    const refreshedText = refreshed.content.find((item) => item.type === 'text');
    assert.ok(refreshedText && refreshedText.type === 'text');
    const job = JSON.parse(refreshedText.text) as { scope: { garment: string }; drafts: Array<{ status: string }> };
    assert.equal(job.scope.garment, 'Classic tee');
    assert.equal(job.drafts[0]?.status, 'merchant_review_required');
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
