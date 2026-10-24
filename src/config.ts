/**
 * Operator configuration, and loading of campaign and lead files.
 *
 * Dangerous switches default to off and require an explicit affirmative, because the cost of
 * accidentally enabling writes is a real message to a real person.
 */

import { DEFAULT_PACING, type PacingConfig } from "./automation/pacing.js";
import { parseAllowedAccounts } from "./automation/guard.js";
import type { Campaign, CampaignStep, Lead } from "./automation/campaign.js";
import { findOperation } from "./ops/index.js";

export interface Config {
  readonly stateDir: string;
  readonly pacing: PacingConfig;
  /** Both this and a per-run confirmation are required before any write is sent. */
  readonly allowWrites: boolean;
  /** Permits a write whose request shape has never been observed. Off, deliberately. */
  readonly allowUnverified: boolean;
  /**
   * Accounts permitted to send writes. Empty means no write may be sent from any account, which is
   * the default: the guard exists so a test run cannot reach a personal profile.
   */
  readonly allowedAccounts: readonly string[];
  readonly apiAnythingHome?: string;
}

function affirmative(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "true" || normalised === "1";
}

/** Only a plain positive integer is accepted: a typo must be loud, not silently clamped. */
function positiveInt(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw.trim())) {
    throw new Error(`${key} must be a positive whole number, got "${raw}"`);
  }
  return Number(raw.trim());
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Config {
  return {
    stateDir: env.LINKEDIN_AUTOMATOR_STATE_DIR ?? "state",
    pacing: {
      ...DEFAULT_PACING,
      invitation: {
        ...DEFAULT_PACING.invitation,
        perDay: positiveInt(env, "LINKEDIN_AUTOMATOR_INVITES_PER_DAY", DEFAULT_PACING.invitation.perDay),
      },
      message: {
        ...DEFAULT_PACING.message,
        perDay: positiveInt(env, "LINKEDIN_AUTOMATOR_MESSAGES_PER_DAY", DEFAULT_PACING.message.perDay),
      },
      post: {
        ...DEFAULT_PACING.post,
        perDay: positiveInt(env, "LINKEDIN_AUTOMATOR_POSTS_PER_DAY", DEFAULT_PACING.post.perDay),
      },
    },
    allowWrites: affirmative(env.LINKEDIN_AUTOMATOR_ALLOW_WRITES),
    allowUnverified: affirmative(env.LINKEDIN_AUTOMATOR_ALLOW_UNVERIFIED),
    allowedAccounts: parseAllowedAccounts(env.LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS),
    ...(env.API_ANYTHING_HOME !== undefined && env.API_ANYTHING_HOME !== ""
      ? { apiAnythingHome: env.API_ANYTHING_HOME }
      : {}),
  };
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${what} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readStep(value: unknown, index: number): CampaignStep {
  const step = asObject(value, `step ${index}`);
  const { id, op, args, delayMs } = step;

  if (typeof id !== "string" || id === "") throw new Error(`step ${index} needs an "id"`);
  if (typeof op !== "string" || op === "") throw new Error(`step ${index} ("${id}") needs an "op"`);

  // An operation that does not exist is refused here, so a typo cannot produce a silent no-op run.
  const descriptor = findOperation(op);
  const declared = new Set(descriptor.params.map((param) => param.name));

  let renderedArgs: Record<string, string | number | boolean> = {};
  if (args !== undefined) {
    const raw = asObject(args, `step ${index} ("${id}") args`);
    for (const [key, argValue] of Object.entries(raw)) {
      if (!declared.has(key)) {
        throw new Error(
          `step "${id}" passes unknown argument "${key}" to ${op}; expected ${[...declared].join(", ") || "none"}`,
        );
      }
      if (
        typeof argValue !== "string" &&
        typeof argValue !== "number" &&
        typeof argValue !== "boolean"
      ) {
        throw new Error(`step "${id}" argument "${key}" must be a string, number or boolean`);
      }
      renderedArgs[key] = argValue;
    }
  }

  if (delayMs !== undefined && (typeof delayMs !== "number" || delayMs < 0)) {
    throw new Error(`step "${id}" delayMs must be a non-negative number`);
  }

  return {
    id,
    op,
    args: renderedArgs,
    ...(typeof delayMs === "number" ? { delayMs } : {}),
  };
}

export function loadCampaign(text: string): Campaign {
  const raw = asObject(parseJson(text, "campaign"), "campaign");
  const { id, leadSource, steps } = raw;

  if (typeof id !== "string" || id === "") throw new Error('campaign needs an "id"');
  if (typeof leadSource !== "string" || leadSource === "") {
    throw new Error('campaign needs a "leadSource" recording where the audience came from');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('campaign needs a non-empty "steps" array');
  }

  const parsed = steps.map(readStep);
  const seen = new Set<string>();
  for (const step of parsed) {
    if (seen.has(step.id)) {
      throw new Error(`campaign has duplicate step id "${step.id}"; ids key the dedup record`);
    }
    seen.add(step.id);
  }

  return { id, leadSource, steps: parsed };
}

export function loadLeads(text: string): readonly Lead[] {
  const parsed = parseJson(text, "leads");
  if (!Array.isArray(parsed)) throw new Error("leads must be a JSON array");

  const leads = parsed.map((value, index) => {
    const lead = asObject(value, `lead ${index}`);
    const { id } = lead;
    if (typeof id !== "string" || id === "") throw new Error(`lead ${index} needs a string "id"`);
    return { ...lead, id } as Lead;
  });

  const seen = new Set<string>();
  for (const lead of leads) {
    if (seen.has(lead.id)) {
      throw new Error(`duplicate lead id "${lead.id}"; ids key the dedup record`);
    }
    seen.add(lead.id);
  }

  return leads;
}
