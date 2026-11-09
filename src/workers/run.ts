import { setTimeout as delay } from "node:timers/promises";
import { Worker, type Job } from "bullmq";
import { initDatabase, mongo, updatePipelineRun } from "../lib/mongo.js";
import { closeQueues, QUEUE_NAMES, queuePrefix } from "../lib/queues.js";
import { createRedisConnection } from "../lib/redis.js";
import type { PipelineJobData } from "../lib/types.js";
import { processObjectCreate } from "./object-create.js";
import { processS3Upload } from "./s3-upload.js";
import { processIngest } from "./ingest.js";
import { processQuota } from "./quota.js";

await initDatabase();
const connection = createRedisConnection(true);
const stageDelay = Number(process.env.STAGE_DELAY_MS ?? 1000);
if (!Number.isFinite(stageDelay) || stageDelay < 0) throw new Error("Invalid stage delay.");
const definitions = [
  [QUEUE_NAMES.objectCreate, processObjectCreate, 2],
  [QUEUE_NAMES.s3Upload, processS3Upload, 2],
  [QUEUE_NAMES.ingest, processIngest, 1],
  [QUEUE_NAMES.quota, processQuota, 1],
] as const;

const workers = definitions.map(([name, processor, concurrency]) => {
  const worker = new Worker<PipelineJobData>(name, async (job: Job<PipelineJobData>) => {
    console.log(`[${name}] active ${job.data.jobChainId}`);
    await delay(stageDelay);
    await processor(job);
  }, { connection, prefix: queuePrefix, concurrency });
  worker.on("error", error => console.error(`[${name}]`, error.message));
  worker.on("completed", job => console.log(`[${name}] completed ${job.data.jobChainId}`));
  worker.on("failed", (job, error) => {
    console.error(`[${name}] failed`, error.message);
    if (job) {
      void updatePipelineRun(job.data.jobChainId, { status: "failed", error: error.message })
        .catch(failure => console.error("Failed to save pipeline error:", failure.message));
    }
  });
  return worker;
});

console.log("Workers ready: object-create → s3-upload → ingest → quota");
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await Promise.all(workers.map(worker => worker.close()));
  await closeQueues();
  await connection.quit();
  await mongo.close();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void shutdown().catch(error => { console.error(error); process.exitCode = 1; }); });
}
