/**
 * The one file allowed to import `api-anything`.
 *
 * The adapter is deliberately thin and faithless: it does not retry, re-heal or reinterpret.
 * api-anything already owns the tier ladder, healing and the write guard; duplicating any of that
 * here would be a second, worse implementation of a solved problem.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  CallOutcome,
  EngineCallOptions,
  FailureClass,
  LinkedInClient,
  OperationCall,
  RequestPreview,
} from "./client.js";

/** api-anything's `CallResult`, mirrored so the adapter can be exercised without the package. */
export interface ApiAnythingCallResult {
  ok: boolean;
  class: string;
  data?: unknown;
  truncated?: string;
  tier?: 1 | 2 | 3;
  healed?: boolean;
  ms: number;
  reason?: string;
  next?: string;
}

export type Caller = (
  site: string,
  op: string,
  args: Record<string, unknown>,
  opts: { allowWrites?: boolean; maxTier?: 1 | 2 | 3 },
) => Promise<ApiAnythingCallResult>;

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CliRunner = (argv: string[]) => Promise<CliResult>;

export interface ApiAnythingClientDeps {
  /** Injected call implementation. Defaults to api-anything's own `call`. */
  caller?: Caller;
  /** Injected CLI runner, used for previews. Defaults to spawning the pinned CLI. */
  runCli?: CliRunner;
  /** `API_ANYTHING_HOME` override: where the operator's session and installed specs live. */
  home?: string;
}

/**
 * api-anything's failure classes, kept verbatim. Anything unrecognised becomes `error` so upstream
 * wording never leaks into the automation layer's vocabulary.
 */
const KNOWN_CLASSES: ReadonlySet<string> = new Set([
  "auth",
  "rate",
  "blocked",
  "drift",
  "input",
  "refused",
  "error",
]);

function classify(value: string): FailureClass {
  return KNOWN_CLASSES.has(value) ? (value as FailureClass) : "error";
}

/** Render arguments the way the CLI's `k=v` parser expects: strings verbatim, everything else JSON. */
function toArgv(args: Readonly<Record<string, unknown>> | undefined): string[] {
  return Object.entries(args ?? {}).map(([key, value]) =>
    `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
}

const require_ = createRequire(import.meta.url);

/** Path to the pinned api-anything CLI, resolved through its own entry point. */
function defaultCliPath(): string {
  const main = require_.resolve("api-anything");
  return path.join(path.dirname(main), "cli.js");
}

function resolveCliPath(override?: string): string {
  return override ?? defaultCliPath();
}

const defaultCaller: Caller = async (site, op, args, opts) => {
  const mod = (await import("api-anything")) as {
    call: (
      site: string,
      op: string,
      args?: Record<string, unknown>,
      opts?: { allowWrites?: boolean; maxTier?: 1 | 2 | 3 },
    ) => Promise<ApiAnythingCallResult>;
  };
  return mod.call(site, op, args, opts);
};

function defaultRunner(cliPath: string, home?: string): CliRunner {
  return (argv) =>
    new Promise<CliResult>((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...argv], {
        env: {
          ...process.env,
          ...(home ? { API_ANYTHING_HOME: home } : {}),
        },
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
      child.on("close", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
}

interface DryRunRequest {
  method?: unknown;
  url?: unknown;
  headers?: unknown;
  body?: unknown;
}

interface DryRunOutput {
  ok?: unknown;
  dry?: unknown;
  request?: DryRunRequest;
  reason?: unknown;
  next?: unknown;
}

function toPreview(
  input: OperationCall,
  request: DryRunRequest,
): RequestPreview {
  if (typeof request.method !== "string" || typeof request.url !== "string") {
    throw new Error(
      `api-anything returned no usable request for ${input.site}.${input.op}`,
    );
  }
  const headers: Record<string, string> = {};
  if (request.headers && typeof request.headers === "object") {
    for (const [key, value] of Object.entries(request.headers as Record<string, unknown>)) {
      headers[key] = String(value);
    }
  }
  return {
    site: input.site,
    op: input.op,
    method: request.method,
    url: request.url,
    headers,
    ...(typeof request.body === "string" ? { body: request.body } : {}),
  };
}

export function createApiAnythingClient(deps: ApiAnythingClientDeps = {}): LinkedInClient {
  const caller = deps.caller ?? defaultCaller;
  const runCli = deps.runCli ?? defaultRunner(resolveCliPath(), deps.home);

  return {
    async call<T>(input: OperationCall, opts: EngineCallOptions = {}): Promise<CallOutcome<T>> {
      // Default to refusing writes. The grant has to arrive from the caller, every time.
      const engineOpts = {
        allowWrites: opts.allowWrites ?? false,
        maxTier: opts.maxTier,
      };
      const result = await caller(
        input.site,
        input.op,
        { ...(input.args ?? {}) },
        engineOpts,
      );

      if (result.ok) {
        return {
          ok: true,
          data: result.data as T,
          ms: result.ms,
          ...(result.tier !== undefined ? { tier: result.tier } : {}),
          ...(result.healed !== undefined ? { healed: result.healed } : {}),
          ...(result.truncated !== undefined ? { truncated: result.truncated } : {}),
        };
      }

      return {
        ok: false,
        class: classify(result.class),
        reason: result.reason ?? "api-anything reported a failure without a reason",
        ms: result.ms,
        ...(result.next !== undefined ? { next: result.next } : {}),
      };
    },

    async preview(input: OperationCall): Promise<RequestPreview> {
      const argv = ["call", input.site, input.op, ...toArgv(input.args), "--dry"];
      const { exitCode, stdout, stderr } = await runCli(argv);
      if (exitCode !== 0) {
        throw new Error(
          (stderr.trim() || stdout.trim() || `api-anything --dry failed (exit ${exitCode})`),
        );
      }
      let parsed: DryRunOutput;
      try {
        parsed = JSON.parse(stdout) as DryRunOutput;
      } catch {
        throw new Error(`api-anything --dry did not return JSON for ${input.site}.${input.op}`);
      }
      if (parsed.ok === false) {
        const reason = typeof parsed.reason === "string" ? parsed.reason : "preview refused";
        throw new Error(reason);
      }
      if (!parsed.request) {
        throw new Error(`api-anything --dry returned no request for ${input.site}.${input.op}`);
      }
      return toPreview(input, parsed.request);
    },
  };
}
