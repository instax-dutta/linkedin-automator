/**
 * Test doubles. Kept in `test/` so no scaffolding ships in `src/`.
 */

import type {
  CallOutcome,
  EngineCallOptions,
  LinkedInClient,
  OperationCall,
  RequestPreview,
} from "../../src/engine/client.js";

export interface RecordedCall {
  readonly input: OperationCall;
  readonly opts: EngineCallOptions;
}

export type CannedOutcome = CallOutcome<unknown>;

export interface FakeEngine extends LinkedInClient {
  readonly calls: RecordedCall[];
}

/**
 * A client that answers from a queue and records what it was asked.
 *
 * Assertions in tests should read this for *inputs* (was the right request built, was the write
 * permitted), never as the thing under test.
 */
export function createFakeEngine(outcomes: CannedOutcome[] = []): FakeEngine {
  const calls: RecordedCall[] = [];
  const queue = [...outcomes];
  return {
    calls,
    async call<T>(input: OperationCall, opts: EngineCallOptions = {}): Promise<CallOutcome<T>> {
      calls.push({ input, opts });
      const next = queue.shift();
      if (!next) {
        throw new Error(`fake engine ran out of canned outcomes for ${input.site}.${input.op}`);
      }
      return next as CallOutcome<T>;
    },
    async preview(input: OperationCall): Promise<RequestPreview> {
      return {
        site: input.site,
        op: input.op,
        method: "POST",
        url: `https://www.linkedin.com/voyager/api/${input.op}`,
        headers: { "csrf-token": "<JSESSIONID>" },
        body: JSON.stringify(input.args ?? {}),
      };
    },
  };
}

export function ok(data: unknown = {}): CannedOutcome {
  return { ok: true, data, ms: 10, tier: 1 };
}

export function fails(
  cls: "auth" | "rate" | "blocked" | "drift" | "input" | "refused" | "error",
  reason = "no",
): CannedOutcome {
  return { ok: false, class: cls, reason, ms: 10 };
}
