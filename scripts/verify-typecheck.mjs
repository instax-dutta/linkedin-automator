#!/usr/bin/env node
/**
 * Typecheck and report a decisive outcome.
 *
 * `tsc` prints nothing when it succeeds, so a bare exit code is the only signal and an empty
 * EXPECT cannot be written. This wrapper turns success into a token a ledger can match.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync("npm", ["run", "--silent", "check"], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`typecheck failed: could not start tsc: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error("typecheck failed:");
  console.error(result.stdout ?? "");
  console.error(result.stderr ?? "");
  process.exit(1);
}

console.log("typecheck passed (src and test compile with no errors)");
