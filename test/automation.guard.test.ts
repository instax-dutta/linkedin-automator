import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideAccount,
  normaliseAccount,
  parseAllowedAccounts,
} from "../src/automation/guard.js";
import { executePlan, type PlanEntry } from "../src/automation/runner.js";
import { createMemoryStore } from "../src/automation/store.js";
import { createFakeEngine, ok } from "./fixtures/engine.js";

test("an account is compared without case or surrounding space", () => {
  assert.equal(normaliseAccount("  Ana-Test "), "ana-test");
});

test("an empty allow-list refuses every write, including for a known account", () => {
  const decision = decideAccount("ana-test", []);
  assert.equal(decision.ok, false);
  assert.match(decision.ok === false ? decision.reason : "", /ALLOWED_ACCOUNTS/);
});

test("an unknown signed-in account refuses writes rather than assuming it is safe", () => {
  const decision = decideAccount(undefined, ["ana-test"]);
  assert.equal(decision.ok, false);
  assert.match(decision.ok === false ? decision.reason : "", /unknown/i);
});

test("a personal account that is not allow-listed is refused, and named in the reason", () => {
  const decision = decideAccount("the-real-me", ["ana-test"]);
  assert.equal(decision.ok, false);
  assert.match(decision.ok === false ? decision.reason : "", /the-real-me/);
  assert.match(decision.ok === false ? decision.reason : "", /ana-test/);
});

test("an allow-listed account is permitted, case-insensitively", () => {
  assert.deepEqual(decideAccount("ANA-TEST", ["ana-test"]), { ok: true });
});

test("the allow-list is parsed from a comma-separated setting, without blanks or duplicates", () => {
  assert.deepEqual(parseAllowedAccounts(undefined), []);
  assert.deepEqual(parseAllowedAccounts("  "), []);
  assert.deepEqual(parseAllowedAccounts("ana-test"), ["ana-test"]);
  assert.deepEqual(parseAllowedAccounts("ana-test, Bo-Test ,,ana-TEST"), ["ana-test", "bo-test"]);
});

// --- runner wiring -------------------------------------------------------------------------

const AT = "2026-10-16T12:00:00.000Z";

function writeEntry(over: Partial<PlanEntry> = {}): PlanEntry {
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

test("a write is refused when the signed-in account is not allow-listed", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore();

  const outcomes = await executePlan([writeEntry()], {
    client,
    store,
    confirm: () => true,
    account: "the-real-me",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "refused");
  assert.match(outcomes[0]?.reason ?? "", /allow-list/i);
  assert.equal(client.calls.length, 0, "a guard refusal must never reach the engine");
});

test("a write is refused when the signed-in account could not be established", async () => {
  const client = createFakeEngine([]);
  const store = createMemoryStore();

  const outcomes = await executePlan([writeEntry()], {
    client,
    store,
    confirm: () => true,
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "refused");
  assert.equal(client.calls.length, 0);
});

test("an allow-listed account lets a confirmed write through", async () => {
  const client = createFakeEngine([ok({ sent: true })]);
  const store = createMemoryStore();

  const outcomes = await executePlan([writeEntry()], {
    client,
    store,
    confirm: () => true,
    account: "ana-test",
    allowedAccounts: ["ana-test"],
  });

  assert.equal(outcomes[0]?.status, "executed");
  assert.equal(client.calls[0]?.opts.allowWrites, true);
});

test("reads are unaffected by the account guard, which only gates writes", async () => {
  const client = createFakeEngine([ok({ firstName: "Ana" })]);
  const store = createMemoryStore();

  const outcomes = await executePlan(
    [writeEntry({ kind: "read", op: "getProfile", requiresConfirmation: false })],
    { client, store, account: "the-real-me", allowedAccounts: [] },
  );

  assert.equal(outcomes[0]?.status, "executed");
});
