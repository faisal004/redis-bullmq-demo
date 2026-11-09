import assert from "node:assert/strict";
import test from "node:test";
import { parseFileEvent } from "../src/lib/validation.js";

test("accepts simulated PDF and DOCX events with deterministic defaults", () => {
  assert.deepEqual(parseFileEvent({ fileName: "report.pdf" }), {
    fileName: "report.pdf", pages: 12, simulateFailure: false,
  });
  assert.equal(parseFileEvent({ fileName: "brief.DOCX", pages: 3, simulateFailure: true }).pages, 3);
});

test("rejects unsupported files, paths, invalid counts, and malformed flags", () => {
  for (const input of [null, [], {}, { fileName: "../../secret.pdf" }, { fileName: "script.js" },
    { fileName: "report.pdf", pages: 0 }, { fileName: "report.pdf", pages: 1.5 },
    { fileName: "report.pdf", pages: "12" }, { fileName: "report.pdf", simulateFailure: "false" },
    { fileName: "a".repeat(121) + ".pdf" }]) {
    assert.throws(() => parseFileEvent(input));
  }
});
