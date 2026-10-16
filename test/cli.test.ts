import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/cli.js";
import { createMemoryStore } from "../src/automation/store.js";
import { createFakeEngine, ok } from "./fixtures/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    deps: {
      stdout: (line: string) => out.push(line),
      stderr: (line: string) => err.push(line),
      cwd: ROOT,
      now: new Date("2026-10-16T12:00:00.000Z"),
    },
  };
}

test("listing operations shows reads, writes and the fact that the writes are unverified", async () => {
  const { deps, out } = capture();
  const code = await runCli(["ops"], deps);
  const text = out.join("\n");

  assert.equal(code, 0);
  assert.match(text, /getProfile/);
  assert.match(text, /sendConnectionInvitation/);
  assert.match(text, /unverified/);
});

test("planning a campaign prints what would happen and performs nothing", async () => {
  const { deps, out } = capture();
  const client = createFakeEngine([]);
  const code = await runCli(
    ["plan", "--campaign", "test/fixtures/campaign.json", "--leads", "test/fixtures/leads.json"],
    { ...deps, client, store: createMemoryStore() },
  );

  assert.equal(code, 0);
  assert.equal(client.calls.length, 0, "planning must not call the engine");
  assert.match(out.join("\n"), /invite/);
});

test("a dry run previews writes, sends nothing, and says what it did not send", async () => {
  const { deps, out } = capture();
  const client = createFakeEngine([]);
  const code = await runCli(
    [
      "run",
      "--campaign",
      "test/fixtures/campaign.json",
      "--leads",
      "test/fixtures/leads.json",
      "--dry",
    ],
    { ...deps, client, store: createMemoryStore() },
  );

  assert.equal(code, 0);
  assert.equal(client.calls.length, 0, "a dry run must not send anything");
  assert.match(out.join("\n"), /PREVIEW|dry/i);
});

test("running without --confirm lets reads through but refuses every write", async () => {
  const { deps, out } = capture();
  const client = createFakeEngine([ok({ firstName: "Ana" }), ok({ firstName: "Bo" })]);
  const code = await runCli(
    ["run", "--campaign", "test/fixtures/campaign.json", "--leads", "test/fixtures/leads.json"],
    { ...deps, client, store: createMemoryStore() },
  );

  assert.equal(
    client.calls.some((call) => call.opts.allowWrites === true),
    false,
    "no write may reach the engine without confirmation",
  );
  assert.equal(code, 1, "a run whose writes were all refused should not report success");
  assert.match(out.join("\n"), /refused/i);
});

test("the discovery command turns a saved HAR into candidates", async () => {
  const { deps, out } = capture();
  const code = await runCli(["discover", "test/fixtures/session.har"], deps);
  const text = out.join("\n");

  assert.equal(code, 0);
  assert.match(text, /voyager\/api\/me/);
  assert.match(text, /observed/);
});

test("an unknown command is refused with usage rather than doing something surprising", async () => {
  const { deps, err } = capture();
  const code = await runCli(["frobnicate"], deps);
  assert.equal(code, 2);
  assert.match(err.join("\n"), /usage/i);
});

test("logging in points at api-anything and never prompts for a secret itself", async () => {
  const { deps, out } = capture();
  const code = await runCli(["login"], deps);
  const text = out.join("\n");

  assert.equal(code, 0);
  assert.match(text, /api-anything login linkedin/);
  assert.equal(
    /enter your password|password\s*:/i.test(text),
    false,
    "sign-in imports the operator's own session; this CLI must never ask for a credential",
  );
});

test("a read can be called directly and its data is printed", async () => {
  const { deps, out } = capture();
  const client = createFakeEngine([ok({ firstName: "Ana" })]);
  const code = await runCli(["call", "getProfile", "publicId=ana"], { ...deps, client });

  assert.equal(code, 0);
  assert.match(out.join("\n"), /Ana/);
  assert.notEqual(
    client.calls[0]?.opts.allowWrites,
    true,
    "a read must never carry write permission",
  );
});

test("calling a write without permission is refused before the engine is reached", async () => {
  const { deps, err } = capture();
  const client = createFakeEngine([]);
  const code = await runCli(["call", "sendMessage", "recipient=ana", "text=hi"], { ...deps, client });

  assert.equal(code, 2);
  assert.equal(client.calls.length, 0);
  assert.match(err.join("\n"), /write|confirm|unverified/i);
});
