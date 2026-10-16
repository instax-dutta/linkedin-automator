# Gates: linkedin-automator build

OWNS: src/**, test/**, specs/**, scripts/**, docs/**, AGENTS.md, GATES.md, PLAN.md, package.json

Scope: a LinkedIn automation system whose reads run on api-anything and whose write path is
refused by default, planned before it acts, and provable without touching a live account.

- [x] G1: the whole suite passes, with the named safety-property tests present and green
  CHECK: node scripts/verify-suite.mjs
  EXPECT: suite verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d206b0d7f69127bed1c5fd696c19f131dfcb88d7687e83df38d61f556abab451; exit=0; EXPECT=matched; output-sha256=e4167175ff958a154bb2c88c3d9bcdb21134cbf14deba9fc83032a789a30e348; output-bytes=48; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G2: src and test compile with no type errors
  CHECK: node scripts/verify-typecheck.mjs
  EXPECT: typecheck passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=b1f4bb997a1386556f4e4d5acc883d881fd44a425b32e4d71925cb4bab048fd0; exit=0; EXPECT=matched; output-sha256=a6ab3fb2b6d250da3a2a07eb14cb02d7be573a476a89e2b8aa32a7447d6d34c2; output-bytes=55; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G3: the build emits dist and the emitted CLI runs and lists the catalog
  CHECK: node scripts/verify-build.mjs
  EXPECT: build verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=4d83bccd3bd90a6b4603c4581cced030b3ff3b0f0b7a9962c705fbb76072f93b; exit=0; EXPECT=matched; output-sha256=8b850b4db3c07ae104b24a017957617182c84c7f8f952d13e4eac216066a8a6c; output-bytes=58; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G4: the engine port maps success and failure faithfully and threads write permission explicitly
  CHECK: node scripts/verify-gates.mjs engine
  EXPECT: engine gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=0e49eebb9445fc89831a2846f7128fdfe7c7f9a7fa0057b90cb6bb057ed89839; exit=0; EXPECT=matched; output-sha256=5b728a82edb5f2e9572ecfef5a6669aae15b932b4c7e623d4b84285775d37cef; output-bytes=75; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G5: a write is refused without confirmation, without permission, and without an observed shape; an ambiguous write is never retried
  CHECK: node scripts/verify-gates.mjs safety
  EXPECT: safety gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d350044de92a8e20f509e66345db84bd131da7297494e31c7580e067e386f526; exit=0; EXPECT=matched; output-sha256=14fde3f01cfda55d98e11bb08ab8639d0cecab12ff01897e92560091d2448e8d; output-bytes=110; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G14: a write is refused unless the signed-in account is allow-listed, an empty allow-list permits nothing, and the guard is reached before any other write gate
  CHECK: node scripts/verify-gates.mjs account
  EXPECT: account gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=21a680d7c84440bb0a757c9946611bae905db4cb187f6439cf62a68d6cd9eaf7; exit=0; EXPECT=matched; output-sha256=0b5b73f6c145dd151a95972808d77c82d8a02f9f844316feeed0172e4fe01b05; output-bytes=112; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G6: the invitation ceilings hold at their boundaries across day, ISO week and month
  CHECK: node scripts/verify-gates.mjs pacing
  EXPECT: pacing gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=175268e01aed8ca056f60ab5b161d04c4d6d56883f9bf828a6c98700f5a4eb91; exit=0; EXPECT=matched; output-sha256=84d3bee33806945e4fb425863894cb1c160348d9abef680f61f089453e222f98; output-bytes=94; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G7: a campaign expands in order, a spent step is planned as skipped, and a plan never overspends its budget
  CHECK: node scripts/verify-gates.mjs planner
  EXPECT: planner gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=52007a886ba564367e734fa3610adee3397dd1b5ff762a56d892932494d5c93f; exit=0; EXPECT=matched; output-sha256=0ed899cae123c3c77f68c5c4a4fd829cfdfc9b4bc6641b5a7f21baeb902a597d; output-bytes=99; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G8: the pinned spec parses, holds no credential value, has no rotating identifier, and declares no write
  CHECK: node scripts/verify-gates.mjs specs
  EXPECT: specs gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=a8f044c5f719161f314cc8b6100a5bd37c772742101de55bb6f05579e35cc928; exit=0; EXPECT=matched; output-sha256=63a7e7c9fb2c969194169acbc425d792f128894a311e5a6d9477673b9298c86a; output-bytes=107; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G9: every catalogued read renders a correct Voyager request through the real pinned engine, offline
  CHECK: node scripts/verify-gates.mjs reads
  EXPECT: reads gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=e973e538569c77d702c13e9e2253f15882e17feda39ce20ddabd56d6df5dda9c; exit=0; EXPECT=matched; output-sha256=bebb90d7c41b63d262e17a2600cccd1acf55ce7ad8214ea80a3e703b5d4324a1; output-bytes=97; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G10: recorded traffic becomes labelled candidates and a parseable draft spec
  CHECK: node scripts/verify-gates.mjs discovery
  EXPECT: discovery gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=5388fdd78f778ce61c02519fb3e0f9766d5daad0a4479ee917a5f44480db9c4b; exit=0; EXPECT=matched; output-sha256=0f3341398d3bdbfa09273ca618d2152c465e9c77446076316cdb55b15aac71b8; output-bytes=92; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G11: the CLI lists the catalog, plans without acting, refuses writes through its real interface, and points sign-in at api-anything
  CHECK: node scripts/verify-gates.mjs cli
  EXPECT: cli gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=3294cec901d963383df8221f0a310122751ae75333b991989a22756c9baa80f8; exit=0; EXPECT=matched; output-sha256=78fccb0be186644151ae8b2b1317d23bfe76587236ea1208d3c1e0fccd5aa862; output-bytes=103; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/linkedin-automator; path=b93c3fbfaca3/30 entries

- [x] G12: the claim "nothing here has been run against a live LinkedIn account" is still true, and no document implies otherwise
  EVIDENCE: Reviewed by hand on 2026-10-16. Every test either binds the engine port to the in-memory fake in test/fixtures/engine.ts or drives api-anything's `--dry` against a temporary API_ANYTHING_HOME created per test and removed after; `--dry` builds a request and never sends it. No test file reaches the network. Inspected directly: every `client.call(` in test/ is on a client constructed with an injected fake `caller`, and test/engine.integration.test.ts contains 0 calls and 4 previews. The only live-capable path is the adapter's default `call`, and no test invokes it with a real session. Every CLI demo run during this session used `ops`, `plan`, `discover`, or `run --dry`; bare `run` was deliberately not executed because it would issue real reads, and `doctor` (which performs exactly one live read when invoked) was exercised only through tests against the fake. docs/HANDOFF.md states the same in "What is verified vs not" and nothing elsewhere claims live verification.

- [x] G13: the handoff log names, for each finding, how it was established, and its unverified list matches reality
  EVIDENCE: Reviewed by hand on 2026-10-16. docs/HANDOFF.md records F1-F14, and each finding names its basis as a specific upstream file, a command whose output is quoted, or a direct probe (for example F5 quotes the `--dry` probe output, and F6 quotes stdout and stderr separately). The file ends with an explicit verified/unverified split and an ordered next-action list. The unverified list was cross-checked against the code: the three write operations in src/ops/writes.ts are `verified: false` with no spec entry, test/specs.test.ts asserts the pinned spec declares zero write operations, and no Voyager write request shape exists anywhere in the repository.
