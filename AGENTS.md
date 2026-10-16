# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

- The user asked for this project to be built DOX-first, planned with the `unlazy` skill, developed test-first with the `test-driven-development` skill, and committed atomically.
- The user asked for `api-anything` and `rea` to be used "to the fullest" rather than reimplemented. Do not hand-roll a LinkedIn HTTP client or a browser driver when one of those tools already owns that job.
- Scope confirmed by the user: prospecting/lead-gen (read), outreach (connection requests + DM sequences), and content automation (post scheduling). Interface: CLI + library. Writes: dry-run by default, real sends only with explicit opt-in and confirmation.

# linkedin-automator

## Purpose

LinkedIn automation that runs on two external tools instead of bespoke plumbing:

- **`api-anything`** (`github:goodnight000/api-anything`) is the execution engine. LinkedIn's Voyager
  REST endpoints are stored as api-anything *site specs*; every call goes through its tier ladder,
  cookie-import login, drift healing and write guard.
- **`rea`** (`rea-agents`) is the reverse-engineering tool. It supplies the browser traffic evidence
  needed to learn *new* Voyager operations — especially the write endpoints (invite, message, post)
  that api-anything deliberately does not ship.

This project owns the layer above both: typed operations, a paced campaign engine, dedup and
state, a dry-run planner, a confirming executor, and a CLI.

## Ownership

- This repo owns: operation specs, the campaign/automation logic, the REA discovery workflow, the
  CLI, the verification oracles in `scripts/`, and documentation.
- This repo does **not** own: request transport, auth, healing, or the browser tier (all
  `api-anything`), nor CDP/bundle/HAR analysis primitives (all `rea`). Changes to those belong
  upstream.

## Local Contracts

- Node >= 22.13 (matches `api-anything`). ESM only, `"type": "module"`.
- Relative imports use explicit `.js` extensions (`verbatimModuleSyntax` + `NodeNext`).
- Public library surface is re-exported from `src/index.ts`; the executable is `src/cli.ts`.
- LinkedIn operation **specs** live in `specs/` and must validate against api-anything's own
  `parseSite()`. A spec that does not parse is not a spec.
- Every operation this project calls must be named in `src/ops/`, so there is one place that
  documents LinkedIn's inputs and outputs.

## Work Guidance

- **Test-first, always.** No production code without a failing test that was watched to fail first.
  This is the Iron Law from the `test-driven-development` skill and it is not waived for specs,
  JSON shapes or "obvious" glue.
- **Tests never touch LinkedIn.** No test may reach the network beyond localhost. LinkedIn is a
  third-party service with a real account attached; a test that calls it is a bug even when it
  passes. Use the injectable `LinkedInClient` port and local fixtures instead.
- **Writes are guilty until proven requested.** Invite, message and post operations are
  `readOnly: false`. They must be refused unless permission is threaded through explicitly, must be
  previewable with `--dry` before any send, and must never be retried when delivery is ambiguous.
- **No credentials in specs, args, or logs.** Cookie and CSRF handling stays inside api-anything's
  `slots`/`ref` mechanism. If a secret would land in a spec file or an audit record, that is a bug.
- **Respect human pace.** Pacing defaults come from LinkedIn's own invitation allowances, and the
  governor is the only thing allowed to space requests.
- Commit atomically with conventional-commit subjects; one logical change per commit.

## Verification

```sh
node scripts/verify-suite.mjs                       # the suite, plus required safety tests
for g in engine safety pacing planner specs reads discovery cli; \
  do node scripts/verify-gates.mjs "$g"; done       # one focused gate at a time
node scripts/verify-typecheck.mjs                   # tsc over src and test, no emit
node scripts/verify-build.mjs                       # build, then run the emitted CLI
```

Plain `npm test` is fine for iteration, but it proves less than it looks: a broken glob reports
zero tests, zero failures and exit 0. When a claim depends on the suite, use the verifiers above —
they fail on a disappearing suite, a missing named test, or a passing count that has dropped.

`GATES.md` holds the acceptance ledger; run its checks through the `unlazy` gate-checker rather
than by eye. `PLAN.md` records the scope inventory and the decomposition. Neither is a substitute
for the other: the ledger decides whether the work is done, the plan explains what the work was.

## Child DOX Index

- `src/AGENTS.md` — source root: library entry, CLI entry, configuration.
- `src/engine/AGENTS.md` — the `LinkedInClient` port and the api-anything adapter behind it.
- `src/ops/AGENTS.md` — the typed LinkedIn operation catalog (five verified reads, three
  unverified write intents).
- `src/automation/AGENTS.md` — pacing governor, dedup/state store, campaign planner, dry-run
  preview and the confirming executor.
- `src/ree/AGENTS.md` — the REA-driven discovery workflow that turns browser evidence into
  candidate operation specs.
- `specs/AGENTS.md` — the pinned read spec, and why there is no write spec.
- `test/AGENTS.md` — the test suite layout, fixtures and the no-network rule.
- `docs/AGENTS.md` — research, architecture, the discovery runbook, and the findings/handoff log.
- `scripts/AGENTS.md` — the verification oracles the acceptance gates run.

`GATES.md` (unlazy acceptance ledger) and `PLAN.md` (scope plan) live at the repository root.
`docs/HANDOFF.md` is the running findings and handoff log — read it before resuming work.
