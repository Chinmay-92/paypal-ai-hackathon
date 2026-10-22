import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readAttachment, safeFilename, sniffType, uploadAttachment } from "../src/application/attachments";
import { addMessage, analyzeChangeRequest } from "../src/application/changes";
import { closePool, one, pool } from "../src/persistence/db";
import type { ChangeRequestRow } from "../src/persistence/repo";
import { customer, expectStatus, publishedJob, world, type World } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%synthetic\n");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let w: World;
beforeEach(async () => {
  w = await world();
});
afterAll(closePool);

describe("attachment validation", () => {
  it("detects type from bytes and refuses anything else", () => {
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(PDF)).toBe("application/pdf");
    expect(sniffType(SVG)).toBeNull();
    expect(sniffType(new TextEncoder().encode("not really a png"))).toBeNull();
  });

  it("strips paths and odd characters from filenames", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\x\\logo<v2>.png")).toBe("logo_v2_.png");
  });

  it("rejects SVG, empty and oversized uploads", async () => {
    const { jobId } = await publishedJob(w.owner, "apparel");
    await expectStatus(uploadAttachment(w.owner, jobId, { name: "logo.svg", bytes: SVG }), 422);
    await expectStatus(uploadAttachment(w.owner, jobId, { name: "x.png", bytes: new Uint8Array() }), 422);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    await expectStatus(uploadAttachment(w.owner, jobId, { name: "big.png", bytes: big }), 422);
  });
});

describe("attachments in the amendment flow", () => {
  it("'use the attached logo' with one attached image proposes that exact file", async () => {
    const { jobId } = await publishedJob(w.owner, "apparel");
    const file = await uploadAttachment(w.owner, jobId, { name: "logo-v3.png", bytes: PNG });
    const { changeRequestId } = await addMessage(w.owner, jobId, {
      authorLabel: "Customer",
      authorRole: "customer",
      body: "Use the attached logo on everything.",
      attachmentIds: [file.id],
    });
    const cr = (await analyzeChangeRequest({ kind: "system", tenantId: w.owner.tenantId, reason: "test" }, changeRequestId)) as ChangeRequestRow;
    const proposal = cr.proposal as { proposedChanges: { field: string; proposedValue: unknown; supported: boolean }[] };
    expect(proposal.proposedChanges).toContainEqual(expect.objectContaining({ field: "artwork", proposedValue: `att:${file.id}`, supported: true }));
  });

  it("a file can be linked to only one message, and customers cannot claim merchant files", async () => {
    const { jobId, token } = await publishedJob(w.owner, "apparel");
    const file = await uploadAttachment(w.owner, jobId, { name: "proof.pdf", bytes: PDF });
    const c = await customer(token);
    await expectStatus(addMessage(c, jobId, { authorLabel: "Customer", authorRole: "customer", body: "See file", attachmentIds: [file.id] }), 422);
    await addMessage(w.owner, jobId, { authorLabel: "Customer", authorRole: "customer", body: "See file", attachmentIds: [file.id] });
    await expectStatus(addMessage(w.owner, jobId, { authorLabel: "Customer", authorRole: "customer", body: "Again", attachmentIds: [file.id] }), 422);
  });

  it("files are readable only by the tenant and that job's customer, and are immutable", async () => {
    const a = await publishedJob(w.owner, "apparel");
    const file = await uploadAttachment(w.owner, a.jobId, { name: "logo.png", bytes: PNG });
    const own = await customer(a.token);
    expect((await readAttachment(w.owner, file.id)).sha256).toBe(file.sha256);
    expect((await readAttachment(own, file.id)).content_type).toBe("image/png");
    await expectStatus(readAttachment(w.other, file.id), 404);
    const b = await publishedJob(w.owner, "website");
    await expectStatus(readAttachment(await customer(b.token), file.id), 404);
    await expect(pool().query("UPDATE attachments SET data = '\\x00' WHERE id = $1", [file.id])).rejects.toThrow(/immutable/);
    expect((await one<{ n: number }>(pool(), "SELECT count(*)::int AS n FROM audit_events WHERE action = 'attachment.uploaded'"))!.n).toBe(1);
  });
});
