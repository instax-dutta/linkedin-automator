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

## Next actions, in order

1. **Observe one write.** Follow `docs/DISCOVERY.md` with a disposable browser to capture a real
   connection-invitation request. Promote it into `specs/`, set `verified: true` in
   `src/ops/writes.ts`, and add a spec test for its shape.
2. **Import a session and verify the reads live.** `api-anything login linkedin`, then
   `linkedin-automator call getMe`, then `searchPeople`. This is the first real test of the engine
   path.
3. **Add a review queue for writes.** The runner refuses writes until confirmed; a persisted
   pending-confirmation list would let an operator approve a batch after reviewing previews.
4. **Extend `src/ree/` to the live surfaces** once a CDP endpoint is available, so discovery can
   record an observed action directly rather than starting from a HAR.
5. **Consider contributing the added operations upstream** to api-anything (`CONTRIBUTING.md`
   there); wrapping shipped operations beats re-learning them, and upstream is the better home for
   a verified Voyager read.
