# Testing: unit tests offline, live checks on a throwaway account

Two very different kinds of testing live in this project, and mixing them up is how a real person
receives a test message.

| | unit / integration tests | live verification |
|---|---|---|
| who runs it | `npm test`, on every change | a human, deliberately |
| touches LinkedIn | **never** | yes, one read at a time |
| account | none | a dedicated throwaway account |
| can send a write | no | only after all four gates are open |
| automated | yes | no |

---

## 1. The rule that does not bend

**No automated test may reach LinkedIn.** LinkedIn is a live third-party service with a real
account attached; a test that calls it is a bug even when it passes. Tests bind the
`LinkedInClient` port to the in-memory fake in `test/fixtures/engine.ts`, and the one test that
uses the real engine (`test/engine.integration.test.ts`) invokes `preview` only — api-anything's
`--dry`, which builds a request and never sends it.

This is verified by inspection, not assumed:

```sh
# Every client.call( in test/ is on a client built with an injected fake caller.
grep -rn "\.call(" test/
# The real-engine integration test renders 0 calls and 4 previews.
grep -c "\.call(" test/engine.integration.test.ts   # -> 0
```

If you ever need a new live behaviour covered, put the logic behind the port and test the fake.
Never "just once" against the real site.

---

## 2. Get a throwaway account

Create a **new, dedicated LinkedIn account** for verification. Do not use your primary profile.

Why this matters more than it sounds:

- The invitation allowances in `src/automation/pacing.ts` are ceilings that a test run can eat
  into. Spending them on a throwaway costs nothing; spending them on your real account does.
- LinkedIn may restrict an account that behaves unusually. That should be an account you can lose.
- An accidental write during verification is then a message between two accounts you own.

You will need **two** accounts for the full write path: the signed-in test account, and a second
account you control (the same throwaway's only real connection, or a second throwaway) as the
**explicitly authorised recipient**. Never point a verification write at anyone else.

---

## 3. Isolate the session (do not import your everyday browser)

`api-anything login linkedin` imports your everyday browser's LinkedIn cookies. That is the right
default for normal use and the wrong choice here: the imported session **is** your personal
browser session, so anything the test run does to it, and any logout, affects both.

Use an independent session in its own home directory instead:

```sh
export API_ANYTHING_HOME="$PWD/.api-anything-test"
mkdir -p "$API_ANYTHING_HOME/sites"

# Install the pinned spec so the reads resolve.
cp specs/linkedin.json "$API_ANYTHING_HOME/sites/linkedin.json"

# Sign in to the THROWAWAY account in a visible window. You type the password; nothing is
# imported and your everyday browser is untouched.
api-anything login linkedin --window
```

`.api-anything-test/` is gitignored, along with `*.har`, `*.saz` and `cookies.txt`.

### Why `--window` beats `--cookies`, measured

Both routes import. Only one survives a failure. Verified on 2026-10-16 (`docs/HANDOFF.md` F21,
F22):

- **`--cookies` answered exactly one live call and then died.** The import reported
  `loggedIn: true` with 16 cookies, and a live `getMe` replied `tier 1 in 479ms` as
  `racer-cool-126519444`. Within a minute every call returned
  `auth: HTTP 403 with login markers: CSRF check failed`, and a raw `fetch` with the same cookies
  returned `302` to a sign-in page. So the session was rejected, not the tooling. A jar exported
  out of a browser that is *still signed in* is a session LinkedIn can revoke for being used from a
  second client.
- **A failed call replaces the stored jar.** api-anything's self-heal swaps the stored session for
  its browser profile's cookies. A `--cookies` import has no matching profile, so one failure turns
  16 cookies (with `li_at` and `JSESSIONID`) into 4 browser-only ones — and every later call then
  fails as though the *account* were at fault. Silent, and it took watching the session file to
  find.
- **`--window` keeps the session inside the isolated profile:** nothing shared with your everyday
  browser, nothing transmitted. It launches its own Chrome window; if the machine's default browser
  is Opera GX, that browser's first tab is not navigable and the command aborts before LinkedIn
  loads (HANDOFF F29). Force Chrome with `API_ANYTHING_BROWSER=chrome` rather than importing the
  default browser.

`doctor` now names that state for you, before it makes its call:

```
stored session: 4 cookies, missing li_at, JSESSIONID
  a failed call replaces the stored session with its browser profile's cookies; re-import before trusting this run: api-anything login linkedin --window
```

If you see those lines, the jar is no longer a session: re-import before reading anything into
whatever the call reports next.

### About handing over credentials

**You should not need to send a login token over the chat, and this project is designed so you
do not have to.** `login --window` writes the session into `API_ANYTHING_HOME` on your machine;
a later session only needs that directory to exist and the variable pointed at it.

If a helper session does need to work with the session directly, hand over a **path**, not a value:

- preferred: the second party runs commands with `API_ANYTHING_HOME` set to that directory;
- acceptable: `api-anything login linkedin --cookies <file>` from a gitignored file, e.g.
  `cookies.txt` (Netscape format) — and share the *path*;
- never: pasting a cookie value into a message, a commit, an issue, or a spec file. A `li_at`
  value is a full session for that account; anyone who has it *is* that account until it expires.

The repository actively defends against that last case: api-anything refuses to save a spec
containing a live cookie value, and `test/specs.test.ts` independently asserts the spec holds
references only.

---

## 4. The four gates on a write

A write is refused unless **all four** are true. Each one is a separate opportunity to stop, and
the account guard is checked first because it is the one that cannot be satisfied by a flag alone.

| # | gate | how it is satisfied | what it protects against |
|---|---|---|---|
| 1 | account guard | the signed-in `publicIdentifier` is in `LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS` | sending from your **personal** account |
| 2 | observed shape | the operation has `verified: true` and a spec that was learned, not guessed | sending a malformed request |
| 3 | permission | `LINKEDIN_AUTOMATOR_ALLOW_WRITES=true` | writes turning on by accident |
| 4 | confirmation | `--confirm` on this run | a batch running unreviewed |

Gate 1 is why the test account exists. Set it to the throwaway's public id (the segment after
`linkedin.com/in/`):

```sh
export LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS="your-test-account"
```

With it unset — or set to anything that is not the account actually signed in — **no write can be
sent from anywhere**, including from your real profile, even with every other gate open. That is
deliberate: "no list" must never mean "no restriction".

---

## 5. Live verification, in order

Run these one at a time and look at each result. Stop at the first unexpected one and record it in
`docs/HANDOFF.md`.

### Step 1 — session and account

```sh
export API_ANYTHING_HOME="$PWD/.api-anything-test"
export LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS="your-test-account"

npm run cli -- doctor
```

`doctor` performs exactly **one live read** (`getMe`) and renders the rest without sending. It
prints four things you must actually read:

- **a downgraded stored session**, if there is one — see §3. It is printed before the call, because
  a replaced jar is exactly what makes the call fail;
- **which account is signed in** — if this is not the throwaway, stop and fix the session;
- **whether writes are permitted** for that account;
- **each read operation, rendered** — which proves the five specs resolve before you rely on them.

A dead session exits 1 with api-anything's own `next:` hint. The usual fix is `login` again — and
after a `--cookies` import, check §3 before assuming the account is the problem.

### Step 2 — the reads, live

```sh
npm run cli -- call getMe
npm run cli -- call getProfile    publicId=<a-public-profile>
npm run cli -- call getCompany    universalName=<a-company>
npm run cli -- call searchPeople  "keywords=<two or three words>"
npm run cli -- call searchCompanies "keywords=<two or three words>"
```

Every one is tier 1 (plain HTTP, no browser) when the session is healthy. Check three things per
call:

- `ok: true`;
- the returned identity is the thing you asked for — a search that quietly returns someone else is
  worse than a failure;
- `tier: 1`. A `tier: 2` or `3` means it fell back to a browser and something is off.

Record `class`, `reason` and `next` verbatim for anything that fails. `auth` means log in again;
`rate` means stop and lower the pacing; `drift` means the spec needs re-learning and healing will
not help (see `docs/RESEARCH.md` §1, "healing does not apply"); `input` usually means a bad
argument.

Expect `drift` to be possible at any time: LinkedIn changes without notice, and this is exactly
the signal that the pinned spec needs re-learning.

### Step 3 — the pacing, with a low ceiling

Before any write, prove the governor stops you. Run a throwaway budget so the ceiling is reached
almost immediately, and confirm the plan refuses rather than sending:

```sh
LINKEDIN_AUTOMATOR_INVITES_PER_DAY=1 npm run cli -- plan \
  --campaign test/fixtures/campaign.json --leads test/fixtures/leads.json
```

The second invitation must appear in the plan as blocked with a daily-limit reason, and nothing
should be sent. Then unset the override. The governor replays records from the state file, so an
earlier run's invitations count against the ceiling too; use a fresh `LINKEDIN_AUTOMATOR_STATE_DIR`
if you want a clean budget for a repeat of this step.

### Step 4 — a dry run

```sh
npm run cli -- run --campaign test/fixtures/campaign.json --leads test/fixtures/leads.json --dry
```

Read every `PREVIEW` line. This is the last point at which a wrong recipient or a wrong message
body is free to fix. Writes that have not been learned yet will report `unavailable — no operation
… on linkedin`, which is the correct and expected state (§6).

### Step 5 — one real write, to an account you own

Only after a spec exists and steps 1–4 are clean. Use a campaign with exactly **one lead, one
step, to the account you control**, and keep a lower pacing override set for the session.

```sh
LINKEDIN_AUTOMATOR_ALLOW_WRITES=true npm run cli -- run \
  --campaign my-one-lead.json --leads my-one-lead-leads.json --confirm
```

Then, and this is the part that is easy to skip:

- **read the result back** — check the recipient account actually received it. A 200 is an
  acknowledgement, not proof of delivery.
- check the audit trail (`state/state.jsonl`) recorded `executed`;
- re-run the same command and confirm the step is planned as `already done` — that is the dedup
  guarantee, live.

If the outcome is ambiguous (a timeout or a 5xx), the store records `unconfirmed` and **will not
retry it**. Do not force a retry by clearing state: confirm with your own eyes whether it arrived.

---

## 6. What can be verified today, and what cannot

**Verifiable now:** session import, the five reads, the account guard, the pacing ceilings, the
dedup guarantee, and the dry-run preview — because all of the machinery for those exists.

**Not verifiable yet:** every write. The three write intents in `src/ops/writes.ts` are
`verified: false` with **no spec**, because no Voyager write request has been observed. A write
must first be learned by following `docs/DISCOVERY.md` (observe the real request in a disposable
browser, then `api-anything add --write`, which intercepts and aborts while learning so the action
is never performed). Only then does gate 2 open.

Do not shortcut that by writing a spec by hand. The endpoints carry rotating identifiers, so a
plausible-looking request would fail unpredictably — and on the write path, "unpredictably" means
messaging the wrong person.

---

## 7. Cleanup between sessions

```sh
api-anything logout linkedin --home "$API_ANYTHING_HOME"   # or: rm -rf "$API_ANYTHING_HOME"
unset API_ANYTHING_HOME LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS LINKEDIN_AUTOMATOR_ALLOW_WRITES
```

Leaving a live session in a directory is a credential sitting on disk. Remove it when the round of
verification is done, and re-run `login --window` when you start again.

Finally: **append what you learned to `docs/HANDOFF.md`.** A `drift` you hit, an endpoint that
answered unexpectedly, a pacing number that felt too high — each is worth more to the next session
than a green tick, and the DOX contract in `docs/AGENTS.md` requires the log to be updated as a
finding is made rather than reconstructed afterwards.
