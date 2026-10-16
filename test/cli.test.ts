import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/cli.js";
import { createMemoryStore } from "../src/automation/store.js";
import { createFakeEngine, ok } from "./fixtures/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What a signed-in test account looks like coming back from getMe. */
const ME = { firstName: "Ana", lastName: "Test", publicIdentifier: "ana-test" };

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
      // An empty environment keeps the dangerous switches off unless a test asks for them.
      env: {} as Record<string, string | undefined>,
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
  // The run resolves the signed-in account first, so that call is canned ahead of the two reads.
  const client = createFakeEngine([
    ok(ME),
    ok({ firstName: "Ana" }),
    ok({ firstName: "Bo" }),
  ]);
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

// --- doctor: the pre-flight before anything touches a live account ---------------------------------

function doctorDeps(
  env: Record<string, string | undefined>,
  outcomes = [ok(ME), ok({}), ok({}), ok({}), ok({}), ok({})],
) {
  const base = capture();
  const client = createFakeEngine(outcomes);
  return { ...base, client, deps: { ...base.deps, client, env } };
}

test("doctor reports which account the imported session actually belongs to", async () => {
  const { deps, out } = doctorDeps({});
  const code = await runCli(["doctor"], deps);
  const text = out.join("\n");

  assert.equal(code, 0);
  assert.match(text, /ana-test/);
  assert.match(text, /Ana Test/);
});

test("doctor says writes are refused while no account is allow-listed", async () => {
  const { deps, out } = doctorDeps({});
  await runCli(["doctor"], deps);

  assert.match(out.join("\n"), /writes:.*refused/i);
});

test("doctor permits writes only when the signed-in account is the allow-listed one", async () => {
  const { deps, out } = doctorDeps({ LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS: "ana-test" });
  await runCli(["doctor"], deps);
  assert.match(out.join("\n"), /writes:.*permitted/i);

  const other = doctorDeps({ LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS: "someone-else" });
  await runCli(["doctor"], other.deps);
  assert.match(other.out.join("\n"), /writes:.*refused/i);
});

test("doctor dry-renders every read operation so a broken spec shows up before a live run", async () => {
  const { deps, out } = doctorDeps({});
  await runCli(["doctor"], deps);
  const text = out.join("\n");

  for (const name of ["getMe", "getProfile", "getCompany", "searchPeople", "searchCompanies"]) {
    assert.match(text, new RegExp(name));
  }
});

test("doctor reports a dead session with its remediation hint and does not pretend to be healthy", async () => {
  const { deps, out, err } = doctorDeps({}, [
    { ok: false, class: "auth", reason: "session expired", next: "api-anything login linkedin", ms: 5 },
  ]);
  const code = await runCli(["doctor"], deps);

  assert.equal(code, 1);
  assert.match(out.join("\n") + err.join("\n"), /session expired/);
  assert.match(out.join("\n") + err.join("\n"), /api-anything login linkedin/);
});

test("a run refuses every write when the signed-in account is not allow-listed", async () => {
  const { deps, out } = capture();
  const client = createFakeEngine([ok(ME), ok({ firstName: "Ana" }), ok({ firstName: "Bo" })]);
  const code = await runCli(
    [
      "run",
      "--campaign",
      "test/fixtures/campaign.json",
      "--leads",
      "test/fixtures/leads.json",
      "--confirm",
    ],
    {
      ...deps,
      client,
      store: createMemoryStore(),
      env: {
        LINKEDIN_AUTOMATOR_ALLOW_WRITES: "true",
        LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS: "someone-else",
      },
    },
  );

  assert.equal(
    client.calls.some((call) => call.opts.allowWrites === true),
    false,
    "the guard must stop a write even when every other gate is open",
  );
  assert.equal(code, 1);
  assert.match(out.join("\n"), /allow-list/i);
});
