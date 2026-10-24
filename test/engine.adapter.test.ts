import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createApiAnythingClient } from "../src/engine/api-anything.js";
import type { ApiAnythingCallResult } from "../src/engine/api-anything.js";

/** A caller that records what it was asked and answers from a queue. */
function recordingCaller(results: ApiAnythingCallResult[]) {
  const seen: Array<{ site: string; op: string; args: Record<string, unknown>; opts: unknown }> = [];
  return {
    seen,
    caller: async (
      site: string,
      op: string,
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<ApiAnythingCallResult> => {
      seen.push({ site, op, args, opts });
      const next = results.shift();
      if (!next) throw new Error("caller ran out of canned results");
      return next;
    },
  };
}

test("a successful call keeps the data and reports the transport tier", async () => {
  const { caller } = recordingCaller([
    { ok: true, class: "ok", data: { firstName: "Satya" }, ms: 250, tier: 1 },
  ]);
  const client = createApiAnythingClient({ caller });

  const outcome = await client.call<{ firstName: string }>({
    site: "linkedin",
    op: "getMe",
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.ok && outcome.data, { firstName: "Satya" });
  assert.equal(outcome.ok && outcome.tier, 1);
});

test("a failing call preserves the class, reason and remediation hint", async () => {
  const { caller } = recordingCaller([
    {
      ok: false,
      class: "drift",
      reason: "the stored template no longer matches",
      next: "api-anything heal linkedin getProfile",
      ms: 12,
    },
  ]);
  const client = createApiAnythingClient({ caller });

  const outcome = await client.call({ site: "linkedin", op: "getProfile", args: { publicId: "x" } });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.class, "drift");
  assert.equal(
    outcome.ok === false && outcome.next,
    "api-anything heal linkedin getProfile",
  );
});

test("writes are not permitted unless the caller grants them explicitly", async () => {
  const { caller, seen } = recordingCaller([{ ok: true, class: "ok", data: {}, ms: 5 }]);
  const client = createApiAnythingClient({ caller });

  await client.call({ site: "linkedin", op: "sendMessage", args: { text: "hi" } });

  assert.deepEqual(seen[0]?.opts, { allowWrites: false, maxTier: undefined });
});

test("a granted write reaches the engine with writes allowed", async () => {
  const { caller, seen } = recordingCaller([{ ok: true, class: "ok", data: {}, ms: 5 }]);
  const client = createApiAnythingClient({ caller });

  await client.call(
    { site: "linkedin", op: "sendMessage", args: { text: "hi" } },
    { allowWrites: true, maxTier: 1 },
  );

  assert.deepEqual(seen[0]?.opts, { allowWrites: true, maxTier: 1 });
});

test("a failed call puts back the signed-in session its self-heal destroyed, and says so", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "aa-home-"));
  const dir = path.join(home, "sessions");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "linkedin.json");
  const signedIn = JSON.stringify({ cookies: [{ name: "li_at" }, { name: "JSESSIONID" }] });
  writeFileSync(file, signedIn);

  const caller = async (): Promise<ApiAnythingCallResult> => {
    writeFileSync(file, JSON.stringify({ cookies: [{ name: "bcookie" }] }));
    return { ok: false, class: "auth", reason: "HTTP 401", ms: 3 };
  };
  const client = createApiAnythingClient({ caller, home });

  const outcome = await client.call({ site: "linkedin", op: "getMe" });

  assert.equal(outcome.ok, false);
  assert.match(outcome.ok === false ? outcome.reason : "", /replaced the stored session/i);
  assert.equal(readFileSync(file, "utf8"), signedIn);
});

test("an unknown failure class is reported as error rather than leaking upstream wording", async () => {
  const { caller } = recordingCaller([
    { ok: false, class: "something-new", reason: "?", ms: 1 },
  ]);
  const client = createApiAnythingClient({ caller });

  const outcome = await client.call({ site: "linkedin", op: "getMe" });

  assert.equal(outcome.ok === false && outcome.class, "error");
});

test("truncation is surfaced so a partial answer is never mistaken for a complete one", async () => {
  const { caller } = recordingCaller([
    { ok: true, class: "ok", data: [], ms: 900, truncated: "output over 20k characters" },
  ]);
  const client = createApiAnythingClient({ caller });

  const outcome = await client.call({ site: "linkedin", op: "searchPeople", args: { keywords: "a" } });

  assert.equal(outcome.ok && outcome.truncated, "output over 20k characters");
});

test("preview renders the request through api-anything's own dry run", async () => {
  const runCli = async (argv: string[]) => {
    assert.deepEqual(argv, ["call", "linkedin", "getMessage", "urn=x", "--dry"]);
    return {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        ok: true,
        dry: true,
        request: {
          method: "POST",
          url: "https://www.linkedin.com/voyager/api/x",
          headers: { "csrf-token": "<JSESSIONID>" },
          body: "{\"text\":\"hi\"}",
        },
      }),
    };
  };
  const client = createApiAnythingClient({ runCli });

  const preview = await client.preview({
    site: "linkedin",
    op: "getMessage",
    args: { urn: "x" },
  });

  assert.equal(preview.method, "POST");
  assert.equal(preview.url, "https://www.linkedin.com/voyager/api/x");
  assert.equal(preview.headers["csrf-token"], "<JSESSIONID>");
  assert.equal(preview.body, "{\"text\":\"hi\"}");
});

test("a preview that api-anything refuses is raised rather than returned as an empty request", async () => {
  const runCli = async () => ({
    exitCode: 1,
    stderr: "no operation \"nope\" on linkedin\n",
    stdout: "",
  });
  const client = createApiAnythingClient({ runCli });

  await assert.rejects(
    () => client.preview({ site: "linkedin", op: "nope" }),
    /no operation "nope" on linkedin/,
  );
});

test("a silent failure still reports which operation failed instead of an empty message", async () => {
  const runCli = async () => ({ exitCode: 7, stdout: "", stderr: "" });
  const client = createApiAnythingClient({ runCli });

  await assert.rejects(
    () => client.preview({ site: "linkedin", op: "nope" }),
    (error: unknown) =>
      error instanceof Error && /linkedin\.nope/.test(error.message) && error.message.length > 0,
  );
});
