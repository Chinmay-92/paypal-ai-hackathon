import type { NextRequest } from "next/server";
import { createJob, listJobs } from "@/application/jobs";
import { CreateJobInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function GET(req: NextRequest) {
  return handle(req, async () => ({ jobs: await listJobs(await currentMerchant()) }));
}

export async function POST(req: NextRequest) {
  return handle(
    req,
    async () => {
      const actor = await currentMerchant();
      const { job, draft } = await createJob(actor, await parseBody(req, CreateJobInput));
      return { jobId: job.id, revisionId: draft.id, version: job.version };
    },
    { status: 201 },
  );
}
