/**
 * The rate-limit governor: the only component allowed to decide that an action may not happen yet.
 *
 * Pure and injectable. `now` arrives as an argument because the behaviour *is* the window
 * boundary, and a boundary that reads the clock itself cannot be tested at the boundary.
 *
 * Defaults come from LinkedIn's practical envelope rather than its documentation, which does not
 * publish standard limits. Independent 2026 guidance agrees on roughly 80-100 invitations per day,
 * ~200 per week and ~800 per month per account, with daily windows resetting at midnight UTC.
 * These are conservative ceilings to stay under, never targets: they are configuration, not a
 * quota to spend.
 */

export type Surface = "invitation" | "message" | "post";

export interface SurfaceBudget {
  readonly perDay: number;
  readonly perWeek: number;
  readonly perMonth: number;
}

export interface PacingConfig {
  readonly invitation: SurfaceBudget;
  readonly message: SurfaceBudget;
  readonly post: SurfaceBudget;
}

export const DEFAULT_PACING: PacingConfig = {
  // The only numbers here with a published source. Treated as ceilings to stay under.
  invitation: { perDay: 80, perWeek: 200, perMonth: 800 },
  // Messaging limits are equally unpublished. Deliberately well under any plausible ceiling.
  message: { perDay: 100, perWeek: 400, perMonth: 1200 },
  post: { perDay: 3, perWeek: 10, perMonth: 30 },
};

export interface SurfaceUsage {
  readonly day: number;
  readonly week: number;
  readonly month: number;
}

export interface Usage {
  readonly window: { readonly day: string; readonly week: string; readonly month: string };
  readonly invitation: SurfaceUsage;
  readonly message: SurfaceUsage;
  readonly post: SurfaceUsage;
}

export interface PacingAllowance {
  readonly ok: true;
}

export interface PacingRefusal {
  readonly ok: false;
  readonly class: "rate";
  readonly reason: string;
}

export type PacingDecision = PacingAllowance | PacingRefusal;

const ZERO: SurfaceUsage = { day: 0, week: 0, month: 0 };

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isoMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** ISO-8601 week key, so a window boundary is a Monday rather than an arbitrary rollover. */
function isoWeek(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset + 3); // the week's Thursday owns the year
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstMondayOffset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstMondayOffset + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function windowOf(now: Date): Usage["window"] {
  return { day: isoDay(now), week: isoWeek(now), month: isoMonth(now) };
}

export function emptyUsage(now: Date): Usage {
  return {
    window: windowOf(now),
    invitation: ZERO,
    message: ZERO,
    post: ZERO,
  };
}

/** Drop counters whose window has expired, so yesterday's exhaustion cannot block today. */
function rollOver(usage: Usage, now: Date): Usage {
  const target = windowOf(now);
  if (
    usage.window.day === target.day &&
    usage.window.week === target.week &&
    usage.window.month === target.month
  ) {
    return usage;
  }
  const roll = (surface: SurfaceUsage): SurfaceUsage => ({
    day: usage.window.day === target.day ? surface.day : 0,
    week: usage.window.week === target.week ? surface.week : 0,
    month: usage.window.month === target.month ? surface.month : 0,
  });
  return {
    window: target,
    invitation: roll(usage.invitation),
    message: roll(usage.message),
    post: roll(usage.post),
  };
}

/**
 * The same usage seen through `now`'s window: counters whose window has expired drop to zero.
 *
 * Callers that replay history need this after the replay, because the last record may be older
 * than the `now` the next decision will use.
 */
export function rollForward(usage: Usage, now: Date): Usage {
  return rollOver(usage, now);
}

/** Record one action. Returns a new usage; never mutates the argument. */
export function record(usage: Usage, surface: Surface, now: Date): Usage {
  const rolled = rollOver(usage, now);
  const current = rolled[surface];
  return {
    ...rolled,
    [surface]: {
      day: current.day + 1,
      week: current.week + 1,
      month: current.month + 1,
    },
  } as Usage;
}

/** May one more action on this surface happen now? */
export function decide(
  usage: Usage,
  surface: Surface,
  now: Date,
  config: PacingConfig = DEFAULT_PACING,
): PacingDecision {
  const rolled = rollOver(usage, now);
  const used = rolled[surface];
  const limits = config[surface];

  if (used.day >= limits.perDay) {
    return {
      ok: false,
      class: "rate",
      reason: `${surface} daily limit reached (${used.day}/${limits.perDay}); resumes after midnight UTC`,
    };
  }
  if (used.week >= limits.perWeek) {
    return {
      ok: false,
      class: "rate",
      reason: `${surface} weekly limit reached (${used.week}/${limits.perWeek})`,
    };
  }
  if (used.month >= limits.perMonth) {
    return {
      ok: false,
      class: "rate",
      reason: `${surface} monthly limit reached (${used.month}/${limits.perMonth})`,
    };
  }
  return { ok: true };
}
