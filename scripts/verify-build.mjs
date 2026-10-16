#!/usr/bin/env node
/**
 * Build, then prove the shipped artifact works.
 *
 * A successful `tsc` run only proves the emitter ran. This also requires the declared `bin` and
 * library entry to exist and then executes the built CLI, so the gate measures the artifact a user
 * would actually receive rather than the exit code of a compiler.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32";

function run(command, args) {
  return spawnSync(command, args, { cwd: ROOT, encoding: "utf8", shell });
}

const build = run("npm", ["run", "--silent", "build"]);
if (build.error || build.status !== 0) {
  console.error("build verification failed: the build did not succeed");
  console.error(build.stdout ?? "");
  console.error(build.stderr ?? "");
  process.exit(1);
}

const required = [
  path.join(ROOT, "dist", "cli.js"),
  path.join(ROOT, "dist", "index.js"),
  path.join(ROOT, "dist", "index.d.ts"),
];
const missing = required.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`build verification failed: missing emitted files ${missing.join(", ")}`);
  process.exit(1);
}

// The interface a user meets: the built executable, not the source.
const cli = run(process.execPath, [path.join(ROOT, "dist", "cli.js"), "ops"]);
const cliOutput = `${cli.stdout ?? ""}${cli.stderr ?? ""}`;
if (cli.status !== 0 || !/getProfile/.test(cliOutput) || !/sendConnectionInvitation/.test(cliOutput)) {
  console.error("build verification failed: the emitted CLI did not list the operation catalog");
  console.error(cliOutput);
  process.exit(1);
}

console.log("build verification passed (dist emitted and the CLI runs)");
