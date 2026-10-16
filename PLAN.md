# Plan: LinkedIn automation on api-anything + rea

Ran in **solo** mode: one working session, one ledger (`GATES.md`). This file records the scope
inventory and the decomposition, so a later session can pick up a leaf without re-deriving the
shape of the work.

## Scope inventory

Every independently omittable outcome the user's request implies. Each is a thing that could be
missing while the rest still worked.

| id | outcome | where it lands | gate |
|---|---|---|---|
| S1 | both upstream tools researched, with sources | `docs/RESEARCH.md` | — (evidence is the doc) |
| S2 | DOX tree with binding contracts | `AGENTS.md` + children | — (evidence is the tree) |
| S3 | a seam that keeps the vendor package out of the automation layer | `src/engine/client.ts` | G4 |
| S4 | reads executed through api-anything, not a bespoke client | `src/engine/api-anything.ts` | G4, G9 |
| S5 | the operation catalog, with argument guards | `src/ops/` | G8 |
| S6 | prospecting/lead-gen (read) | wrapped shipped operations | G9 |
| S7 | outreach (invitations + messages) | `src/ops/writes.ts` + campaign engine | G5, G7 |
| S8 | content automation (posts) | same | G5, G7 |
| S9 | pacing inside LinkedIn's allowances | `src/automation/pacing.ts` | G6 |
| S10 | dedup and durable state | `src/automation/store.ts` | G7 |
| S11 | plan before act; dry-run that cannot diverge | `src/automation/campaign.ts`, `runner.ts` | G5, G7 |
| S12 | writes dry-run by default, opt-in and confirmed | `src/automation/runner.ts` | G5, G11 |
| S13 | CLI + library interface | `src/cli.ts`, `src/index.ts` | G3, G11 |
| S14 | rea used for discovery, not reimplemented | `src/ree/` | G10 |
| S15 | the unverified surface stated honestly | `docs/HANDOFF.md` | G12, G13 |

## Depth tree

Research and documentation gate the code, because writing the code first would have meant guessing
the interface.

```text
build
├── 1 research
│   ├── 1.1 api-anything: engine, tiers, spec format, failure classes, write model
│   ├── 1.2 rea: browser surfaces, bundle analysis, offline capture reading
│   ├── 1.3 LinkedIn: auth shape, allowances, ToS posture
│   └── 1.4 findings log (running)              → docs/HANDOFF.md
├── 2 documentation
│   ├── 2.1 DOX tree                            → AGENTS.md + 8 children
│   ├── 2.2 research, architecture, runbook     → docs/*.md
│   └── 2.3 unlazy ledger and plan              → GATES.md, PLAN.md
├── 3 engine
│   ├── 3.1 LinkedInClient port
│   └── 3.2 api-anything adapter (only importer of the vendor package)
├── 4 operations and specs
│   ├── 4.1 catalog + argument guards
│   ├── 4.2 pinned read spec (vendored, validated)
│   └── 4.3 write intents, unverified, no spec
├── 5 automation
│   ├── 5.1 pacing governor (pure)
│   ├── 5.2 dedup + state store (append-only)
│   ├── 5.3 campaign model + planner
│   └── 5.4 confirming executor + dry-run preview
├── 6 discovery
│   ├── 6.1 rea CLI driver
│   └── 6.2 candidates → draft spec
├── 7 interface
│   ├── 7.1 library surface
│   ├── 7.2 configuration
│   └── 7.3 CLI
└── 8 verification
    ├── 8.1 per-leaf ledger gates
    └── 8.2 whole-scope gates
```

## Leaves

`Tier` is planning metadata only: `judgment` where the artifact itself needed design or review,
`mechanical` where the pattern and its gates were fixed.

| leaf | owns | needs | tier | state |
|---|---|---|---|---|
| 1.1–1.3 research | `docs/RESEARCH.md` | — | judgment | done |
| 1.4 findings log | `docs/HANDOFF.md` | continuing | judgment | done (living) |
| 2.1 DOX tree | `AGENTS.md`, `*/AGENTS.md` | 1.1–1.3 | judgment | done |
| 2.2 docs | `docs/*.md` | 1.x | judgment | done |
| 2.3 ledger | `GATES.md`, `PLAN.md` | 2.1 | judgment | done |
| 3.1 port | `src/engine/client.ts` | 1.1 | judgment | done |
| 3.2 adapter | `src/engine/api-anything.ts` | 3.1 | judgment | done |
| 4.1 catalog | `src/ops/**` | 1.1, 3.1 | judgment | done |
| 4.2 pinned spec | `specs/**` | 4.1 | mechanical | done |
| 4.3 write intents | `src/ops/writes.ts` | 1.3 | judgment | done |
| 5.1 pacing | `src/automation/pacing.ts` | 1.3 | judgment | done |
| 5.2 store | `src/automation/store.ts` | — | judgment | done |
| 5.3 planner | `src/automation/campaign.ts` | 4.1, 5.1, 5.2 | judgment | done |
| 5.4 executor | `src/automation/runner.ts` | 3.1, 5.2, 5.3 | judgment | done |
| 6.1 rea driver | `src/ree/rea.ts` | 1.2 | judgment | done |
| 6.2 candidates | `src/ree/candidates.ts` | 6.1 | judgment | done |
| 7.1 library | `src/index.ts` | 3.x–6.x | mechanical | done |
| 7.2 config | `src/config.ts` | 5.1, 4.1 | mechanical | done |
| 7.3 CLI | `src/cli.ts` | 7.1, 7.2 | judgment | done |
| 8.1–8.2 verification | `scripts/verify-*.mjs` | all | mechanical | done |

## Deliberately out of scope

- **Learning a write endpoint.** Needs an observed request from a signed-in browser. The system
  refuses those operations and `docs/DISCOVERY.md` is the procedure. See `GATES.md` G12/G13 and
  the unverified list in `docs/HANDOFF.md`.
- **A review queue UI.** Confirmation is currently a flag; a persisted pending list is the first
  next action in the handoff log.
- **Live REA browser surfaces.** No CDP endpoint was available; only the offline paths are built.
