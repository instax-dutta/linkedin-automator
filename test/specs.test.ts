/**
 * The spec file is configuration, not production code, so these tests are written against it
 * rather than before it (the TDD skill's documented exception for configuration files). They are
 * not a formality: every assertion below is one that a mistaken hand-edit would break.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSite, type Site } from "api-anything";

import { findOperation, listOperations } from "../src/ops/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = path.join(ROOT, "specs", "linkedin.json");

function load(): Site {
  return parseSite(JSON.parse(readFileSync(SPEC_PATH, "utf8")) as unknown);
}

test("the pinned spec is valid according to api-anything's own parser", () => {
  const site = load();
  assert.equal(site.name, "linkedin");
  assert.equal(site.baseUrl, "https://www.linkedin.com");
});

test("the spec declares exactly the read operations this project calls", () => {
  const declared = load().operations.map((op) => op.name).sort();
  const catalogued = listOperations("read")
    .map((op) => op.name)
    .sort();
  assert.deepEqual(declared, catalogued);
});

test("the spec declares no write operation, because none has been observed", () => {
  const writes = load().operations.filter((op) => op.readOnly === false);
  assert.deepEqual(writes, []);
});

test("every operation in the spec is marked read-only", () => {
  for (const op of load().operations) {
    assert.equal(op.readOnly, true, `${op.name} must be read-only`);
  }
});

test("credentials are never stored in a spec", () => {
  const raw = readFileSync(SPEC_PATH, "utf8");
  const site = load();

  // A live cookie or session value would show up as a long token, and the request bodies carry
  // the site's own auth headers. Nothing here may hold a value.
  assert.equal(
    /\b(AQED[A-Za-z0-9_-]{10,}|li_at=|Bearer\s+[A-Za-z0-9._-]{20,})/.test(raw),
    false,
    "the spec must hold references, never credential values",
  );

  for (const op of site.operations) {
    assert.equal(
      op.request.headers["csrf-token"],
      "",
      `${op.name} must leave csrf-token for a slot to fill`,
    );
    assert.equal(
      op.request.headers["authorization"],
      undefined,
      `${op.name} must not carry a literal authorization header`,
    );
    for (const slot of op.slots) {
      const sources = [slot.param, slot.ref].filter((value) => value !== undefined);
      assert.equal(sources.length, 1, `${op.name} slot must have exactly one of param or ref`);
      if (slot.ref !== undefined) {
        assert.match(
          slot.ref,
          /^(cookie|session):/,
          `${op.name}'s ref must name a stored credential rather than inline it`,
        );
      }
    }
  }
});

test("the csrf-token header mirrors JSESSIONID with its quotes stripped", () => {
  for (const op of load().operations) {
    const slot = op.slots.find((s) => s.at.includes("header:csrf-token"));
    assert.ok(slot, `${op.name} must fill csrf-token`);
    assert.equal(slot.ref, "cookie:JSESSIONID", `${op.name}`);
    assert.equal(slot.transform, "strip-quotes", `${op.name}`);
  }
});

test("no operation depends on a decorationId or GraphQL queryId, which rotate per deploy", () => {
  const raw = readFileSync(SPEC_PATH, "utf8");
  assert.equal(
    /decorationId|queryId/i.test(raw),
    false,
    "a baked identifier would turn a stable operation into a permanently drifting one",
  );
});

test("login is expected to be satisfied by the imported session cookies", () => {
  const site = load();
  assert.deepEqual([...(site.loginCookies ?? [])].sort(), ["JSESSIONID", "li_at"]);
});

test("every declared parameter is actually placed into its request", () => {
  const site = load();
  for (const op of site.operations) {
    for (const param of op.params) {
      const placeholder = `{${param.name}}`;
      const placed = op.slots.some((slot) => slot.param === param.name);
      const templated = op.slots.some((slot) => slot.template?.includes(placeholder) === true);
      const inUrl = op.request.url.includes(placeholder);
      assert.ok(
        placed || templated || inUrl,
        `${op.name}.${param.name} is declared but never placed in the request`,
      );
    }
  }
});

test("the catalog and the spec agree on which operations exist", () => {
  for (const descriptor of listOperations("read")) {
    assert.doesNotThrow(() => findOperation(descriptor.name));
    const inSpec = load().operations.some((op) => op.name === descriptor.name);
    assert.equal(inSpec, true, `${descriptor.name} is in the catalog but not the spec`);
  }
});
