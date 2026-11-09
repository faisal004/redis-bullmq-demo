import type { Job } from "bullmq";
import { updatePipelineRun } from "../lib/mongo.js";
import { getQueue, QUEUE_NAMES } from "../lib/queues.js";
import type { PipelineJobData } from "../lib/types.js";

export async function processIngest(job: Job<PipelineJobData>) {
  const data = job.data;
  if (!data.s3Key) throw new Error("Missing mock storage key.");
  await updatePipelineRun(data.jobChainId, { status: "ingesting", pages: data.pages });
  // No Python service is called. The submitted page count is the mock result.
  await getQueue(QUEUE_NAMES.quota).add("quota", data, {
    jobId: `${data.jobChainId}-quota`,
  });
}
