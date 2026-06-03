// Pure decision function for the dossier poll loop, extracted from DossierView so the
// state machine (stop on terminal status, bound the wait, retry transient failures with
// backoff) is testable without a DOM or fake timers.
//
// outcome: "ok" (a response arrived) | "error" (the fetch threw)
// Returns one of:
//   { type: "stop" }                  terminal status — stop polling
//   { type: "timeout" }               still building but past the deadline
//   { type: "give-up" }               too many consecutive failures / past deadline
//   { type: "schedule", delay }       poll again after `delay` ms
export function nextPollAction({
  outcome,
  status,
  now,
  deadline,
  failures,
  maxFailures = 5,
  pollMs = 1500,
}) {
  if (outcome === "ok") {
    if (status !== "building") return { type: "stop" };
    if (now >= deadline) return { type: "timeout" };
    return { type: "schedule", delay: pollMs };
  }
  // A transient failure mid-build should not kill the loop; retry with backoff until we
  // exhaust retries or pass the deadline.
  if (now < deadline && failures < maxFailures) {
    return { type: "schedule", delay: pollMs * Math.min(failures + 1, 4) };
  }
  return { type: "give-up" };
}
