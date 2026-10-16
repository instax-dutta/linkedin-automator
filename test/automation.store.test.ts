import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createFileStore,
  createMemoryStore,
  type ActionRecord,
} from "../src/automation/store.js";

const entry = (over: Partial<ActionRecord> = {}): ActionRecord => ({
  leadId: "lead-1",
  campaignId: "camp-1",
  stepId: "invite",
  outcome: "executed",
  at: "2026-10-16T12:00:00.000Z",
  ...over,
});

test("nothing has happened before anything is recorded", async () => {
  const store = createMemoryStore();
  assert.equal(await store.hasDone("lead-1", "camp-1", "invite"), false);
});

test("an executed action is remembered by lead, campaign and step", async () => {
  const store = createMemoryStore();
  await store.append(entry());
  assert.equal(await store.hasDone("lead-1", "camp-1", "invite"), true);
  assert.equal(await store.hasDone("lead-1", "camp-1", "message"), false);
  assert.equal(await store.hasDone("lead-2", "camp-1", "invite"), false);
  assert.equal(await store.hasDone("lead-1", "camp-2", "invite"), false);
});

test("an ambiguous write counts as done, because retrying it could double-send", async () => {
  const store = createMemoryStore();
  await store.append(entry({ outcome: "unconfirmed" }));
  assert.equal(await store.hasDone("lead-1", "camp-1", "invite"), true);
});

test("a skipped or failed step does not block a later attempt", async () => {
  const store = createMemoryStore([entry({ outcome: "skipped" }), entry({ outcome: "failed" })]);
  assert.equal(await store.hasDone("lead-1", "camp-1", "invite"), false);
});

test("the file store survives a new instance, because a campaign outlives a process", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "la-store-"));
  try {
    const file = path.join(dir, "state.jsonl");
    const first = createFileStore(file);
    await first.append(entry({ stepId: "message", note: "hi" }));

    const second = createFileStore(file);
    assert.equal(await second.hasDone("lead-1", "camp-1", "message"), true);
    const all = await second.all();
    assert.equal(all.length, 1);
    assert.equal(all[0]?.note, "hi");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing state file reads as an empty history rather than an error", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "la-store-"));
  try {
    const store = createFileStore(path.join(dir, "absent.jsonl"));
    assert.deepEqual(await store.all(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("history is append-only: reading it never rewrites what is already there", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "la-store-"));
  try {
    const file = path.join(dir, "state.jsonl");
    const store = createFileStore(file);
    await store.append(entry({ stepId: "a" }));
    await store.append(entry({ stepId: "b" }));
    await store.append(entry({ stepId: "c" }));
    const steps = (await store.all()).map((record) => record.stepId);
    assert.deepEqual(steps, ["a", "b", "c"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
