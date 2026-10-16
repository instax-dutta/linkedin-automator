#!/usr/bin/env node
/**
 * Run the focused tests behind one acceptance gate.
 *
 * Usage: node scripts/verify-gates.mjs <gate>
 *
 * Each gate declares the test files that carry its property and a minimum number of passing
 * tests. Zero failures with zero passes is a broken run, not a green one, so the minimum is
 * required as well as the absence of failures.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GATES = {
  engine: {
    label: "engine port mapping and preview",
    files: ["test/engine.adapter.test.ts"],
    minimum: 8,
  },
  account: {
    label: "the signed-in account guard, checked before every other write gate",
    files: ["test/automation.guard.test.ts"],
    minimum: 10,
  },
  safety: {
    label: "account guard, write refusal, confirmation and ambiguity handling",
    files: [
      "test/automation.guard.test.ts",
      "test/automation.runner.test.ts",
      "test/automation.dryrun.test.ts",
    ],
    minimum: 27,
  },
  pacing: {
    label: "invitation ceilings across day, ISO week and month",
    files: ["test/automation.pacing.test.ts"],
    minimum: 7,
  },
  planner: {
    label: "campaign expansion, idempotence and budget accounting",
    files: ["test/automation.planner.test.ts", "test/automation.store.test.ts"],
    minimum: 19,
  },
  specs: {
    label: "pinned spec validity and absence of credentials or rotating ids",
    files: ["test/specs.test.ts"],
    minimum: 9,
  },
  reads: {
    label: "read rendering through the real pinned engine, offline",
    files: ["test/engine.integration.test.ts"],
    minimum: 4,
  },
  discovery: {
    label: "candidate discovery and draft spec rendering",
    files: ["test/ree.discovery.test.ts", "test/ree.har.test.ts"],
    minimum: 18,
  },
  cli: {
    label: "CLI surface, including the doctor pre-flight and its refusals",
    files: ["test/cli.test.ts", "test/config.test.ts"],
    minimum: 24,
  },
};

const gate = process.argv[2];
const spec = gate ? GATES[gate] : undefined;

if (!spec) {
  console.error(
    `unknown gate "${gate ?? ""}"; known gates: ${Object.keys(GATES).join(", ")}`,
  );
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-reporter=tap", ...spec.files],
  { cwd: ROOT, encoding: "utf8" },
);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

if (result.error) {
  console.error(`${gate} gate verification failed: could not start the runner: ${result.error.message}`);
  process.exit(1);
}

const passed = Number(/# pass (\d+)/.exec(output)?.[1] ?? 0);
const failed = Number(/# fail (\d+)/.exec(output)?.[1] ?? Number.NaN);

const problems = [];
if (Number.isNaN(failed)) problems.push("the runner produced no summary; the gate cannot be judged");
if (failed > 0) problems.push(`${failed} test(s) failed`);
if (passed < spec.minimum) {
  problems.push(`only ${passed} tests passed, expected at least ${spec.minimum}`);
}

if (problems.length > 0) {
  console.error(`${gate} gate verification failed (${spec.label}):\n  - ${problems.join("\n  - ")}`);
  if (failed > 0) console.error(output.slice(-4000));
  process.exit(1);
}

console.log(`${gate} gate verification passed (${spec.label}; ${passed} tests)`);
