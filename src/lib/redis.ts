import { Redis } from "ioredis";

export function createRedisConnection(worker = false) {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6389", {
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    connectTimeout: 2000,
  });
  redis.on("error", () => console.error("Redis unavailable; check the local Redis service."));
  return redis;
}
