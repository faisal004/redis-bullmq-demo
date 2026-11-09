import { MongoClient } from "mongodb";
import type { Organization, PipelineRun } from "./types.js";

export const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27029", {
  serverSelectionTimeoutMS: 3000,
});
const db = mongo.db(process.env.DB_NAME ?? "worker_blog_demo");
export const runs = db.collection<PipelineRun>("runs");
export const organizations = db.collection<Organization>("organizations");
export const DEMO_ORG_ID = "demo-org";

export async function initDatabase() {
  await mongo.connect();
  await organizations.updateOne(
    { _id: DEMO_ORG_ID },
    { $setOnInsert: { pagesUsed: 0, chargedRuns: [] } },
    { upsert: true },
  );
}

export async function updatePipelineRun(jobChainId: string, update: Partial<PipelineRun>) {
  const result = await runs.updateOne(
    { _id: jobChainId },
    { $set: { ...update, updatedAt: new Date() } },
  );
  if (!result.matchedCount) throw new Error("Pipeline run not found.");
}
