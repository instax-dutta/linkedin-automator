#!/usr/bin/env node
/**
 * Run the whole test suite and prove it actually ran.
 *
 * A passing glob proves nothing if the glob matched nothing: an empty run reports zero failures
 * and exits zero. This verifier discovers the test files itself, requires a minimum number of
 * passing tests, and requires a named set of tests that carry the project's safety properties to
 * be present and green. Dropping a suite, or renaming away a property, fails here.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Tests that must exist and pass: each one is a promised property, not a coverage statistic. */
const REQUIRED_TESTS = [
  "writes are not permitted unless the caller grants them explicitly",
  "a write without confirmation is refused, spends nothing, and says why",
  "a write is refused when the signed-in account is not allow-listed",
  "a write is refused when the signed-in account could not be established",
  "an empty allow-list refuses every write, including for a known account",
  "an unverified write is refused even when the operator confirmed it",
  "a write whose outcome is unknown is recorded as unconfirmed and never retried",
  "a write the server certainly rejected is recorded as failed so it can be retried",
  "the daily invitation allowance is refused at its limit, not beyond it",
  "a spent week refuses a fresh day, so the weekly ceiling is enforced independently of the day",
  "planning is idempotent: a step the store already spent is planned as skipped",
  "the budget is rebuilt from the audit trail, so a second run cannot start from zero",
  "a step the store already spent is skipped even when the plan did not know it",
  "a blocking failure stops the run instead of hammering the site with the rest",
  "a boolean flag never swallows the next word, so --dry stays a dry run",
  "a dry run previews each write and never reaches the engine",
  "credentials are never stored in a spec",
  "the REA driver executes a pinned release rather than whatever is latest",
  "doctor warns when the stored session has lost its login cookies",
  "a failed call puts back the signed-in session its self-heal destroyed, and says so",
];

const MINIMUM_TESTS = 151;

function findTestFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findTestFiles(full));
    else if (entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found.sort();
}

const files = findTestFiles(path.join(ROOT, "test"));
if (files.length === 0) {
  console.error("suite verification failed: no test files discovered");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-reporter=tap", ...files],
  { cwd: ROOT, encoding: "utf8" },
);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.error) {
  console.error(`suite verification failed: could not start the runner: ${result.error.message}`);
  process.exit(1);
}

const passing = new Set();
let failing = 0;
for (const line of output.split("\n")) {
  const ok = /^ok \d+ - (.*)$/.exec(line);
  if (ok) passing.add(ok[1].trim());
  if (/^not ok \d+ - /.test(line)) failing += 1;
}

const passLine = /# pass (\d+)/.exec(output);
const failLine = /# fail (\d+)/.exec(output);
const totalPassed = passLine ? Number(passLine[1]) : 0;
const totalFailed = failLine ? Number(failLine[1]) : failing;

const problems = [];
if (totalFailed !== 0) problems.push(`${totalFailed} test(s) failed`);
if (totalPassed < MINIMUM_TESTS) {
  problems.push(`only ${totalPassed} tests passed, expected at least ${MINIMUM_TESTS}`);
}
for (const required of REQUIRED_TESTS) {
  if (!passing.has(required)) problems.push(`required test missing or not passing: "${required}"`);
}

if (problems.length > 0) {
  console.error(`suite verification failed:\n  - ${problems.join("\n  - ")}`);
  if (totalFailed !== 0) console.error(output.slice(-4000));
  process.exit(1);
}

console.log(`suite verification passed (${totalPassed} tests, ${files.length} files)`);
