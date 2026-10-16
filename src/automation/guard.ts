/**
 * The account guard: the last line before a write, and the first one checked.
 *
 * The most expensive mistake this system can make is sending a real message from the wrong
 * account — a test run that accidentally reaches a personal profile. Every other write gate can be
 * misconfigured; this one cannot be satisfied by configuration alone, because it compares the
 * account that is actually signed in against an explicit allow-list.
 *
 * An empty allow-list permits nothing. "No list" is not "no restriction".
 */

export type GuardDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** Account handles are compared case-insensitively and without surrounding space. */
export function normaliseAccount(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAllowedAccounts(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const accounts: string[] = [];
  for (const part of raw.split(",")) {
    const account = normaliseAccount(part);
    if (account === "" || seen.has(account)) continue;
    seen.add(account);
    accounts.push(account);
  }
  return accounts;
}

export function decideAccount(
  signedInAs: string | undefined,
  allowed: readonly string[],
): GuardDecision {
  if (allowed.length === 0) {
    return {
      ok: false,
      reason:
        "no account is allow-listed, so no write may be sent; set " +
        "LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS to the test account's public id",
    };
  }

  if (signedInAs === undefined || signedInAs.trim() === "") {
    return {
      ok: false,
      reason:
        "the signed-in account is unknown, so no write may be sent; run " +
        '"linkedin-automator doctor" to check the session',
    };
  }

  const account = normaliseAccount(signedInAs);
  if (!allowed.includes(account)) {
    return {
      ok: false,
      reason:
        `signed in as "${signedInAs}", which is not in the allow-list ` +
        `(${allowed.join(", ")}); refusing to write from an account that is not allow-listed`,
    };
  }

  return { ok: true };
}
