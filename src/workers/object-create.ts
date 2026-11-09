import type { Job } from "bullmq";
import { updatePipelineRun } from "../lib/mongo.js";
import { getQueue, QUEUE_NAMES } from "../lib/queues.js";
import type { PipelineJobData } from "../lib/types.js";

export async function processObjectCreate(job: Job<PipelineJobData>) {
  const data = job.data;
  await updatePipelineRun(data.jobChainId, { status: "creating" });
  if (data.simulateFailure) throw new Error("Simulated failure. Use Retry to clear it and continue.");

  // Stable mock IDs let a replay reuse the same logical document.
  const caseId = `case-${data.jobChainId}`;
  const documentId = `doc-${data.jobChainId}`;
  await updatePipelineRun(data.jobChainId, { caseId, documentId });
  const next = { ...data, caseId, documentId };
  await getQueue(QUEUE_NAMES.s3Upload).add("s3-upload", next, {
    jobId: `${data.jobChainId}-s3`,
  });
}
