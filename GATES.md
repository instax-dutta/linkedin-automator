# Gates: linkedin-automator build

OWNS: src/**, test/**, specs/**, scripts/**, docs/**, AGENTS.md, GATES.md, PLAN.md, package.json

Scope: a LinkedIn automation system whose reads run on api-anything and whose write path is
refused by default, planned before it acts, and provable without touching a live account.

> **Publication note (2026-10-24).** The machine-generated evidence lines below originally carried
> the operator's absolute local path. It has been replaced with `<repo>` so the public repository
> does not publish a home directory. The commands, exit statuses, output hashes and test counts are
> otherwise unchanged. A fresh re-verification after the code-review fixes is recorded at the end
> of this file.

- [x] G1: the whole suite passes, with the named safety-property tests present and green
  CHECK: node scripts/verify-suite.mjs
  EXPECT: suite verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d206b0d7f69127bed1c5fd696c19f131dfcb88d7687e83df38d61f556abab451; exit=0; EXPECT=matched; output-sha256=19f634dfd98e75e0fff3456929af52844a8c7c6719b6c27e040cf1c65d563868; output-bytes=48; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G2: src and test compile with no type errors
  CHECK: node scripts/verify-typecheck.mjs
  EXPECT: typecheck passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=b1f4bb997a1386556f4e4d5acc883d881fd44a425b32e4d71925cb4bab048fd0; exit=0; EXPECT=matched; output-sha256=a6ab3fb2b6d250da3a2a07eb14cb02d7be573a476a89e2b8aa32a7447d6d34c2; output-bytes=55; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G3: the build emits dist and the emitted CLI runs and lists the catalog
  CHECK: node scripts/verify-build.mjs
  EXPECT: build verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=4d83bccd3bd90a6b4603c4581cced030b3ff3b0f0b7a9962c705fbb76072f93b; exit=0; EXPECT=matched; output-sha256=8b850b4db3c07ae104b24a017957617182c84c7f8f952d13e4eac216066a8a6c; output-bytes=58; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G4: the engine port maps success and failure faithfully and threads write permission explicitly
  CHECK: node scripts/verify-gates.mjs engine
  EXPECT: engine gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=0e49eebb9445fc89831a2846f7128fdfe7c7f9a7fa0057b90cb6bb057ed89839; exit=0; EXPECT=matched; output-sha256=5b728a82edb5f2e9572ecfef5a6669aae15b932b4c7e623d4b84285775d37cef; output-bytes=75; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G5: a write is refused without confirmation, without permission, and without an observed shape; an ambiguous write is never retried
  CHECK: node scripts/verify-gates.mjs safety
  EXPECT: safety gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d350044de92a8e20f509e66345db84bd131da7297494e31c7580e067e386f526; exit=0; EXPECT=matched; output-sha256=14fde3f01cfda55d98e11bb08ab8639d0cecab12ff01897e92560091d2448e8d; output-bytes=110; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G14: a write is refused unless the signed-in account is allow-listed, an empty allow-list permits nothing, and the guard is reached before any other write gate
  CHECK: node scripts/verify-gates.mjs account
  EXPECT: account gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=21a680d7c84440bb0a757c9946611bae905db4cb187f6439cf62a68d6cd9eaf7; exit=0; EXPECT=matched; output-sha256=0b5b73f6c145dd151a95972808d77c82d8a02f9f844316feeed0172e4fe01b05; output-bytes=112; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G6: the invitation ceilings hold at their boundaries across day, ISO week and month
  CHECK: node scripts/verify-gates.mjs pacing
  EXPECT: pacing gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=175268e01aed8ca056f60ab5b161d04c4d6d56883f9bf828a6c98700f5a4eb91; exit=0; EXPECT=matched; output-sha256=84d3bee33806945e4fb425863894cb1c160348d9abef680f61f089453e222f98; output-bytes=94; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G7: a campaign expands in order, a spent step is planned as skipped, and a plan never overspends its budget
  CHECK: node scripts/verify-gates.mjs planner
  EXPECT: planner gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=52007a886ba564367e734fa3610adee3397dd1b5ff762a56d892932494d5c93f; exit=0; EXPECT=matched; output-sha256=0ed899cae123c3c77f68c5c4a4fd829cfdfc9b4bc6641b5a7f21baeb902a597d; output-bytes=99; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G8: the pinned spec parses, holds no credential value, has no rotating identifier, and declares no write
  CHECK: node scripts/verify-gates.mjs specs
  EXPECT: specs gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=a8f044c5f719161f314cc8b6100a5bd37c772742101de55bb6f05579e35cc928; exit=0; EXPECT=matched; output-sha256=63a7e7c9fb2c969194169acbc425d792f128894a311e5a6d9477673b9298c86a; output-bytes=107; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G9: every catalogued read renders a correct Voyager request through the real pinned engine, offline
  CHECK: node scripts/verify-gates.mjs reads
  EXPECT: reads gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=e973e538569c77d702c13e9e2253f15882e17feda39ce20ddabd56d6df5dda9c; exit=0; EXPECT=matched; output-sha256=bebb90d7c41b63d262e17a2600cccd1acf55ce7ad8214ea80a3e703b5d4324a1; output-bytes=97; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G10: recorded traffic becomes labelled candidates and a parseable draft spec
  CHECK: node scripts/verify-gates.mjs discovery
  EXPECT: discovery gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=5388fdd78f778ce61c02519fb3e0f9766d5daad0a4479ee917a5f44480db9c4b; exit=0; EXPECT=matched; output-sha256=0f3341398d3bdbfa09273ca618d2152c465e9c77446076316cdb55b15aac71b8; output-bytes=92; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G11: the CLI lists the catalog, plans without acting, refuses writes through its real interface, and points sign-in at api-anything
  CHECK: node scripts/verify-gates.mjs cli
  EXPECT: cli gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=3294cec901d963383df8221f0a310122751ae75333b991989a22756c9baa80f8; exit=0; EXPECT=matched; output-sha256=7659e3abbeb3a56fb31196e4aea48bcc95cf576f26ab7c1bd8d78c3ba3acfb2d; output-bytes=103; shell=/bin/sh; cwd=<repo>; path=b93c3fbfaca3/30 entries

- [x] G12: no automated test reaches the network, and every live call this project has made is recorded in docs/HANDOFF.md
  EVIDENCE: Reviewed by hand on 2026-10-16, and **this gate's original claim was false and is corrected here.** It read "nothing here has been run against a live LinkedIn account". That stopped being true in session 4, when a handed-over session was imported and used. The live calls are exactly four, and docs/HANDOFF.md session 4 records each: one `doctor` (one `getMe`) that answered as `racer-cool-126519444` at tier 1 in 479ms; two `call getMe` attempts, both auth failures; and one raw `fetch` probe returning `302`. All four used the isolated home `.api-anything-test`; `~/.api-anything` — which holds a personal session dated 8 Oct — was never used, checked by comparing credential hashes rather than values (F23). No test was pointed at the network: every `client.call(` in test/ is on a client built with an injected fake caller, test/engine.integration.test.ts contains 0 calls and 4 previews, and api-anything is otherwise driven only through `--dry`, which builds a request and never sends it. Bare `run` was not executed, because it issues real reads.

- [x] G15: doctor reports a stored session that has lost its login cookies, through its real interface and before it makes its call
  EVIDENCE: Hand-attested, because the check needs a real downgraded session and a live call it deliberately does not complete — a runnable check would have to assert on a nonzero exit. Run against the actual downgraded store on 2026-10-16, not only in tests:
  `$ API_ANYTHING_HOME=$PWD/.api-anything-test npm run cli -- doctor`
  printed, before the auth failure and therefore not hidden by it:
  `stored session: 4 cookies, missing li_at, JSESSIONID`
  `  a failed call replaces the stored session with its browser profile's cookies; re-import before trusting this run: api-anything login linkedin --window`
  `session: auth: HTTP 403 with login markers: CSRF check failed.`
  exit=1. Placement is the property: the warning is emitted before the `getMe`, because a downgraded jar is exactly what makes that call fail and the early return on failure would otherwise hide the reason for it. The behaviour is also covered automatically, against a temporary home, by the three tests behind G11 (including "doctor warns when the stored session has lost its login cookies", which scripts/verify-suite.mjs now requires by name).

- [x] G13: the handoff log names, for each finding, how it was established, and its unverified list matches reality
  EVIDENCE: Reviewed by hand on 2026-10-16. docs/HANDOFF.md records F1-F25 across four session entries, and each finding names its basis as a specific upstream file, a command whose output is quoted, or a direct probe (for example F5 quotes the `--dry` probe output, F6 quotes stdout and stderr separately, F21 quotes the live `doctor` output beside the raw-`fetch` result that attributes the failure, and F22 quotes the doctor warning it produced). Session 4 also carries an explicit amendment to F19, because that finding's claim that the handed-over values were never written to disk stopped being true when a second export was imported; the log is corrected rather than left standing. The file ends with a verified/unverified split and an ordered next-action list. The unverified list was cross-checked against the code: the three write operations in src/ops/writes.ts are `verified: false` with no spec entry, test/specs.test.ts asserts the pinned spec declares zero write operations, and no Voyager write request shape exists anywhere in the repository.

## Re-verification — 2026-10-24, after the code-review fixes

Every runnable gate above was re-executed from the reviewed tree. No live LinkedIn call was made.

| gate | command | result |
|---|---|---|
| G1 | `node scripts/verify-suite.mjs` | `suite verification passed (151 tests, 15 files)` |
| G2 | `node scripts/verify-typecheck.mjs` | `typecheck passed (src and test compile with no errors)` |
| G3 | `node scripts/verify-build.mjs` | `build verification passed (dist emitted and the CLI runs)` |
| G4 | `node scripts/verify-gates.mjs engine` | passed, 10 tests |
| G5 | `node scripts/verify-gates.mjs safety` | passed, 31 tests |
| G14 | `node scripts/verify-gates.mjs account` | passed, 10 tests |
| G6 | `node scripts/verify-gates.mjs pacing` | passed, 7 tests |
| G7 | `node scripts/verify-gates.mjs planner` | passed, 22 tests |
| G8 | `node scripts/verify-gates.mjs specs` | passed, 10 tests |
| G9 | `node scripts/verify-gates.mjs reads` | passed, 4 tests |
| G10 | `node scripts/verify-gates.mjs discovery` | passed, 21 tests |
| G11 | `node scripts/verify-gates.mjs cli` | passed, 33 tests |

The emitted CLI was also exercised directly, against a temporary `API_ANYTHING_HOME` and state
directory:

- empty history: `4 entries, 2 runnable, 2 unverified, 0 blocked`;
- one `executed` invitation recorded today with `LINKEDIN_AUTOMATOR_INVITES_PER_DAY=1`: both
  invitations blocked with `invitation daily limit reached (1/1)`, proving the budget survives the
  process;
- `run ... --dry extra`: still a dry run, `dry run: nothing was sent`, exit 0;
- `run ... --dryy`: `unknown flag "--dryy" for run`, exit 2, no plan and no call;
- `plan --campaign nope.json`: exit 1 with one `error:` line, not a stack trace.

G12 still holds: nothing in this session touched LinkedIn. G13 is still hand-attested; the handoff
now records F1–F38 across eight session entries, including a correction for every claim the review
found stale. G15 remains covered by the three doctor tests and the 2026-10-16 live transcript above.
