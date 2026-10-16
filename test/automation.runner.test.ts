import { test } from "node:test";
import assert from "node:assert/strict";

import { executePlan, type PlanEntry } from "../src/automation/runner.js";
import { createMemoryStore } from "../src/automation/store.js";
import { createFakeEngine, ok, fails } from "./fixtures/engine.js";

const AT = "2026-10-16T12:00:00.000Z";

function entry(over: Partial<PlanEntry> = {}): PlanEntry {
  return {
    campaignId: "q4-outreach",
    leadId: "lead-1",
    stepId: "invite",
    op: "sendConnectionInvitation",
    kind: "write",
    args: { profileId: "ana" },
    requiresConfirmation: true,
    verified: true,
    at: AT,
    ...over,
  };
}

test("a read runs, needs no confirmation, and records what happened", async () => {
  const client = createFakeEngine([ok({ firstName: "Ana" })]);
  const store = createMemoryStore();

  const outcomes = await executePlan(
    [entry({ op: "getProfile", kind: "read", args: { publicId: "ana" }, requiresConfirmation: false })],
    { client, store },
  );

  assert.equal(outcomes[0]?.status, "executed");
  assert.equal(client.calls[0]?.opts.allowWrites, false);
  assert.equal(await store.hasDone("lead-1", "q4-outreach", "invite"), true);
});

test("a write without confirmation is refused, spends nothing, and says why", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore();

  // The account gate is satisfied first so this test isolates the confirmation gate behind it.
  const outcomes = await executePlan([entry()], {
    client,
    store,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "refused");
  assert.match(outcomes[0]?.reason ?? "", /confirm/i);
  assert.equal(client.calls.length, 0, "a refused write must never reach the engine");
  assert.equal(await store.hasDone("lead-1", "q4-outreach", "invite"), false);
});

test("a confirmed write reaches the engine with writes permitted", async () => {
  const client = createFakeEngine([ok({ sent: true })]);
  const store = createMemoryStore();

  const outcomes = await executePlan([entry()], {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "executed");
  assert.equal(client.calls[0]?.opts.allowWrites, true);
  assert.equal(await store.hasDone("lead-1", "q4-outreach", "invite"), true);
});

test("an unverified write is refused even when the operator confirmed it", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore();

  const outcomes = await executePlan([entry({ verified: false })], {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "refused");
  assert.match(outcomes[0]?.reason ?? "", /unverified|observed/i);
  assert.equal(client.calls.length, 0);
});

test("an explicit override is the only way an unverified write runs", async () => {
  const client = createFakeEngine([ok({})]);
  const store = createMemoryStore();

  const outcomes = await executePlan([entry({ verified: false })], {
    client,
    store,
    confirm: () => true,
    allowUnverified: true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "executed");
});

test("a write whose outcome is unknown is recorded as unconfirmed and never retried", async () => {
  const client = createFakeEngine([fails("error", "timeout after send")]);
  const store = createMemoryStore();

  const outcomes = await executePlan([entry()], {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "unconfirmed");
  assert.equal(
    await store.hasDone("lead-1", "q4-outreach", "invite"),
    true,
    "an ambiguous write must block a retry",
  );
});

test("a write the server certainly rejected is recorded as failed so it can be retried", async () => {
  for (const cls of ["input", "refused", "auth", "rate", "blocked"] as const) {
    const client = createFakeEngine([fails(cls)]);
    const store = createMemoryStore();
    const outcomes = await executePlan([entry()], {
      client,
      store,
      confirm: () => true,
      account: "ana-test",
      allowedAccounts: ["ana-test"],
    });
    assert.equal(outcomes[0]?.status, "failed", `${cls} should be a definite failure`);
    assert.equal(await store.hasDone("lead-1", "q4-outreach", "invite"), false, cls);
  }
});

test("a failed read is recorded as failed and does not block a retry", async () => {
  const client = createFakeEngine([fails("drift", "template changed")]);
  const store = createMemoryStore();

  const outcomes = await executePlan(
    [entry({ kind: "read", requiresConfirmation: false, op: "getProfile" })],
    { client, store },
  );

  assert.equal(outcomes[0]?.status, "failed");
  assert.match(outcomes[0]?.reason ?? "", /template changed/);
  assert.equal(await store.hasDone("lead-1", "q4-outreach", "invite"), false);
});

test("an entry the planner skipped is recorded as skipped and never executed", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore();

  const outcomes = await executePlan([entry({ skipReason: "already done" })], {
    client,
    store,
    confirm: () => true,
  });

  assert.equal(outcomes[0]?.status, "skipped");
  assert.equal(client.calls.length, 0);
});

test("a failure carries api-anything's own remediation hint through to the operator", async () => {
  const client = createFakeEngine([
    { ok: false, class: "auth", reason: "session expired", next: "api-anything login linkedin", ms: 5 },
  ]);
  const store = createMemoryStore();

  const outcomes = await executePlan(
    [entry({ kind: "read", requiresConfirmation: false, op: "getMe" })],
    { client, store },
  );

  assert.equal(outcomes[0]?.next, "api-anything login linkedin");
});

test("every entry produces an outcome, so a run cannot silently drop work", async () => {
  const client = createFakeEngine([ok({}), ok({})]);
  const store = createMemoryStore();
  const plan = [
    entry({ stepId: "a", kind: "read", requiresConfirmation: false, op: "getMe" }),
    entry({ stepId: "b", skipReason: "already done" }),
    entry({ stepId: "c" }),
  ];

  const outcomes = await executePlan(plan, {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes.length, plan.length);
  assert.deepEqual(outcomes.map((o) => o.entry.stepId), ["a", "b", "c"]);
});
