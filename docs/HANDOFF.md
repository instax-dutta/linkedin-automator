# Handoff and findings log

Running record for whoever picks this up next — a future session, a teammate, or the operator.
Append; do not rewrite history. Each finding names how it was established, because a claim without
a source is a guess.

**Status:** the system is built and green. See [Current state](#current-state) and
[What is verified vs not](#what-is-verified-vs-not) before trusting any claim.

---

## Session 1 — 2026-10-16 — research, DOX, plan, build

Built the project from an empty directory: research into both upstream tools, the DOX tree, the
test-first implementation of the engine/automation/discovery layers, and the CLI.

### Current state

| item | value |
|---|---|
| tests | 111 passing, 13 files, all offline (`node scripts/verify-suite.mjs`) |
| typecheck | clean (`npm run check`) |
| build | emits `dist/` (`npm run build`) |
| commits | 9 atomic, conventional subjects |
| live LinkedIn calls made | **none** — nothing in this repo has ever been pointed at a real account |

### How to resume

```sh
npm install            # api-anything builds via its prepare script; see F2
npm run check          # typecheck
node scripts/verify-suite.mjs   # the suite, with the guard from F9
npm run cli -- ops     # the CLI's real interface
```

Then read, in this order: `AGENTS.md` (root contract) → `docs/RESEARCH.md` → `docs/ARCHITECTURE.md`
→ `GATES.md`.

---

## Findings

### F1 — api-anything reaches LinkedIn's internal Voyager API with reads only

Established by reading `node_modules/api-anything/sites/linkedin.md` and `sites/linkedin.json`.

Five operations ship, all verified live by the maintainers on 2026-09-27 at transport tier 1:
`getMe`, `getProfile`, `getCompany`, `searchPeople`, `searchCompanies`. The site notes say plainly:
*"Read-only: no posting, messaging, or connection requests"*, and the README adds that LinkedIn
messaging and posting are not bundled.

**Consequence:** the read half of this project is wrapping a solved problem. The write half is the
actual work, and it has to be discovered. Do not re-learn the five.

### F2 — npm 11 silently skips the build, so the engine will look broken

`npm install` reported success but printed:

```
api-anything@0.1.0 (prepare: tsc -p tsconfig.build.json)
esbuild@0.28.2 (postinstall: node install.js)
```

npm 11 blocks those scripts by default. Without the first, `api-anything` has no `dist/` and the
import fails; without the second, `tsx` cannot run and the whole test suite fails. Fixed with:

```sh
npm install-scripts approve api-anything esbuild
```

**Consequence for a fresh clone on this npm:** either approve those two, or expect a confusing
failure that looks like a code bug.

### F3 — the auth shape is the reusable fact, and it does not rotate

From `sites/linkedin.md` ("How it works"):

- the `li_at` cookie carries the session;
- the `csrf-token` header mirrors the `JSESSIONID` cookie with its quotes stripped —
  `{ "ref": "cookie:JSESSIONID", "transform": "strip-quotes", "at": ["header:csrf-token"] }`;
- the constant `x-restli-protocol-version: 2.0.0` is always present;
- and crucially, **no `decorationId` and no GraphQL `queryId`**, so nothing rotates per deploy.

**Consequence:** any operation added to this project must follow the same pattern. A baked
`decorationId` would work today and break on the next deploy, which is why `test/specs.test.ts`
asserts neither string appears in the spec.

### F4 — healing does not apply to LinkedIn, so drift means re-learning

`sites/linkedin.md` ("Known limits"): LinkedIn's profile and search pages are now React Server
Components, so the trigger pages never call those Voyager endpoints and a heal finds no matching
request. A real change surfaces as `drift` with a hint to re-add.

**Consequence:** do not design around self-healing here. Treat `drift` as "re-run the discovery
runbook" (`docs/DISCOVERY.md`).

### F5 — api-anything's library has no dry run; `--dry` is CLI-only

`src/index.ts` exports `call`, `heal`, `loadSite`, `saveSite`, `parseSite`, `capturePage`,
`addOperation`, `exportSite`, … but nothing for previewing. `--dry` lives in `dist/cli.js` and
renders through `buildRequest(op, args, redacted)`.

**Consequence and decision:** the adapter's `preview()` shells out to the pinned CLI's `--dry`
rather than re-rendering the template itself. Re-rendering would duplicate the encoding logic in
`src/codec.ts` and let a preview drift from the request that actually goes out — the one thing a
preview must never do.

Probed directly: with `API_ANYTHING_HOME` pointing at a temporary directory containing
`specs/linkedin.json`, `--dry` renders correctly **with no session and no network**. That is what
makes the integration test in `test/engine.integration.test.ts` possible.

### F6 — a nonzero CLI exit splits the cause from the hint, across two streams

Observed directly:

```
$ api-anything call linkedin sendMessage text=hi --dry
{"ok":false,"error":"no operation \"sendMessage\" on linkedin"}   # stdout, exit 1
next: api-anything ops linkedin                                    # stderr
```

The adapter originally preferred stderr and therefore reported the hint while hiding the cause.
Fixed by preferring the structured `error` field on stdout and appending the hint. The dry-run
integration test is what caught this — the unit test with a canned stderr could not have.

**Lesson worth keeping:** when adding a preview or call path, assert on the *message a person
reads*, not only on `ok: false`.

### F7 — a Voyager write spec cannot honestly be authored from memory

`specs/../spec.d.ts` (`OperationSchema`) makes `trigger.url` **required**. Write endpoints also
commonly carry rotating `decorationId`/`queryId` parameters, which F3 says must not be baked in.

A trigger describes how to make the site's own frontend fire a request. For a write nobody has
observed, that description would be invented, and inventing it on a production account sends a real
message to a real person.

**Decision:** the three write operations (`sendConnectionInvitation`, `sendMessage`, `createPost`)
exist in `src/ops/writes.ts` marked `verified: false`, with **no spec at all**. The executor refuses
them, `docs/DISCOVERY.md` is the path to promoting one, and `test/specs.test.ts` asserts the pinned
spec contains no write operation. This is the honest state, not a gap to paper over.

### F8 — LinkedIn's invitation allowances, and their provenance

LinkedIn's own rate-limit page states that standard limits are *not* published and are
per-application/member/endpoint, resetting at midnight UTC. Independent 2026 guidance converges on
roughly **80–100 invitations per day, ~200 per week, ~800 per month** per account.

**Decision:** `DEFAULT_PACING` uses 80/200/800 for invitations as ceilings to stay under, and the
governor enforces day, ISO week and month independently. Messaging and posting ceilings are equally
unpublished, so those numbers are deliberately low placeholders and are documented as such in
`src/automation/pacing.ts`. All of it is configurable; none of it is a quota to spend.

### F9 — a passing test command can be a lie

`npm test` runs the suite through a shell glob. If that glob stops matching, the run reports zero
tests, zero failures, and **exit code 0**.

Hit directly during this build: a grep for the summary lines matched nothing, which looked like a
clean pass.

**Decision:** `scripts/verify-suite.mjs` discovers the test files itself, requires a minimum number
of passes, and requires a named list of safety-property tests to be present and green. Dropping a
suite or renaming away a property fails the verifier. Use it, not bare `npm test`, when a claim
depends on the suite.

### F10 — REA's website surfaces split usefully by whether an account is needed

From `docs/browser-observation.md` and `docs/web-network-captures.md`:

- **Offline, no account:** `analyze-web-bundle` (parses script artifacts without execution and
  yields route/endpoint candidates) and `inspect-web-network-capture` (reads a saved HAR 1.2 /
  SAZ / mitmproxy capture; recorded URLs are never fetched).
- **Needs a live browser:** `list_browser_targets`, `inspect_web_page`, `observe_web_session`,
  `observe_web_execution`. CDP attachment is **passive** — REA attaches to an already-running
  target and does not drive it, so the human performs the action being learned.

REA is explicit that CDP needs a **loopback** endpoint, that attaching can disturb another client's
emulation state, and that static analysis must never be described as having observed execution.

**Decision:** `src/ree/` implements the offline paths (testable here, with a HAR fixture) and the
driver shells out to the `rea` CLI rather than reimplementing any of it. The live paths are
documented in `docs/DISCOVERY.md` for the operator to run.

### F11 — candidate detection is a proposal, never a conclusion

`discoverCandidates` labels each candidate `observed` (seen in traffic) or `inferred` (found by
static bundle analysis), keeps the REA Evidence id, and lets observed outrank inferred for the same
endpoint. Nothing is promoted to `specs/` or `src/ops/` without a person confirming the traffic.

Verified against `test/fixtures/session.har`: the reader yields 4 requests, discovery reduces them
to the 2 Voyager endpoints, and the analytics beacon on a third-party host is dropped.

### F12 — a draft trigger must be a page, not an origin

Found by a test failing on `/^https:\/\/www\.linkedin\.com\//` against `https://www.linkedin.com`.
The bare origin is not somewhere an operator can start observing from, so `toDraftSite` now
defaults the trigger to `${baseUrl}/feed/`.

### F13 — two of my own tests were asserting the wrong thing

Recorded because it is the failure mode TDD is supposed to prevent, and it happened anyway:

- The weekly-ceiling test recorded seven full days, which tripped the daily cap first, so it could
  never distinguish the two windows. Now it records three legal days and checks a fresh day is
  refused.
- The login test asserted the word "password" never appeared, but the CLI legitimately says no
  password is ever collected. Now it asserts no password *prompt* appears.

Separately, `previewPlan` was written before its test. It was removed and re-added after the tests
were watched failing, rather than kept with a test bolted on afterwards.

### F14 — the CLI's state store was not persisted

`storeFor()` built a memory store in every case, so a `run` would forget what it had already done
and a re-run would repeat spent steps — the exact failure `src/automation/store.ts` exists to
prevent. It now defaults to `${stateDir}/state.jsonl`. Found by reading the CLI path end to end,
not by a test; the tests inject their own store.

---

## What is verified vs not

**Verified here, offline:**

- the five read operations render correct Voyager requests through the real pinned CLI (F5, F7);
- the pinned spec parses, holds no credential value, and carries no rotating identifier (F3);
- writes are refused without confirmation, without permission, and without an observed shape;
- an ambiguous write is recorded as unconfirmed and never retried;
- the pacing ceilings hold at their boundaries, across day, ISO week and month;
- a re-run of a campaign performs no duplicate step;
- a dry run previews writes and sends nothing;
- discovery turns a recorded HAR into labelled candidates and a parseable draft spec.

**Not verified — do not claim otherwise:**

- **Any write endpoint.** No invite, message or post request has been observed. The three write
  operations are intents with no request shape.
- **Anything against a live LinkedIn account.** No call has been made. Session import, tier 1
  transport, healing and drift behaviour are all untested against the real site.
- **REA's live browser surfaces.** No CDP endpoint was started; only the offline candidate logic
  is exercised.
- **The invitation numbers** — secondary sources, not LinkedIn documentation.

> **Amendment, Session 6 (2026-10-17), basis: observed.** The "Anything against a live LinkedIn
> account" bullet above is superseded: live tier-1 calls have since been made and verified
> (`getMe`/`getProfile`/`getCompany`, Sessions 4–6). Still not verified live: the two searches and
> every write — see Session 6.

## Session 2 — 2026-10-16 — preparing for live verification on a throwaway account

The operator is creating a dedicated LinkedIn test account so the reads can be verified live. That
intent exposed a gap worth closing first, plus the procedure to write down.

### F15 — the missing gate was "which account am I?"

Until this session a write needed three things: an observed shape, `LINKEDIN_AUTOMATOR_ALLOW_WRITES`,
and `--confirm`. All three are satisfiable by configuration. None of them notices that the imported
session belongs to the operator's **personal** profile, and the imported session is the everyday
browser's session (F1, `sites/linkedin.md`) — so a mistaken test run would send real messages from
the account that matters most.

Added `src/automation/guard.ts`: a pure `decideAccount(signedInAs, allowed)` compared against the
`publicIdentifier` returned by `getMe`. `LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS` is the allow-list, and
**an empty list permits nothing** — "no list" must never mean "no restriction". A write now needs
all four gates, and the guard is evaluated **first**, because it is the only one that compares the
identity actually signed in rather than a flag someone set.

### F16 — a stricter gate made two older tests assert the wrong thing, on purpose

Two existing tests broke when the guard landed, and both were fixed rather than worked around:

- *"a write without confirmation is refused"* asserted the reason mentioned confirmation, but the
  guard now refuses earlier with an account reason. It was given an allow-listed account so it still
  isolates the confirmation gate it was written to protect.
- *"running without --confirm"* ran out of canned engine responses because `run` now resolves the
  signed-in account with one extra `getMe` before executing. Its fixture was updated to include it.

Recorded because the second one is a silent behaviour change: **`run` now performs one `getMe`
before executing a plan that contains writes.** That is a live read, and it is why bare `run` must
not be used as a first experiment.

### F17 — two more guessed test-count minimums were wrong, and the oracle caught both

`verify-gates.mjs` failed with "only 19 tests passed, expected at least 20" and then "only 27",
"expected at least 33". Both were my estimates rather than counts. This is the verifier doing its
job: the correction is always to set the minimum to the measured count, never to lower it below
one that would hide a removed test.

### F18 — how a session gets handed over without a credential ever being shared

`login --window` writes the session into `API_ANYTHING_HOME` on the operator's own machine. A
collaborating session only needs that directory and the environment variable, so **no cookie value
needs to pass through a chat** — hand over a path, never a value. A `li_at` value is a complete
session for the account until it expires.

Related hardening: `.gitignore` now excludes `*.har`, `*.saz`, `*.mitm`, `cookies.txt` and
`.api-anything*/`, because captures and session directories hold live cookie values. The
committed test fixture is re-included explicitly (`!test/fixtures/*.har`).

### Added in session 2

- `src/automation/guard.ts` — the account allow-list (G14).
- `linkedin-automator doctor` — the pre-flight: **one** live `getMe`, then the guard decision, then
  every read operation rendered without sending. A dead session exits 1 with api-anything's `next:`.
- `run` now resolves the signed-in account before executing and reports it, so a live run says who
  it is acting as *before* it starts rather than after it is refused.
- `docs/TESTING.md` — the full live procedure: throwaway account, session isolation, the four gates,
  the staged order (doctor → reads → pacing proof → dry run → one real write), and cleanup.

### Still not verified

Nothing changed here: no write endpoint has been observed, and no command in this session was
pointed at a live account. The reads, the guard, the pacing and the dedup guarantee are ready to be
verified for real the moment `docs/TESTING.md` steps 1-2 can run against the throwaway account.

## Session 3 — 2026-10-16 — first handover attempt

### F19 — the session was handed over as a value, through the channel the docs prohibit

The first attempt at live verification pasted a full cookie export (including `li_at`,
`JSESSIONID`, `bscookie`, `fptctx2` and `PLAY_SESSION`) into the conversation. That is the one thing
`docs/TESTING.md` §3 says not to do, and the reason is not stylistic: a `li_at` value *is* the
account until it expires, so anything that records the transcript is holding a working session.

What was done about it:

- the values were **not** written to disk, not used, and not committed;
- verified afterwards: working tree clean, last commit unchanged, no session or cookie file in the
  project, and no `AQED`-prefixed token anywhere in the repository. The only `AQED` matches are
  *detector* regexes in `test/specs.test.ts`, `test/engine.integration.test.ts` and
  `test/ree.discovery.test.ts` — patterns that assert the absence of a credential;
- recommended remedy: sign out of all sessions on that account, which invalidates `li_at`, then
  re-import locally. For a throwaway that has never been used, deleting it afterwards is also fine.

The lesson to keep: **hand over a path, never a value.** `login --window` puts the session in
`API_ANYTHING_HOME` on the operator's own machine and nothing needs to be transmitted at all.

> **Amendment, session 4.** The three bullets above were true of the *first* paste and are no longer
true of the current state, so they are corrected rather than left standing. A second export arrived
and was used: it was written to `.api-anything-test/cookies.json` (gitignored, inside the isolated
home) and imported with `login --cookies`, which is the route `docs/TESTING.md` §3 explicitly
permits. It is still true that nothing was committed: no session value is tracked in the
repository, and the cookie file lives only under an ignored directory. The prohibition the docs
carry is about *transmitting* a value — and that part still stands, because the transcript now
holds a session for `racer-cool-126519444` (which is also now revoked; see F21).

### F20 — a pre-existing session was already on this machine, and it is probably the personal one

`~/.api-anything/` already existed before this project started: `sessions/linkedin.json` dated
8 Oct, plus api-anything's own Chrome profile under `profile/`. Any command run without
`API_ANYTHING_HOME` set will use that session.

The consequence is worth stating plainly: **the default home is a personal account, so the
isolated home is not a nicety.** The account guard still prevents writes from it (a personal
handle will not be in `LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS`), but a read would be performed as that
account, and `doctor` would print its name. Always export `API_ANYTHING_HOME` first.

Not yet done: the operator has not re-imported a test session, so steps 1-2 of `docs/TESTING.md`
are still unrun. Nothing in this session was pointed at a live account.

## Session 4 — 2026-10-16 — the first live session, and how it died

### F21 — the read path works live, tier 1, and then the session was revoked

The second handover (a cookie export, the route `docs/TESTING.md` §3 permits) imported cleanly and
was used against the live site. **This is the first time anything in this project touched LinkedIn,
and the first time the engine path was proven end to end.**

Established, with output quoted:

```
# api-anything login linkedin --cookies "$API_ANYTHING_HOME/cookies.json"
{"ok":true,"site":"linkedin","source":"file","loggedIn":true, ...16 cookie names...}

# npm run cli -- doctor
session: signed in as RACER COOL (racer-cool-126519444)
  transport: tier 1 in 479ms
```

That single successful `getMe` proves four things that were previously only asserted: the pinned
spec parses against a live site, the session shape (`li_at` + `csrf-token` mirroring `JSESSIONID`)
is right, the transport really is **tier 1** with no browser, and the response mapping reaches the
CLI. The `doctor` read-render line also confirms all five read ops render.

Then, **within a minute, every later call failed**:

```
auth: HTTP 403 with login markers: CSRF check failed.
next: ask the user to run: api-anything login linkedin; then retry once
```

A raw `fetch` with the same exported cookies, bypassing api-anything entirely, returned
`302 + a Location header and an empty body` — a sign-in redirect. So the session itself is rejected
and **api-anything is exonerated**: the fault is the credential, not the adapter, the spec, or the
CLI. The most likely cause is that the jar was exported from a browser that is still signed in, and
LinkedIn revokes a session it sees used from a second client. `login --window` gives api-anything
its own session and avoids the conflict; that is now the recommended route rather than a
preference.

### F22 — a failed call silently replaces the stored session, destroying a `--cookies` import

This is the most important finding of the session, and it was found by watching the session file
rather than by reading code.

After one failed call, the stored jar went from **16 cookies including `li_at` and `JSESSIONID`** to
**4 cookies (`bcookie`, `bscookie`, `lidc`, `__cf_bm`) with no credential at all**. Reproduced
twice, deterministically.

Root cause, read from upstream: `refreshCookies()` in api-anything's `src/execute.ts` does
`saveSession(ctx.site, { ...s, cookies: fresh })` where `fresh` comes from the *browser profile*.
That is a **replacement**, not a merge — the merge path is a different function (`mergeCapture`). It
runs from the self-heal that follows an auth failure. With a `--cookies` import there is no browser
profile holding that account, so self-heal swaps a working jar for a browser-only one.

Why this matters beyond one dead session: the failure mode is **silent and looks like the account's
fault**. Every later call then reports `auth`/CSRF, and nothing anywhere says the jar was replaced.
A `--cookies` handover is therefore **one call deep** in the good case, and zero in the bad one.

Control added: `src/engine/session-health.ts` reads the stored session's cookie names, and `doctor`
reports a downgraded jar **before** it makes its call — before, because a downgraded jar is exactly
what makes the call fail, and the early return would otherwise hide the reason. Verified against the
real downgraded store, not only in tests:

```
stored session: 4 cookies, missing li_at, JSESSIONID
  a failed call replaces the stored session with its browser profile's cookies; re-import before trusting this run: api-anything login linkedin --window
session: auth: HTTP 403 with login markers: CSRF check failed.
```

### F23 — my own comparison was vacuous again (`undefined === undefined`)

While diagnosing F22 I compared the stored `li_at` against the personal session's and got `true`,
and nearly concluded the personal session had leaked into the isolated home. In fact the store held
**no `li_at` at all**, so both sides were `undefined` and the equality was meaningless.

Same family as F13: an assertion about a value that may be absent needs an absent case. The fix was
to print salted hashes with an explicit `absent` marker, which is what made the real finding
visible. The lesson generalises: **a comparison that can match two missing values proves nothing.**

### F24 — the exported session is probably not the throwaway account (unconfirmed)

Two signals suggest the second export came from the operator's everyday browser rather than a new
throwaway, and this should be confirmed before it is trusted:

- the `bscookie` in the export embeds the timestamp `2024-04-05`, i.e. a browser-session cookie from
a login established in April 2024 — not one created today;
- the account resolves to `racer-cool-126519444`, an auto-generated vanity URL of the kind a rarely
used account keeps.

It is a different account from the one in `~/.api-anything` (compared by credential hash, F23's
lesson applied), so it is *not* the 8 Oct session F20 warned about. Whether it is a throwaway or a
test account the operator cares about is a question only the operator can answer. **Nothing was
allow-listed**, so the guard kept writes off it regardless — which is the guard doing its job on an
account whose role was unknown.

### F25 — the account guard checks identity once, and the jar can change under it (not fixed)

F22 means the session file can be replaced mid-run. The account guard compares the signed-in
`publicIdentifier` **once**, at run start. In principle, then, the identity that was checked and the
identity that eventually sends a write can diverge — the guard's assumption is that a jar which
passed the check stays that jar until the run ends.

This is currently **unreachable in practice**: no write operation has a spec, so the executor
refuses every write before any of this can matter. It is recorded rather than fixed, to keep this
session's change small. The cheap control when it does matter: fingerprint the credential (a hash of
`li_at`, not the value) when the guard passes, and re-check it immediately before each write; a
mismatch aborts the run. That catches a swap without spending a `getMe` per write.

### What is verified vs not, after session 4

**Verified live, against the real site:** the session import (both routes), api-anything's tier-1
transport, the `li_at` + `csrf-token` auth shape, the pinned `getMe` spec parsing and answering, the
identity resolution, and `doctor`'s own happy path. That is the whole *reachability* question —
the engine path is real, not theoretical.

**Verified live, negatively:** that a revoked session reproduces identically through api-anything
and through a raw `fetch`, so an auth failure can be attributed rather than guessed at; and that
the self-heal jar replacement (F22) happens deterministically.

**Still not verified, at all:** every write endpoint (no spec exists, so the executor refuses
them); the five reads **on a healthy session** — only `getMe` ever answered, and it answered once;
session import, tier-1 transport, drift and healing against the real site over time; and REA's live
CDP surfaces.

**State of the machine as this session ends:** the exported session is revoked; the isolated home
at `.api-anything-test/` holds a downgraded 4-cookie jar and a dead `cookies.json`, both gitignored;
the operator's `~/.api-anything` is untouched. Nothing is authenticated, and no write path exists
to be reached.

## Session 5 — 2026-10-17 — a fresh `--cookies` import, verified live then revoked

The operator supplied a fresh JSON cookie export for the same test handle
(`racer-cool-126519444`) and asked that it work by import, without a browser sign-in. It did — for
four calls — and then died exactly as F21/F22 predicted. This session is the first with a
**partially verified live read path**: three of the five reads answered correctly before the
session was revoked.

### F26 — the fresh import was live for four reads, then LinkedIn revoked it

Imported with `api-anything login linkedin --cookies .api-anything-test/cookies.json`:
`{"ok":true,"source":"file","cookies":[…16 names incl. li_at, JSESSIONID…],"loggedIn":true}`.

Then, in order, all `tier: 1`:

| call | result |
|---|---|
| `doctor` (one `getMe`) | `signed in as RACER COOL (racer-cool-126519444)`, `tier 1 in 445ms` |
| `call getMe` | correct mini profile |
| `call getProfile publicId=williamhgates` | correct profile |
| `call getCompany universalName=microsoft` | correct company |
| `call searchPeople keywords=reid hoffman` | **`auth: HTTP 403 … CSRF check failed`** |
| `call searchCompanies keywords=anthropic` | same |

So the export carried a real session and LinkedIn accepted it for a handful of calls before
revoking it. Re-importing the **same** file afterwards did not help: even `getMe` then returned the
same 403, so the `li_at` itself is dead, not merely the stored copy. This is F21 reproduced on a
second export — a `--cookies` handover is a session measured in calls, not hours.

### F27 — F22's jar downgrade, reconfirmed with exact counts

After the first 403 the stored jar went from **16 cookies (with `li_at` and `JSESSIONID`)** to
**6 cookies — `bcookie`, `bscookie`, `lidc`, `__cf_bm`, `aam_uuid`,
`AMCV_14215E3D5995C57C0A495C55%40AdobeOrg`** — with no credential at all, and `source` left as
`file`. Exactly F22's silent replacement, on a different import.

### F28 — F19 recurred: a live session was pasted into the chat again

The export, including `li_at`, `JSESSIONID` and `PLAY_SESSION`, was pasted into the conversation —
the same prohibited handover as F19. Handling, so the record is honest:

- the values were written **only** to `.api-anything-test/cookies.json`, which `git check-ignore`
  confirms is ignored via `.api-anything*/`; nothing was committed and nothing is tracked;
- they were used through the sanctioned `login --cookies <file>` route, not a hand-typed value;
- the `li_at` was **revoked by LinkedIn within minutes** (F26), so the transcript now holds a dead
  credential rather than a working one;
- the account is not allow-listed, so even had a write spec existed the guard would have refused.

The lesson stands unchanged and is worth repeating: **hand over a path, never a value.**

### Verified live this session

- the `--cookies` import path, the tier-1 transport, and the `li_at`+`csrf-token` auth shape;
- `getMe`, `getProfile`, `getCompany` — correct payloads, `tier 1`, from `doctor` and `call`;
- `doctor`'s pre-flight (one read, rest rendered), the pacing ceiling (2nd invite blocked at
  1/day), and the dry run (`PREVIEW … unavailable — no operation "sendConnectionInvitation"`,
  nothing sent) — all as designed.

### Still not verified live

- `searchPeople` and `searchCompanies` — the session died before they could answer, so **no live
  evidence exists that these two searches work**; they remain offline-verified only (spec
  rendering, F5).
- Every write. Still no spec, still refused by the guard before anything else.
- A durable session of any kind: both handovers so far (F21, F26) died within minutes.

`--window` remains the only route with a chance of a session that survives a verification round,
since it gives api-anything its own login rather than borrowing one a browser is still using.

> **Amendment, Session 6 (2026-10-17), basis: observed.** The "only route" claim above is
> superseded. `--window` cannot even start in this machine's default browser (F29), while the
> everyday-browser import now succeeds for Opera GX and produced a live tier-1 session (F30). The
> trade-off it named is unchanged: an imported session is still borrowed from a browser that is
> using it, so it dies if that browser signs out (F21, F22, F26).

## Session 6 — 2026-10-17 — the login path, settled by how the field does it

### F29 — `--window` cannot run in Opera GX, the machine's default browser

- Established by observation, twice. On a fresh Opera GX profile the first tab is Opera's GX
  Corner (`https://gxcorner.games/`), and api-anything's window flow navigates exactly
  `ctx.pages()[0]` (`node_modules/api-anything/dist/browser.js:1142` `loginWindow`;
  `page.goto(url)` defaults to `waitUntil: "load"`). That load aborts —
  `page.goto: net::ERR_ABORTED at https://www.linkedin.com/` — and the command exits 1 with no
  session written.
- An Opera-specific incompatibility, not a config error: a fresh Chrome profile's first tab is
  navigable, Opera's is not.
- Correction to an earlier assumption: this machine's default browser is **Opera GX**
  (`com.operasoftware.operagx`, from `defaults read com.apple.LaunchServices/...`), not Chrome. The
  "development Chrome" seen earlier was plain Chrome that api-anything launched, unrelated to the
  default browser.

### F30 — Opera GX import works, and produced a live tier-1 session

- Established by running it. api-anything's built-in browser list
  (`node_modules/api-anything/dist/import.js:46` `CHROMIUM_MAC`) omits Opera, but `browserRoots()`
  honours `API_ANYTHING_BROWSER_ROOTS` (`import.js:65`). Registering Opera GX:
  `API_ANYTHING_BROWSER_ROOTS='[{"name":"Opera","family":"chromium","root":"<HOME>/Library/Application Support/com.operasoftware.OperaGX"}]'`
- Then `api-anything login linkedin` returned `{"ok":true,"source":"opera:Default","loggedIn":true,…}`
  (`li_at` + `JSESSIONID` present), `npm run cli -- doctor` reported
  `signed in as RACER COOL (racer-cool-126519444)`, `transport: tier 1 in 528ms`, and
  `call getMe` returned the same identity.
- Why it lines up: naming the root `Opera` makes the Keychain lookup use `Opera Safe Storage`,
  which exists on this machine (`Opera GX Safe Storage` does not) — the same mapping
  `stickerdaniel/linkedin-mcp-server` documents (`docs/browser-import-support.md`); and Opera GX's
  cookie DB is at `Default/Cookies`, which api-anything's `chromiumCookieDb` already reads.
- Caveat unchanged: an imported session is borrowed from Opera GX, so it dies if that browser
  signs out or LinkedIn revokes it (F21, F22, F26).

### F31 — how other LinkedIn tools manage login (ecosystem survey)

Sources: each repo's own files, read via `gh api`.

| Tool | Repo | Login mechanism |
| --- | --- | --- |
| linkedin_scraper (Playwright) | joeyism/linkedin_scraper | email/password from `.env`, form fill, warm-up visits, checkpoint/authwall detection; saves a Playwright `storageState` (`linkedin_session.json`) for reuse |
| linkedin-mcp-server (MCP) | stickerdaniel/linkedin-mcp-server | persistent browser profile as "source session" + portable cookies + `source-state.json`; `--import-from-browser` decrypts `li_at` from Chromium-family DBs (incl. Opera/Opera GX); validates `/feed/`; abandoned UA synthesis |
| linkedin-cli (Voyager) | frizynn/linkedin-cli | `LINKEDIN_COOKIE_HEADER` → `LINKEDIN_LI_AT`+`LINKEDIN_JSESSIONID` → browser extraction (Chrome/Chromium/Brave/Edge/Firefox); `auth-status`; secret hygiene |
| linvo-scraper (Puppeteer) | linvo-io/linvo-scraper | types credentials, logs in, then keeps only `li_at` from `page.cookies()` |
| Auto_job_applier (Selenium/UC) | GodsScion/Auto_job_applier_linkedIn | reuses the real Chrome `--user-data-dir`; guest-profile fallback; anti-detection driver patching |

Four patterns recur: (A) persistent browser profile / `user-data-dir`; (B) saved storage-state or
cookies; (C) `li_at`+`JSESSIONID` over plain HTTP; (D) cookie-DB extraction from the user's
everyday browser; (E) credential form-fill only when no session exists. Almost none opens its own
login window — they reuse the everyday browser session. `--window` is the outlier, and (C)+(D) is
what api-anything already does.

### Verified live this session

- the Opera GX everyday-browser import (F30), `tier 1`, on the default browser;
- `getMe` returns RACER COOL (`racer-cool-126519444`) — the test account.

### Still not verified live

- `searchPeople` and `searchCompanies` (still offline-verified only, F5).
- Every write (still no spec, still refused by the guard).

## Session 7 — 2026-10-17 — F22 fixed, and proof the borrowed session is revoked on use

### F32 — LinkedIn ends the borrowed session the moment a second client uses it

- Established by direct observation. After a fresh Opera GX relogin the import produced a valid
  `li_at` and one call worked (`doctor` + `getMe` returned RACER COOL, `tier 1` in 749ms). Within a
  minute the next call answered `auth: HTTP 401`, and a hand-rolled request carrying the same cookie
  was answered by LinkedIn with `set-cookie: li_at=delete me; Max-Age=0` — LinkedIn's own logout
  signal.
- Opera GX's own cookie DB was then read directly (`<OperaGX>/Default/Cookies`): **no `li_at` row**,
  only the logged-out leftovers (`JSESSIONID`, `bcookie`, `bscookie`, `lidc`, `sdui_ver`, stamped
  that minute). The browser that supplied the cookie had itself been signed out.
- So the session was not stale and not merely replaced by our heal: **LinkedIn revoked it, for the
  browser too.** This gives F21's "second client" suspicion its evidence, and it means importing the
  everyday browser's session is not a stable path — the borrowing is what gets it revoked.

### F22 closed — a failed call no longer destroys the stored session

- `src/engine/session-health.ts` now exports `protectSession(site, home, run)`: it snapshots the
  stored jar, runs the call, and if the call cost a jar that *had* its login cookies one of them,
  writes back the exact bytes it read. The adapter (`src/engine/api-anything.ts`) wraps every `call`
  with it, and a failure whose jar was replaced says so in its reason:
  `…; its self-heal replaced the stored session, which was then restored`.
- Only a signed-in jar is protected; a jar that never held the login cookies is left alone, and a
  call that keeps them is untouched. Tests: `test/engine.session-health.test.ts` (4) plus one
  adapter test. Suite 135 tests / 15 files; `engine` gate and build green.
- Effect: a failure now stays a failure. It no longer masquerades as "the account was logged out"
  when the cause was our own heal — which is exactly what made F21/F26/F32 impossible to separate.

## Session 8 — 2026-10-24 — code review, safety fixes, and publication

A full review of the tree (design, function, complexity, tests, naming, comments, docs) found six
behavioural defects and several documentation claims that were no longer true. Each fix had a test
watched failing first. Suite: 135 → 152 tests, 15 files. No live call was made in this session.

### F33 — the pacing budget reset in every process

`plan` and `run` started from `emptyUsage(now)`, so two CLI invocations each got a full daily
allowance and the ceiling was only enforced *within* one process. `src/automation/campaign.ts` now
rebuilds usage from the durable audit trail (`usageFromRecords`), and `ActionRecord` carries `op`
so the replay can attribute spend. Only `executed` and `unconfirmed` spend; records are replayed in
timestamp order, with an explicit `rollForward` at the end, so day/week/month windows roll as they
would have live.

Observed against the built CLI, with one `executed` invitation recorded today and
`LINKEDIN_AUTOMATOR_INVITES_PER_DAY=1`: both invitations are planned as
`invitation daily limit reached (1/1); resumes after midnight UTC`. Without the replay they would
both have been runnable.

### F34 — a stale plan could double-send

The executor trusted `entry.skipReason`. It now re-checks `store.hasDone` immediately before each
entry, so a plan built before an earlier run (or by a concurrent one) cannot repeat a spent step.
This also makes dedup the executor's guarantee rather than an assumption about the planner.

### F35 — a blocking failure did not stop the run

`docs/ARCHITECTURE.md` said `auth`, `rate` and `blocked` stop the run. `executePlan` kept going,
knocking again after LinkedIn had said no. It now stops and records every remaining entry as
`skipped` with the stopping reason, so the audit trail still accounts for all of them.

### F36 — `delayMs` was decoration

The planner computed a scheduled time (`at`), and the runner ignored it, so campaign delays never
happened. `executePlan` now waits for each entry's scheduled time, with an injectable `sleep`; a
time already in the past runs immediately rather than accumulating debt. A test proves a 5 s gap
is requested at execution and the second step is not run before it.

### F37 — a typo after `--dry` could turn a preview into a live run

The parser consumed the next word as *any* flag's value, so `--dry extra` became `dry="extra"`,
failed the `=== true` test, and executed. Unknown flags such as `--dryy` were silently ignored for
the same reason. Boolean flags are now switches, and each command declares its allowed flags; an
unknown flag exits 2 before planning, and a stray positional after `--dry` no longer changes it.

Separately, a missing campaign file reached the operator as an unhandled rejection with a stack
trace. `main` now prints one `error:` line and exits 1. The direct-invocation check also compared
`file://` + `path.resolve`, which is not a URL; it uses `pathToFileURL`.

### F38 — duplicate ids silently shadowed dedup

Dedup is keyed by `(leadId, campaignId, stepId)`. Two campaign steps sharing an id, or two leads
sharing an id, made one record cover both, so the second could send again. `loadCampaign` and
`loadLeads` now reject duplicates, naming the id.

### F39 — CodeQL's first run found two warnings, and both were worth fixing

CodeQL default setup was enabled on the published repository and its first analysis succeeded with
two results:

- `js/polynomial-redos` on `candidateName`'s `^\/+` replacement and on the trailing `\/+$` used to
  build a draft trigger. Both values come from captures or options, so both regexes were replaced
  with linear scans. Tests cover multiple leading slashes (`///voyager/api/me` → `me`; the old code
  produced `voyagerApiMe`) and a base URL ending in slashes.
- `js/incomplete-url-substring-sanitization` in a discovery test that looked for
  `"tracking.example.com"` inside a *pathname*. The assertion could pass for the wrong reason; it
  now checks `candidate.host` instead. The production filter was already correct.

### Smaller fixes

- `failureMessage` used `??` across strings, so an empty stderr produced an Error with an empty
  message; it now falls through and always names the failing operation.
- Removed `PacingConfig.minGapMs`: nothing read it. api-anything already paces tier-1 requests at
  1 s per site.
- `engineFor` called `loadConfig` twice; `plan`/`run` built two stores and two different clocks.
- Pinned the two moving third-party edges: `api-anything` to the commit the lockfile already
  resolved (`#1788526`), and `rea-agents` to `6.5.0` instead of `@latest` (`DEFAULT_REA_COMMAND`,
  overridable with `command`). An unpinned `npx` lets a third party change what executes.

### Documentation corrected

- README said nothing had ever been run live and that five reads work. Live calls exist (F21, F26,
  F30, F32) and three reads answered; the two searches remain offline-only. Rewritten to say that.
- `docs/ARCHITECTURE.md` referenced `src/automation/dryrun.ts`, which does not exist, and described
  a run path (planner guard, runner checks) that did not match the code. The failure table claimed
  an `error` gets one retry; nothing retries. Corrected.
- `docs/DISCOVERY.md` told an operator to add `specs/linkedin.read.json` or `.write.json` (the
  actual file is `specs/linkedin.json`), and claimed a suite assertion that would fail on the first
  promoted write. It now says which test to update and what to replace it with.
- `src/ops/AGENTS.md` listed enrolled-connection and experience reads that do not exist and a
  returned-shape field the descriptors do not have; `src/automation/AGENTS.md` called the
  file-backed store pure and free of filesystem access; `src/AGENTS.md` named the wrong files as
  the only ones allowed I/O. All corrected, and pacing persistence is now a stated contract.
- `docs/TESTING.md` now records the Opera GX `--window` failure (F29, force Chrome) and the fact
  that pacing is replayed from the state file.

### Publication and secret scan

- `gitleaks 8.30.1` over the full git history found one hit, the `linkedin-client-id` rule matching
  the TypeScript type name `LinkedInClient` in an import; it is a false positive, with no
  credential in it. `.gitleaks.toml` allowlists that line only, so the finding is documented rather
  than silently suppressed. The publishable tree was also archived and scanned separately. No
  session directory, captured traffic, `state/` or `dist/` is tracked; the one tracked HAR is the
  synthetic `test/fixtures/session.har`, whose request and response headers and cookies are empty.
  `.gitignore` also covers `.npmrc`, cookie exports and key material.
- The machine-generated evidence in `GATES.md` carried the operator's absolute home path; it is
  replaced with `<repo>`, with a note saying exactly that.
- Added `LICENSE` (MIT), repository/homepage/bugs metadata, and a re-verification section in
  `GATES.md` recording all twelve runnable gates plus direct exercises of the built CLI.

### Repository hardening

The public repository is <https://github.com/instax-dutta/linkedin-automator>. `gh secure` enabled
all six features it tracks: branch protection on `master` (one approving review, conversation
resolution, no force pushes or deletions, admins still able to bypass), private vulnerability
reporting, secret scanning with push protection, Dependabot alerts, Dependabot security updates,
and CodeQL default setup. The first CodeQL analysis succeeded and produced the two results in F39;
both are fixed, and the latest analysis has no open alerts. `SECURITY.md` records the private
disclosure route (GitHub advisories), what is in scope, the offline-testing rule, and the explicit
instruction never to send a session value. `.github/dependabot.yml` adds a weekly npm
version-update schedule, separate from the security-update feature `gh secure` enabled.

### Current state

| item | value |
|---|---|
| tests | 152 passing, 15 files, offline (`node scripts/verify-suite.mjs`) |
| typecheck / build | clean / emits and the built CLI runs |
| live calls this session | **none** |
| writes | still zero, still no write spec |

## Next actions, in order

1. **Stop borrowing the everyday browser; give api-anything its own session.** F32 shows a mirrored
   session dies as soon as a second client uses it, and F29 shows `--window` cannot run in Opera GX.
   The remaining route is `api-anything login linkedin --window` in **Chrome** (its own profile, the
   only client), then confirm the identity from `npm run cli -- doctor`. Keep the everyday browser
   out of it. `API_ANYTHING_BROWSER_ROOTS` + Opera GX import (F30) stays useful for a one-off
   identity check, not as the standing session.
2. **Verify the five reads live** — the only thing standing between the current state and a
   verified read path. `doctor`, then `call getMe`, `getProfile`, `getCompany`, `searchPeople`,
   `searchCompanies`, expecting `tier: 1` on each (`docs/TESTING.md` §5 step 2).
3. **Observe one write.** Follow `docs/DISCOVERY.md` with a disposable browser to capture a real
   connection-invitation request. Promote it into `specs/`, set `verified: true` in
   `src/ops/writes.ts`, and add a spec test for its shape.
4. **Add a review queue for writes.** The runner refuses writes until confirmed; a persisted
   pending-confirmation list would let an operator approve a batch after reviewing previews.
5. **Extend `src/ree/` to the live surfaces** once a CDP endpoint is available, so discovery can
   record an observed action directly rather than starting from a HAR.
6. **Consider contributing the added operations upstream** to api-anything (`CONTRIBUTING.md`
   there); wrapping shipped operations beats re-learning them, and upstream is the better home for
   a verified Voyager read.
7. **Fixed this session, keep it fixed:** the F22 guard (`protectSession`) must stay around every
   call, or a single failure will again wipe the imported session and hide the real cause (F32).
