import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import test from "node:test";

test("real queues: completion, failure/retry, accounting replay, and worker restart", { timeout: 55000 }, async () => {
  const suffix = randomUUID().replaceAll("-", "");
  process.env.DB_NAME = `worker_demo_test_${suffix}`;
  process.env.QUEUE_PREFIX = `worker-demo-test-${suffix}`;
  process.env.PORT = "3197";
  process.env.STAGE_DELAY_MS = "30";
  const { mongo, runs, organizations, DEMO_ORG_ID } = await import("../src/lib/mongo.js");
  const { getQueue, QUEUE_NAMES, closeQueues } = await import("../src/lib/queues.js");
  const children: ChildProcess[] = [];
  let logs = "";
  function start(file: string) {
    const child = spawn(process.execPath, ["--import", "tsx", file], { env: process.env });
    child.stdout?.on("data", data => { logs += data; });
    child.stderr?.on("data", data => { logs += data; });
    children.push(child);
    return child;
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
    for (let i = 0; i < 150; i++) {
      const value = await read();
      if (ready(value)) return value;
      await delay(100);
    }
    throw new Error(`Timed out waiting for pipeline.\n${logs}`);
  }
  const base = "http://127.0.0.1:3197";
  async function post(path: string, body: unknown) {
    return fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }
  async function submit(pages: number, simulateFailure = false) {
    const response = await post("/api/drive/webhook", { fileName: "example.pdf", pages, simulateFailure });
    assert.equal(response.status, 202);
    return (await response.json() as { jobChainId: string }).jobChainId;
  }
  const waitRun = (id: string, status: string) => until(
    () => runs.findOne({ _id: id }), run => run?.status === status,
  );

  try {
    start("src/server.ts");
    let worker = start("src/workers/run.ts");
    await until(async () => {
      try { return (await fetch(`${base}/api/runs`)).ok; } catch { return false; }
    }, Boolean);
    assert.equal((await post("/api/drive/webhook", { fileName: "../bad.pdf" })).status, 400);
    const foreignOrigin = await fetch(`${base}/api/drive/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.invalid" },
      body: JSON.stringify({ fileName: "example.pdf" }),
    });
    assert.equal(foreignOrigin.status, 403);

    const first = await submit(7);
    const completed = await waitRun(first, "done");
    assert.equal(completed?.pages, 7);
    assert.ok(completed?.documentId && completed.s3Key);
    assert.equal((await organizations.findOne({ _id: DEMO_ORG_ID }))?.pagesUsed, 7);

    const failed = await submit(3, true);
    await waitRun(failed, "failed");
    assert.equal((await post(`/api/runs/${failed}/retry`, {})).status, 200);
    await waitRun(failed, "done");
    const quotaJob = await getQueue(QUEUE_NAMES.quota).getJob(`${first}-quota`);
    assert.ok(quotaJob);
    const replay = await getQueue(QUEUE_NAMES.quota).add("quota", quotaJob.data, { jobId: `${first}-replay` });
    await until(() => replay.getState(), state => state === "completed");
    assert.equal((await organizations.findOne({ _id: DEMO_ORG_ID }))?.pagesUsed, 10);

    await stop(worker);
    const waiting = await submit(2);
    await delay(150);
    assert.equal((await runs.findOne({ _id: waiting }))?.status, "pending");
    worker = start("src/workers/run.ts");
    await waitRun(waiting, "done");
    assert.equal((await organizations.findOne({ _id: DEMO_ORG_ID }))?.pagesUsed, 12);
  } finally {
    await Promise.all(children.map(stop));
    for (const name of Object.values(QUEUE_NAMES)) await getQueue(name).obliterate();
    await closeQueues();
    await mongo.db(process.env.DB_NAME).dropDatabase();
    await mongo.close();
  }
});
