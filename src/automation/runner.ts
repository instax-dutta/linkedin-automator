/**
 * The executor. It carries out an existing plan and nothing else.
 *
 * Every entry produces an outcome, so a run cannot silently drop work, and a write has to clear
 * three separate gates — unverified, unconfirmed and unpermitted — before it reaches the engine.
 */

import type { CallOutcome, LinkedInClient, RequestPreview } from "../engine/client.js";
import { LINKEDIN_SITE, type Plan, type PlanEntry } from "./campaign.js";
import type { AutomationStore } from "./store.js";

export type { Plan, PlanEntry } from "./campaign.js";

export type ExecutionStatus = "executed" | "unconfirmed" | "skipped" | "refused" | "failed";

export interface ExecutionOutcome {
  readonly entry: PlanEntry;
  readonly status: ExecutionStatus;
  readonly reason?: string;
  readonly next?: string;
  readonly call?: CallOutcome;
}

export interface ExecutionContext {
  readonly client: LinkedInClient;
  readonly store: AutomationStore;
  /** Confirmation for a specific entry. Absent means writes do not run. */
  readonly confirm?: (entry: PlanEntry) => boolean | Promise<boolean>;
  /** Explicit override for an operation with no observed request shape. Off by default. */
  readonly allowUnverified?: boolean;
  /** Clock, injected so the audit trail is deterministic under test. */
  readonly now?: () => Date;
}

/**
 * Failure classes that prove the write never ran, so a retry is safe.
 *
 * `input` was rejected before send, `refused` is our own guard, and `auth`/`rate`/`blocked` are
 * the server declining. `drift` and `error` are deliberately absent: a drifted template may have
 * been sent in a modified form, and a 5xx or timeout may have landed. Those are treated as
 * possibly-delivered and never retried.
 */
const CERTAINLY_NOT_SENT: ReadonlySet<string> = new Set([
  "input",
  "refused",
  "auth",
  "rate",
  "blocked",
]);

function entriesOf(plan: Plan | readonly PlanEntry[]): readonly PlanEntry[] {
  return Array.isArray(plan) ? plan : (plan as Plan).entries;
}

async function runEntry(
  entry: PlanEntry,
  ctx: ExecutionContext,
): Promise<ExecutionOutcome> {
  const at = (ctx.now?.() ?? new Date()).toISOString();
  const key = {
    leadId: entry.leadId,
    campaignId: entry.campaignId,
    stepId: entry.stepId,
  };

  if (entry.skipReason !== undefined) {
    await ctx.store.append({ ...key, outcome: "skipped", at, note: entry.skipReason });
    return { entry, status: "skipped", reason: entry.skipReason };
  }

  const isWrite = entry.kind === "write";

  if (isWrite && !entry.verified && ctx.allowUnverified !== true) {
    const reason =
      "unverified operation: no observed request shape yet; see docs/DISCOVERY.md";
    await ctx.store.append({ ...key, outcome: "skipped", at, note: reason });
    return { entry, status: "refused", reason };
  }

  if (isWrite) {
    const confirmed = ctx.confirm ? await ctx.confirm(entry) : false;
    if (!confirmed) {
      const reason = "write requires confirmation; nothing was sent";
      await ctx.store.append({ ...key, outcome: "skipped", at, note: reason });
      return { entry, status: "refused", reason };
    }
  }

  const call = await ctx.client.call(
    { site: LINKEDIN_SITE, op: entry.op, args: entry.args },
    { allowWrites: isWrite },
  );

  if (call.ok) {
    await ctx.store.append({ ...key, outcome: "executed", at });
    return { entry, status: "executed", call };
  }

  const certainlyNotSent = !isWrite || CERTAINLY_NOT_SENT.has(call.class);
  const outcome = certainlyNotSent ? "failed" : "unconfirmed";
  await ctx.store.append({ ...key, outcome, at, note: call.reason });
  return {
    entry,
    status: certainlyNotSent ? "failed" : "unconfirmed",
    reason: call.reason,
    ...(call.next !== undefined ? { next: call.next } : {}),
    call,
  };
}

export async function executePlan(
  plan: Plan | readonly PlanEntry[],
  ctx: ExecutionContext,
): Promise<readonly ExecutionOutcome[]> {
  const outcomes: ExecutionOutcome[] = [];
  for (const entry of entriesOf(plan)) {
    outcomes.push(await runEntry(entry, ctx));
  }
  return outcomes;
}

export interface PreviewOutcome {
  readonly entry: PlanEntry;
  readonly preview?: RequestPreview;
  readonly error?: string;
}

/**
 * Dry-run: render the exact request every writable step would send, and send nothing.
 *
 * Reading the result is the operator's last chance to catch a wrong recipient or body before a
 * message is real, so this previews every write that would run — including ones later refused for
 * want of a spec, because seeing the intended shape is what the discovery workflow needs.
 */
export async function previewPlan(
  plan: Plan | readonly PlanEntry[],
  ctx: { readonly client: LinkedInClient },
): Promise<readonly PreviewOutcome[]> {
  const outcomes: PreviewOutcome[] = [];
  for (const entry of entriesOf(plan)) {
    if (entry.kind !== "write" || entry.skipReason !== undefined) continue;
    try {
      const preview = await ctx.client.preview({
        site: LINKEDIN_SITE,
        op: entry.op,
        args: entry.args,
      });
      outcomes.push({ entry, preview });
    } catch (error) {
      outcomes.push({
        entry,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}

