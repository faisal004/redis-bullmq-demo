import type { Job } from "bullmq";
import { updatePipelineRun } from "../lib/mongo.js";
import { getQueue, QUEUE_NAMES } from "../lib/queues.js";
import type { PipelineJobData } from "../lib/types.js";

export async function processS3Upload(job: Job<PipelineJobData>) {
  const data = job.data;
  if (!data.caseId || !data.documentId) throw new Error("Missing document identity.");
  await updatePipelineRun(data.jobChainId, { status: "uploading" });

  const s3Key = `${data.orgId}/${data.caseId}/${data.documentId}/${data.fileName}`;
  // .invalid is reserved: this URL is deliberately not a real storage endpoint.
  const signedUrl = `https://storage.invalid/upload?key=${encodeURIComponent(s3Key)}`;
  await updatePipelineRun(data.jobChainId, { s3Key });
  const next = { ...data, s3Key, signedUrl };
  await getQueue(QUEUE_NAMES.ingest).add("ingest", next, {
    jobId: `${data.jobChainId}-ingest`,
  });
}
