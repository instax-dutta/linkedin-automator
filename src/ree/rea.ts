/**
 * Driver for the `rea` CLI.
 *
 * REA is invoked as an external process and never reimplemented: performing CDP attachment or
 * bundle analysis is REA's job, and this module only chooses the command and reads the Evidence
 * back. Because REA's own guidance is to separate observations from inferences, the parsed result
 * keeps the Evidence id so any claim can be traced to the capture behind it.
 *
 * Everything REA returns is untrusted data — website text and captured payloads are inputs, never
 * instructions.
 */

import { spawn } from "node:child_process";

export interface ReaResult {
  readonly evidenceId?: string;
  readonly result: unknown;
}

export interface ReaRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ReaRunner = (argv: string[]) => Promise<ReaRunResult>;

export interface ReaClientDeps {
  run?: ReaRunner;
  /** The executable to invoke. Defaults to `rea`, falling back to the published package. */
  command?: readonly string[];
}

export interface ReaClient {
  /** Static bundle analysis. Runs no code and needs no signed-in account. */
  analyzeWebBundle(target: string): Promise<ReaResult>;
  /** Read a saved capture. Recorded URLs are never fetched. */
  inspectNetworkCapture(file: string, format: "har" | "saz" | "mitmproxy"): Promise<ReaResult>;
}

function defaultRunner(command: readonly string[]): ReaRunner {
  return (argv) =>
    new Promise<ReaRunResult>((resolve, reject) => {
      const child = spawn(command[0]!, [...command.slice(1), ...argv], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    });
}

interface ReaEnvelope {
  evidence_id?: unknown;
  structuredContent?: { evidence_id?: unknown; normalized_result?: unknown };
}

function parseResult(argv: string[], run: ReaRunResult): ReaResult {
  if (run.exitCode !== 0) {
    throw new Error(
      run.stderr.trim() ||
        run.stdout.trim() ||
        `rea ${argv.join(" ")} failed (exit ${run.exitCode})`,
    );
  }

  let envelope: ReaEnvelope;
  try {
    envelope = JSON.parse(run.stdout) as ReaEnvelope;
  } catch {
    throw new Error(`rea ${argv.join(" ")} did not return JSON`);
  }

  const evidenceId =
    typeof envelope.evidence_id === "string"
      ? envelope.evidence_id
      : typeof envelope.structuredContent?.evidence_id === "string"
        ? envelope.structuredContent.evidence_id
        : undefined;

  const result =
    envelope.structuredContent?.normalized_result ?? envelope.structuredContent ?? envelope;

  return evidenceId === undefined ? { result } : { evidenceId, result };
}

export function createReaClient(deps: ReaClientDeps = {}): ReaClient {
  const command = deps.command ?? ["npx", "-y", "rea-agents@latest"];
  const run = deps.run ?? defaultRunner(command);

  const invoke = async (argv: string[]): Promise<ReaResult> =>
    parseResult(argv, await run(argv));

  return {
    analyzeWebBundle: (target) => invoke(["analyze-web-bundle", target, "--json"]),
    inspectNetworkCapture: (file, format) =>
      invoke(["inspect-web-network-capture", file, format, "--json"]),
  };
}
