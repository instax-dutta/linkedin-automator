import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverCandidates, trafficFromHar } from "../src/ree/candidates.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture(): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, "test", "fixtures", "session.har"), "utf8"));
}

test("a saved HAR yields the requests it recorded", () => {
  const records = trafficFromHar(fixture());
  assert.equal(records.length, 4);
  assert.equal(records[0]?.method, "GET");
  assert.match(records[1]?.url ?? "", /\/voyager\/api\/me$/);
});

test("reading a HAR never fetches a recorded URL, it only reads them", () => {
  // The reader is pure: the same input twice gives the same output, and nothing is awaited.
  const once = trafficFromHar(fixture());
  const twice = trafficFromHar(fixture());
  assert.deepEqual(once, twice);
});

test("discovery over a recorded HAR produces only the Voyager endpoints", () => {
  const candidates = discoverCandidates({
    traffic: trafficFromHar(fixture()),
    evidenceId: "har-fixture",
  });
  const paths = candidates.map((c) => c.path).sort();
  assert.deepEqual(paths, [
    "/voyager/api/identity/dash/profiles",
    "/voyager/api/me",
  ]);
  assert.equal(candidates.every((c) => c.confidence === "observed"), true);
});

test("a HAR that is not HAR 1.2 is refused rather than half-read", () => {
  assert.throws(() => trafficFromHar({ log: { version: "1.1", entries: [] } }), /1\.2/);
  assert.throws(() => trafficFromHar({ nope: true }), /HAR/i);
});
