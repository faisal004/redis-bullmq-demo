import type { Job } from "bullmq";
import { organizations, updatePipelineRun } from "../lib/mongo.js";
import type { PipelineJobData } from "../lib/types.js";

export async function processQuota(job: Job<PipelineJobData>) {
  const data = job.data;
  await updatePipelineRun(data.jobChainId, { status: "quota" });
  // shortcut: charge IDs grow with demo runs; use a usage ledger for a long-lived service.
  await organizations.updateOne(
    { _id: data.orgId, chargedRuns: { $ne: data.jobChainId } },
    { $inc: { pagesUsed: data.pages }, $addToSet: { chargedRuns: data.jobChainId } },
  );
  await updatePipelineRun(data.jobChainId, { status: "done" });
}
