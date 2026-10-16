import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decide,
  emptyUsage,
  record,
  DEFAULT_PACING,
  type Usage,
} from "../src/automation/pacing.js";

const NOON = new Date("2026-10-16T12:00:00.000Z");

function used(surface: "invitation" | "message" | "post", times: number, now = NOON): Usage {
  let usage = emptyUsage(now);
  for (let i = 0; i < times; i += 1) usage = record(usage, surface, now);
  return usage;
}

test("a fresh day permits the first invitation", () => {
  const decision = decide(emptyUsage(NOON), "invitation", NOON, DEFAULT_PACING);
  assert.equal(decision.ok, true);
});

test("the daily invitation allowance is refused at its limit, not beyond it", () => {
  const limit = DEFAULT_PACING.invitation.perDay;
  const allowed = decide(used("invitation", limit - 1), "invitation", NOON, DEFAULT_PACING);
  const refused = decide(used("invitation", limit), "invitation", NOON, DEFAULT_PACING);
  assert.equal(allowed.ok, true);
  assert.equal(refused.ok, false);
});

test("a refused action explains itself and is classified as rate limiting", () => {
  const decision = decide(
    used("invitation", DEFAULT_PACING.invitation.perDay),
    "invitation",
    NOON,
    DEFAULT_PACING,
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.class, "rate");
  assert.match(decision.ok === false ? decision.reason : "", /daily/i);
});

test("a spent week refuses a fresh day, so the weekly ceiling is enforced independently of the day", () => {
  const weekly = DEFAULT_PACING.invitation.perWeek;
  let usage = emptyUsage(new Date(Date.UTC(2026, 9, 12, 8, 0, 0)));
  // Three individually-legal days are enough to exceed the weekly ceiling.
  for (let day = 0; day < 3; day += 1) {
    const when = new Date(Date.UTC(2026, 9, 12 + day, 8, 0, 0));
    for (let i = 0; i < DEFAULT_PACING.invitation.perDay; i += 1) {
      usage = record(usage, "invitation", when);
    }
  }
  assert.equal(usage.invitation.week >= weekly, true);

  // The next day is untouched, so only the weekly window can refuse it.
  const nextDay = new Date(Date.UTC(2026, 9, 15, 9, 0, 0));
  const decision = decide(usage, "invitation", nextDay, DEFAULT_PACING);
  assert.equal(decision.ok, false);
  assert.match(decision.ok === false ? decision.reason : "", /week/i);
});

test("counters roll over when the day changes", () => {
  const yesterday = new Date("2026-10-15T09:00:00.000Z");
  const today = new Date("2026-10-16T09:00:00.000Z");
  let usage = emptyUsage(yesterday);
  for (let i = 0; i < DEFAULT_PACING.invitation.perDay; i += 1) {
    usage = record(usage, "invitation", yesterday);
  }
  assert.equal(decide(usage, "invitation", yesterday, DEFAULT_PACING).ok, false);
  const rolled = decide(usage, "invitation", today, DEFAULT_PACING);
  assert.equal(rolled.ok, true, "yesterday's exhausted day must not block today");
});

test("surfaces are budgeted independently, so posting cannot spend the invitation allowance", () => {
  const usage = used("post", DEFAULT_PACING.post.perDay);
  assert.equal(decide(usage, "post", NOON, DEFAULT_PACING).ok, false);
  assert.equal(decide(usage, "invitation", NOON, DEFAULT_PACING).ok, true);
});

test("counters are never mutated, so a decision cannot silently spend budget", () => {
  const before = used("invitation", 3);
  const snapshot = JSON.stringify(before);
  decide(before, "invitation", NOON, DEFAULT_PACING);
  record(before, "invitation", NOON);
  assert.equal(JSON.stringify(before), snapshot);
});
