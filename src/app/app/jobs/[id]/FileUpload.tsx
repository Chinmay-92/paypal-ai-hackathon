"use client";

import { useRouter } from "next/navigation";
import { FilePicker } from "@/ui/FilePicker";

/** Adds a file to the job without a message, e.g. artwork received by email. Images become selectable artwork for this job. */
export function FileUpload({ jobId }: { jobId: string }) {
  const router = useRouter();
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <FilePicker id={`job-file-${jobId}`} url={`/api/jobs/${jobId}/attachments`} label="Add a file to this job" onUploaded={() => router.refresh()} />
    </div>
  );
}
