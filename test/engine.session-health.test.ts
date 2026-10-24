import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { protectSession } from "../src/engine/session-health.js";

/** A throwaway api-anything home holding one site's stored session. */
function homeWith(cookies: Array<{ name: string }>): { home: string; file: string } {
  const home = mkdtempSync(path.join(tmpdir(), "aa-home-"));
  const dir = path.join(home, "sessions");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "linkedin.json");
  writeFileSync(file, JSON.stringify({ cookies, values: {} }));
  return { home, file };
}

function cookieNames(file: string): string[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { cookies: Array<{ name: string }> };
  return parsed.cookies.map((c) => c.name);
}

test("a call that drops a login cookie is undone: the stored session is restored", async () => {
  const { home, file } = homeWith([{ name: "li_at" }, { name: "JSESSIONID" }, { name: "bcookie" }]);

  const out = await protectSession("linkedin", home, async () => {
    writeFileSync(file, JSON.stringify({ cookies: [{ name: "bcookie" }], values: {} }));
    return "done";
  });

  assert.equal(out.value, "done");
  assert.equal(out.restored, true);
  assert.deepEqual(cookieNames(file), ["li_at", "JSESSIONID", "bcookie"]);
});

test("a call that keeps the login cookies is left exactly as it wrote it", async () => {
  const { home, file } = homeWith([{ name: "li_at" }, { name: "JSESSIONID" }]);

  const out = await protectSession("linkedin", home, async () => {
    writeFileSync(
      file,
      JSON.stringify({ cookies: [{ name: "li_at" }, { name: "JSESSIONID" }, { name: "fresh" }] }),
    );
    return 1;
  });

  assert.equal(out.restored, false);
  assert.deepEqual(cookieNames(file), ["li_at", "JSESSIONID", "fresh"]);
});

test("with no stored session there is nothing to protect and nothing is created", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "aa-home-"));
  const file = path.join(home, "sessions", "linkedin.json");

  const out = await protectSession("linkedin", home, async () => "ok");

  assert.equal(out.value, "ok");
  assert.equal(out.restored, false);
  assert.equal(existsSync(file), false);
});

test("a jar already missing a login cookie is not resurrected", async () => {
  const { home, file } = homeWith([{ name: "bcookie" }, { name: "JSESSIONID" }]);

  const out = await protectSession("linkedin", home, async () => {
    writeFileSync(file, JSON.stringify({ cookies: [{ name: "lidc" }] }));
    return undefined;
  });

  assert.equal(out.restored, false);
  assert.deepEqual(cookieNames(file), ["lidc"]);
});
