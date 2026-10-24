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

test("a step the store already spent is skipped even when the plan did not know it", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore([
    {
      leadId: "lead-1",
      campaignId: "q4-outreach",
      stepId: "invite",
      op: "sendConnectionInvitation",
      outcome: "executed",
      at: AT,
    },
  ]);

  const outcomes = await executePlan([entry()], {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "skipped");
  assert.match(outcomes[0]?.reason ?? "", /already done/i);
  assert.equal(client.calls.length, 0, "a stale plan must not repeat a spent step");
});

test("a blocking failure stops the run instead of hammering the site with the rest", async () => {
  const client = createFakeEngine([fails("rate", "throttled")]);
  const store = createMemoryStore();

  const outcomes = await executePlan(
    [entry({ stepId: "a" }), entry({ stepId: "b" })],
    {
      client,
      store,
      confirm: () => true,
      account: "ana-test",
      allowedAccounts: ["ana-test"],
    },
  );

  assert.equal(outcomes[0]?.status, "failed");
  assert.equal(outcomes[1]?.status, "skipped");
  assert.match(outcomes[1]?.reason ?? "", /stopped/i);
  assert.equal(client.calls.length, 1, "nothing may be sent after a rate or auth failure");
});

test("a step waits for its scheduled time, so a campaign's delay is honoured at execution", async () => {
  const client = createFakeEngine([ok({}), ok({})]);
  const store = createMemoryStore();
  const base = Date.parse(AT);
  let elapsed = 0;
  const slept: number[] = [];

  const outcomes = await executePlan(
    [
      entry({ stepId: "a", kind: "read", op: "getMe", requiresConfirmation: false, at: AT }),
      entry({
        stepId: "b",
        kind: "read",
        op: "getMe",
        requiresConfirmation: false,
        at: new Date(base + 5_000).toISOString(),
      }),
    ],
    {
      client,
      store,
      now: () => new Date(base + elapsed),
      sleep: async (ms) => {
        slept.push(ms);
        elapsed += ms;
      },
    },
  );

  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["executed", "executed"]);
  assert.deepEqual(slept, [5_000]);
});

test("a scheduled time already past runs immediately rather than sleeping", async () => {
  const client = createFakeEngine([ok({})]);
  const store = createMemoryStore();
  const base = Date.parse(AT);

  await executePlan(
    [entry({ kind: "read", op: "getMe", requiresConfirmation: false, at: AT })],
    {
      client,
      store,
      now: () => new Date(base + 60_000),
      sleep: async () => {
        throw new Error("must not sleep for a time that has already passed");
      },
    },
  );
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
