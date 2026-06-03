import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPollAction } from "./poll.js";

const base = { now: 1000, deadline: 100000, failures: 0, maxFailures: 5, pollMs: 1500 };

test("stops polling once the status is terminal", () => {
  for (const status of ["ready", "partial", "error"]) {
    assert.deepEqual(nextPollAction({ ...base, outcome: "ok", status }), { type: "stop" });
  }
});

test("keeps polling at steady cadence while building", () => {
  assert.deepEqual(nextPollAction({ ...base, outcome: "ok", status: "building" }), {
    type: "schedule",
    delay: 1500,
  });
});

test("times out when still building past the deadline", () => {
  assert.deepEqual(
    nextPollAction({ ...base, outcome: "ok", status: "building", now: 100001 }),
    { type: "timeout" }
  );
});

test("a transient failure mid-build retries with backoff, not death", () => {
  const a1 = nextPollAction({ ...base, outcome: "error", failures: 1 });
  assert.equal(a1.type, "schedule");
  assert.equal(a1.delay, 1500 * 2);
  const a3 = nextPollAction({ ...base, outcome: "error", failures: 3 });
  assert.equal(a3.delay, 1500 * 4); // backoff factor caps at 4
});

test("gives up after too many consecutive failures", () => {
  assert.deepEqual(nextPollAction({ ...base, outcome: "error", failures: 5 }), {
    type: "give-up",
  });
});

test("gives up on failure once past the deadline", () => {
  assert.deepEqual(
    nextPollAction({ ...base, outcome: "error", failures: 1, now: 100001 }),
    { type: "give-up" }
  );
});
