# Redis + BullMQ: a document pipeline you can watch

A clean, standalone companion to [Moving Our Document Upload Pipeline to Background Workers](https://faisalhusa.in/blog/background-workers-with-redis-and-bullmq).

Simulate a file appearing in a connected folder. The API records a run, adds a BullMQ job, and returns **202 Accepted**. A separate worker process carries the document through four queues. Close the browser: the workers keep going.

**No cloud credentials, private source code, or private repository history are included.** Everything uses synthetic data and local services.

```mermaid
sequenceDiagram
    actor Person
    participant API as Local API / producer
    participant Redis as Redis / BullMQ
    participant Workers as Worker runner
    participant Mongo as MongoDB
    Person->>API: Simulate a new file
    API->>Mongo: Create pending run
    API->>Redis: Enqueue object-create
    API-->>Person: 202 Accepted + chain ID
    Note over Person: Close the tab. Get coffee.
    Workers->>Redis: Claim object-create
    Workers->>Mongo: Save mock document identity
    Workers->>Redis: Enqueue s3-upload
    Workers->>Redis: Enqueue ingest after mock upload
    Workers->>Redis: Enqueue quota after mock ingestion
    Workers->>Mongo: Account for pages; mark done
    Person->>API: Check progress later
    API->>Mongo: Read pipeline run
    API-->>Person: Current status
```

## Run it

Requirements: **Node.js 22.9+**, npm, and Docker Desktop (or Docker Engine with Compose).

```bash
git clone https://github.com/faisal004/redis-bullmq-demo.git
cd redis-bullmq-demo
npm ci
cp .env.example .env
npm run demo
```

- Demo: **http://localhost:3100**
- Bull Board: **http://localhost:3100/queues**
- Redis: `127.0.0.1:6389`
- MongoDB: `127.0.0.1:27029`

The web server, Redis, and MongoDB bind to loopback. Redis uses AOF persistence and `noeviction`; both databases have named local Docker volumes. The queue prefix and database name separate this demo from unrelated projects.

To run the processes in separate terminals:

```bash
npm run infra
npm run web
```

```bash
npm run workers
```

The `.env` file is optional; defaults match Compose. If you change database ports in `.env`, update the Compose mappings too. `PORT` controls the web server only.

## Three things to try

1. **Happy path.** Submit a PDF or DOCX filename and a synthetic page count. Watch `pending → creating → uploading → ingesting → quota → done`. Compare it with Bull Board.
2. **Failure and retry.** Check **Fail at object creation**, then submit. The run fails without charging pages. Click **Clear simulated failure & retry** to reuse that chain and complete it. Unlike the app button, Bull Board's ordinary retry does not clear the failure flag.
3. **A request is not the worker.** Stop only the worker terminal. Submit a document; it stays pending. Restart the workers and watch it complete. Closing the browser does not remove queued jobs.

Stop the app with Ctrl+C. Stop infrastructure with `docker compose down`. Named volumes preserve demo data between restarts; `docker compose down --volumes` deletes **this Compose project's** demo data if you want a clean slate.

## What is real, what is simulated?

| Real | Simulated |
| --- | --- |
| Redis job state and BullMQ claiming/hand-offs | A drive file event; no OAuth or real provider webhook |
| Four workers, concurrency limits, failures, manual retries | Document IDs; no production case/document model |
| MongoDB pipeline progress and organization accounting | S3 signing and upload; `.invalid` URLs cannot be used |
| Separate web and worker processes | Python ingestion; the form supplies the page count |
| Bull Board inspecting the same queues | Preventive quota admission is **not implemented** |

No file bytes leave your computer. No AWS, OneDrive, Google Drive, Python, or authentication account is needed.

## Read the code in this order

| File | Role |
| --- | --- |
| [`src/server.ts`](src/server.ts) | Validates a synthetic event, records a run, awaits enqueue, returns 202; serves UI and Bull Board |
| [`src/lib/queues.ts`](src/lib/queues.ts) | Four named queues, bounded retention, shared queue prefix |
| [`src/lib/types.ts`](src/lib/types.ts) | Chain payload and MongoDB progress record |
| [`src/workers/run.ts`](src/workers/run.ts) | Starts the workers; logs stages; handles failure and graceful shutdown |
| [`src/workers/object-create.ts`](src/workers/object-create.ts) | Stable mock IDs, then enqueue upload |
| [`src/workers/s3-upload.ts`](src/workers/s3-upload.ts) | Mock storage destination, then enqueue ingestion |
| [`src/workers/ingest.ts`](src/workers/ingest.ts) | Mock processing result, then enqueue quota |
| [`src/workers/quota.ts`](src/workers/quota.ts) | Duplicate-safe per-chain demo accounting, then mark done |
| [`src/lib/redis.ts`](src/lib/redis.ts) | Fail-fast producer connection versus reconnecting worker connection |

The worker runner hosts four Worker instances in **one Node process**, separate from the web process. Concurrency is 2 for object creation and upload, 1 for ingestion and accounting. Each job waits one second before processing so transitions are visible. This is not CPU parallelism or four separately deployed services.

## Reliability boundaries

This is a teaching demo, not a production template:

- There is no authentication or real connector validation. Keep the dashboard local.
- MongoDB writes and Redis enqueues are separate operations. A crash between them can strand a run; there is no outbox or automatic reconciliation.
- Each incoming event gets a new chain ID. Repeated source events are not deduplicated.
- Stable stage job IDs suppress repeat enqueues only while a job remains in Redis. Each queue retains at most 200 completed and 200 failed jobs.
- Automatic attempts/backoff are not configured; failed jobs need manual retry.
- Accounting uses one conditional MongoDB update to increment pages and remember the charged chain together. Replaying the same quota job does not double-charge. That does not make the entire pipeline exactly-once.
- The per-organization `chargedRuns` array grows. A durable service needs a bounded usage-ledger design, atomic quota admission, and reservation reconciliation.
- The app's retry button is only for the deliberately failed object-creation stage. Bull Board can inspect and retry other failed stage jobs.

Use the blog for the discussion of polling external ingestion IDs, reservations, recovery, and real connector access control.

## Check it

```bash
npm run typecheck
npm test
npm run infra
npm run test:integration
```

The integration test starts its own web/worker processes on port 3197 and uses a unique MongoDB database and Redis queue prefix. It checks completion, validation, cross-origin rejection, manual retry, replay-safe accounting, and worker restart. It cleans up only its own test database and queues. Run one integration test process at a time.

## About this repository

This repository was authored separately for public education. It contains no copied private application files, customer data, credentials, deployment configuration, or inherited private commits. `.env.example` contains local demo addresses only; `.env` files are ignored by Git.

MIT licensed. Dependencies retain their own licenses.
