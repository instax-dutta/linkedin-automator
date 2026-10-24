# Security policy

## Reporting a vulnerability

Please report security issues **privately**, through GitHub's private vulnerability reporting:

<https://github.com/instax-dutta/linkedin-automator/security/advisories/new>

Do not open a public issue for a vulnerability, and **do not include a live credential** in a
report, an issue, a commit, or a chat. A LinkedIn `li_at` cookie is a complete session for the
account until it expires. If you believe a session value has leaked, sign out of all sessions on
that account first — that invalidates it — and never send the value.

## What to report

This repository:

- the CLI (`src/cli.ts`) and the library (`src/index.ts`);
- the campaign, pacing, dedup, confirmation and account-guard logic in `src/automation/`;
- the `LinkedInClient` port and the api-anything adapter in `src/engine/`;
- the pinned site spec in `specs/`.

The most useful reports explain one of:

- a way a write can reach the engine without all four gates: an observed request shape, the account
  allow-list, `LINKEDIN_AUTOMATOR_ALLOW_WRITES=true`, and `--confirm`;
- a way a dry run can send, or a preview can diverge from the request that is actually sent;
- a pacing or dedup bypass that allows more actions than the configured ceiling, or repeats a step
  the store already spent;
- a stored session or credential disclosed through a log, an audit record, a spec, or the CLI;
- a dependency, build-path or supply-chain issue in this repository's own code.

Out of scope: LinkedIn's own service; `api-anything` and `rea` upstream (report those to their
maintainers); social engineering; denial of service against LinkedIn; and any test against an
account you do not own or are not authorized to use.

## Please do not test against a live account

The suite is offline by design and should stay that way. Use the injectable `LinkedInClient` port
and the fakes in `test/fixtures/` to demonstrate a bug. If a live reproduction is unavoidable, use
an account you own and can lose, isolate it with `API_ANYTHING_HOME`, keep every write closed, and
say so in the report. Never test against another person's account or profile.

## What to include

- the commit or version;
- what you expected and what happened;
- a minimal reproduction, ideally a failing test;
- the impact you believe it has;
- whether a live account or a real credential was involved — and if so, only that fact, never the
  value.

## What to expect

This is a small, best-effort project with no bounty and no service-level promise. Reports are
triaged as time allows, typically within three business days for an initial response. If a report
is valid, the fix and a regression test land together and an advisory is published after the fix is
available. Please allow a reasonable window — 90 days by default — before public disclosure; we
will say so if a fix will take longer.

## Safe harbour

Good-faith research on your own copy, with your own test account, is welcome, and we will not
pursue legal action for research that stays within this policy. That does not authorize accessing
other people's data, degrading LinkedIn's service, evading its access controls, or sending writes
from an account you do not own.

## Supported versions

The latest commit on `master` is supported. There are no maintained release branches yet; fixes
land there first.

## Scope of this policy

This policy covers this repository only. LinkedIn's terms and the upstream tools' policies still
apply to how you use it.
