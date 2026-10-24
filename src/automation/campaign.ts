/**
 * The campaign model and the planner.
 *
 * Planning is where every decision about *whether* work happens is made, so that the executor only
 * ever carries out an existing plan and cannot invent work. Dry-run is this same planner with the
 * execution step removed, which is what keeps a preview from diverging from the real run.
 */

import { findOperation, validateArgs, OperationInputError } from "../ops/index.js";
import type { OperationKind } from "../ops/index.js";
import {
  decide,
  emptyUsage,
  record,
  rollForward,
  DEFAULT_PACING,
  type PacingConfig,
  type Surface,
  type Usage,
} from "./pacing.js";
import type { ActionRecord, AutomationStore } from "./store.js";

/** Every operation in this project targets the one site. */
export const LINKEDIN_SITE = "linkedin";

export interface Lead {
  readonly id: string;
  readonly [field: string]: unknown;
}

export interface CampaignStep {
  readonly id: string;
  /** An operation name from the catalog. An unknown name is a configuration error. */
  readonly op: string;
  /** Literal values, or `{{field}}` placeholders resolved from the lead. */
  readonly args: Readonly<Record<string, string | number | boolean>>;
  /** Pause before the following step. */
  readonly delayMs?: number;
}

export interface Campaign {
  readonly id: string;
  /** How the audience was obtained, recorded so a run is reproducible. */
  readonly leadSource: string;
  readonly steps: readonly CampaignStep[];
}

const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;

/**
 * Resolve `{{field}}` placeholders from a lead.
 *
 * A field the lead does not have is an error rather than a literal `{{field}}` in the request: the
 * latter would send a message containing the placeholder text to a real person.
 */
export function renderArgs(
  template: Readonly<Record<string, string | number | boolean>>,
  lead: Lead,
): Record<string, unknown> {
  const rendered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (typeof value !== "string") {
      rendered[key] = value;
      continue;
    }
    rendered[key] = value.replace(PLACEHOLDER, (_match, field: string) => {
      const resolved = lead[field];
      if (resolved === undefined || resolved === null) {
        throw new Error(`lead "${lead.id}" has no field "${field}" for {{${field}}}`);
      }
      return String(resolved);
    });
  }
  return rendered;
}

/**
 * Which budget an operation spends. Reads are absent on purpose: they have no published allowance,
 * and api-anything already spaces tier-1 requests to one site a second apart.
 */
const SURFACE_BY_OP: Readonly<Record<string, Surface>> = {
  sendConnectionInvitation: "invitation",
  sendMessage: "message",
  createPost: "post",
};

/** Which budget an operation spends, if any. Reads have no published allowance. */
export function surfaceOf(op: string): Surface | undefined {
  return SURFACE_BY_OP[op];
}

/**
 * Reconstruct the pacing budget from the durable audit trail.
 *
 * A governor that starts at zero in every process protects nothing: a second CLI invocation would
 * get a fresh allowance and a retried campaign could exceed the very ceiling it checked. Only
 * `executed` and `unconfirmed` spend budget, because only those may have reached LinkedIn.
 *
 * Records are replayed in timestamp order so a window boundary inside the history rolls the
 * counters exactly as it would have live, then rolled forward to `now`. A record without `op`
 * cannot be attributed to a surface and is ignored rather than guessed; those predate this field.
 */
export function usageFromRecords(records: readonly ActionRecord[], now: Date): Usage {
  const ordered = [...records].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let usage = emptyUsage(now);

  for (const action of ordered) {
    if (action.outcome !== "executed" && action.outcome !== "unconfirmed") continue;
    if (action.op === undefined) continue;
    const surface = surfaceOf(action.op);
    if (surface === undefined) continue;
    const at = new Date(action.at);
    if (Number.isNaN(at.getTime())) continue;
    usage = record(usage, surface, at);
  }

  return rollForward(usage, now);
}

export interface PlanEntry {
  readonly campaignId: string;
  readonly leadId: string;
  readonly stepId: string;
  readonly op: string;
  readonly kind: OperationKind;
  readonly args: Record<string, unknown>;
  /** Writes always require confirmation; reads never do. */
  readonly requiresConfirmation: boolean;
  /** False when no observed request shape exists, which makes a write un-runnable. */
  readonly verified: boolean;
  /** When this step would run, ISO-8601. */
  readonly at: string;
  /** Present when the planner decided this step must not run. */
  readonly skipReason?: string;
}

export interface Plan {
  readonly entries: readonly PlanEntry[];
  /** The budget after this plan, so a plan's own arithmetic is checkable. */
  readonly usageAfter: Usage;
}

export interface PlanOptions {
  readonly store: AutomationStore;
  readonly usage: Usage;
  readonly now: Date;
  readonly config?: PacingConfig;
}

function explain(error: unknown): string {
  if (error instanceof OperationInputError) {
    return error.hint ? `${error.message} — ${error.hint}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Expand a campaign over its leads into concrete actions, without performing any of them.
 *
 * An operation name that does not exist rejects the whole plan: a typo in a campaign file must be
 * loud, not silently skipped.
 */
export async function planCampaign(
  campaign: Campaign,
  leads: readonly Lead[],
  options: PlanOptions,
): Promise<Plan> {
  const config = options.config ?? DEFAULT_PACING;
  const entries: PlanEntry[] = [];
  let usage = options.usage;
  let offsetMs = 0;

  for (const lead of leads) {
    for (const step of campaign.steps) {
      const descriptor = findOperation(step.op);

      const at = new Date(options.now.getTime() + offsetMs).toISOString();
      offsetMs += step.delayMs ?? 0;

      let args: Record<string, unknown> = {};
      let skipReason: string | undefined;
      try {
        args = renderArgs(step.args, lead);
        validateArgs(descriptor, args);
      } catch (error) {
        skipReason = explain(error);
      }

      if (skipReason === undefined) {
        if (await options.store.hasDone(lead.id, campaign.id, step.id)) {
          skipReason = "already done";
        }
      }

      if (skipReason === undefined) {
        const surface = SURFACE_BY_OP[step.op];
        if (surface) {
          const decision = decide(usage, surface, options.now, config);
          if (decision.ok) {
            usage = record(usage, surface, options.now);
          } else {
            skipReason = decision.reason;
          }
        }
      }

      entries.push({
        campaignId: campaign.id,
        leadId: lead.id,
        stepId: step.id,
        op: step.op,
        kind: descriptor.kind,
        args,
        requiresConfirmation: descriptor.kind === "write",
        verified: descriptor.verified,
        at,
        ...(skipReason !== undefined ? { skipReason } : {}),
      });
    }
  }

  return { entries, usageAfter: usage };
}
