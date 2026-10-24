/**
 * Does the stored session still hold its login cookies — and, if a call destroys it, put it back?
 *
 * api-anything replaces the stored jar with its browser profile's cookies when a call fails and it
 * tries to self-heal (`refreshCookies` in its `execute.ts`). After a `--cookies` or browser import
 * there is no browser profile holding the same account, so that replacement drops `li_at` and
 * `JSESSIONID` and every later call fails with what looks like the account's fault. Nothing reports
 * the swap, so `doctor` reads the file itself, and `protectSession` restores it around a call.
 *
 * This reads and restores api-anything's documented home layout (`<home>/sessions/<site>.json`) and
 * deliberately does not import the package: the contract in this folder keeps that to
 * `api-anything.ts`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** The cookies that make a stored session a signed-in one, in the order a report should name them. */
export const LOGIN_COOKIES: readonly string[] = ["li_at", "JSESSIONID"];

export interface SessionHealth {
  /** Every cookie name in the stored jar, for counting and naming. */
  readonly cookieNames: readonly string[];
  /** The login cookies that are no longer in it. Empty means the jar is intact. */
  readonly missing: readonly string[];
}

function sessionPath(site: string, home?: string): string {
  const dir = home !== undefined && home !== "" ? home : path.join(homedir(), ".api-anything");
  return path.join(dir, "sessions", `${site}.json`);
}

/** The cookie names in a raw session file, or `undefined` if it is not a readable cookie jar. */
function cookieNamesFrom(raw: string): readonly string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  const cookies = (parsed as { cookies?: unknown }).cookies;
  if (!Array.isArray(cookies)) return undefined;
  return cookies.map((cookie) => String((cookie as { name?: unknown } | null)?.name ?? ""));
}

function holdsLoginCookies(raw: string): boolean {
  const names = cookieNamesFrom(raw);
  return names !== undefined && LOGIN_COOKIES.every((name) => names.includes(name));
}

/**
 * The stored session's login cookies, or `undefined` when there is no readable session.
 *
 * An absent or unparseable file is not a health finding: api-anything reports that case itself, with
 * its own remedy, on the call that needs the session.
 */
export function readSessionHealth(site: string, home?: string): SessionHealth | undefined {
  let raw: string;
  try {
    raw = readFileSync(sessionPath(site, home), "utf8");
  } catch {
    return undefined;
  }
  const cookieNames = cookieNamesFrom(raw);
  if (cookieNames === undefined) return undefined;
  return {
    cookieNames,
    missing: LOGIN_COOKIES.filter((name) => !cookieNames.includes(name)),
  };
}

export interface Protected<T> {
  readonly value: T;
  /** True when a call had destroyed the jar and this guard put the signed-in one back. */
  readonly restored: boolean;
}

/**
 * Run `operation`, then undo it if it cost the stored session its login cookies.
 *
 * api-anything's self-heal swaps the jar for its browser profile's cookies, which for an imported
 * session have no account in them. The jar the operator supplied is restored verbatim, so a failed
 * call stays a failed call instead of silently logging the account out. Only a jar that *had* its
 * login cookies is protected; there is nothing to restore into one that never held them.
 */
export async function protectSession<T>(
  site: string,
  home: string | undefined,
  operation: () => Promise<T>,
): Promise<Protected<T>> {
  const file = sessionPath(site, home);

  let before: string | undefined;
  try {
    before = readFileSync(file, "utf8");
  } catch {
    before = undefined;
  }

  const value = await operation();
  if (before === undefined || !holdsLoginCookies(before)) return { value, restored: false };

  let after: string | undefined;
  try {
    after = readFileSync(file, "utf8");
  } catch {
    after = undefined;
  }
  if (after !== undefined && holdsLoginCookies(after)) return { value, restored: false };

  try {
    writeFileSync(file, before);
    return { value, restored: true };
  } catch {
    return { value, restored: false };
  }
}
