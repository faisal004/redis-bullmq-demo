import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { DEMO_ORG_ID, initDatabase, mongo, organizations, runs } from "./lib/mongo.js";
import { closeQueues, getQueue, QUEUE_NAMES } from "./lib/queues.js";
import { parseFileEvent } from "./lib/validation.js";
import type { PipelineJobData } from "./lib/types.js";

await initDatabase();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4kb" }));
// Local demo controls must not accept cross-origin browser requests.
app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}`) {
    response.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }
  next();
});

const board = new ExpressAdapter();
board.setBasePath("/queues");
createBullBoard({
  queues: Object.values(QUEUE_NAMES).map(name => new BullMQAdapter(getQueue(name))),
  serverAdapter: board,
});
app.use("/queues", board.getRouter());
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

app.get("/api/runs", async (_request, response) => {
  const [recent, org] = await Promise.all([
    runs.find({ orgId: DEMO_ORG_ID }).sort({ createdAt: -1 }).limit(25).toArray(),
    organizations.findOne({ _id: DEMO_ORG_ID }, { projection: { pagesUsed: 1 } }),
  ]);
  response.json({ runs: recent, org });
});

app.post("/api/drive/webhook", async (request, response) => {
  let input: ReturnType<typeof parseFileEvent>;
  try { input = parseFileEvent(request.body); }
  catch (error) {
    response.status(400).json({ error: (error as Error).message });
    return;
  }
  const jobChainId = randomUUID();
  const orgId = DEMO_ORG_ID;
  const driveFileId = `mock-${jobChainId}`;
  const { fileName, pages, simulateFailure } = input;
  const jobData: PipelineJobData = { jobChainId, orgId, driveFileId, fileName, pages, simulateFailure };
  const now = new Date();
  await runs.insertOne({
    _id: jobChainId, jobChainId, orgId, driveFileId, fileName,
    status: "pending", createdAt: now, updatedAt: now,
  });
  await getQueue(QUEUE_NAMES.objectCreate).add("object-create", jobData, {
    jobId: `${jobChainId}-object`,
  });
  response.status(202).json({ jobChainId, driveFileId, fileName, status: "pending" });
});

app.get("/api/jobs/:id", async (request, response) => {
  const run = await runs.findOne({ _id: request.params.id, orgId: DEMO_ORG_ID });
  response.status(run ? 200 : 404).json(run ?? { error: "Run not found." });
});

app.post("/api/runs/:id/retry", async (request, response) => {
  const job = await getQueue(QUEUE_NAMES.objectCreate).getJob(`${request.params.id}-object`);
  if (!job || await job.getState() !== "failed") {
    response.status(409).json({ error: "Only failed object-create jobs can be retried here." });
    return;
  }
  await job.updateData({ ...job.data, simulateFailure: false });
  await runs.updateOne({ _id: request.params.id }, {
    $set: { status: "pending", updatedAt: new Date() }, $unset: { error: "" },
  });
  await job.retry();
  response.json({ status: "pending" });
});

app.use((error: Error & { status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error.status === 400 || error.status === 413) {
    response.status(error.status).json({ error: "Invalid or oversized JSON request." });
    return;
  }
  console.error("Request failed:", error.message);
  response.status(503).json({ error: "Local service unavailable. Check Redis, MongoDB, and the terminal." });
});

const server = app.listen(Number(process.env.PORT ?? 3100), "127.0.0.1", () => {
  console.log(`Demo: http://localhost:${process.env.PORT ?? 3100} · Queues: /queues`);
});
server.on("error", error => { console.error(error.message); process.exit(1); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeQueues();
  await mongo.close();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void shutdown().catch(error => { console.error(error); process.exitCode = 1; }); });
}
