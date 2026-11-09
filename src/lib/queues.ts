import { Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";
import type { PipelineJobData } from "./types.js";

export const QUEUE_NAMES = {
  objectCreate: "object-create",
  s3Upload: "s3-upload",
  ingest: "ingest",
  quota: "quota",
} as const;
export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
export const queuePrefix = process.env.QUEUE_PREFIX ?? "worker-blog-demo";
const connection = createRedisConnection();
const queues = new Map<QueueName, Queue<PipelineJobData>>();

export function getQueue(name: QueueName) {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue<PipelineJobData>(name, {
      connection,
      prefix: queuePrefix,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
    queues.set(name, queue);
  }
  return queue;
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map(queue => queue.close()));
  await connection.quit();
}
