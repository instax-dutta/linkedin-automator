# src/automation/ — campaign engine

## Purpose

The layer that turns individual operations into paced, deduplicated, resumable work: it decides
what to do, when it is allowed to happen, what has already happened, and whether a write is
permitted.

## Ownership

- `pacing.ts` — the rate-limit governor. The only component allowed to space requests; encodes
  LinkedIn's invitation allowances and per-scope budgets.
- `store.ts` — dedup and durable state: who has been contacted, which step of which sequence ran,
  and when.
- `campaign.ts` — the campaign model and sequence planner: audiences, ordered steps, delays,
  stop conditions and rendering of a template with lead data.
- `dryrun.ts` — the planner that expands a campaign into the exact pending actions *without*
  executing them, including a byte-level request preview for writes.
- `runner.ts` — the executor: consumes a plan, consults the governor and store, applies the
  confirmation gate, and records an audit trail.

## Local Contracts

- Nothing in this folder imports `api-anything`. It depends on the `LinkedInClient` port only.
- `pacing.ts` and `store.ts` are pure and injectable: no ambient clock, no ambient randomness,
  no direct filesystem access. Time and storage arrive as arguments so behaviour is deterministic
  under test.
- Every action that could reach LinkedIn is expressed as a plan entry first. `runner.ts` never
  invents work; it only executes an existing plan.
- A write plan entry carries a confirmation requirement. The runner refuses to execute a write
  whose requirement has not been satisfied, even when the engine would allow it.
- State transitions are append-only. Re-running a campaign must not repeat a step the store
  already records as done.

## Work Guidance

- Model time explicitly (`now: Date` or `nowMs: number` parameters). A governor that reads the
  clock itself cannot be tested for its boundary conditions, and those boundaries are the whole
  point of the component.
- Encode LinkedIn's published limits as defaults, and make them overridable by configuration —
  but never silently bypassable at the call site.
- Prefer refusing to act over acting unsafely: when dedup state is ambiguous, treat the lead as
  already contacted.
- The audit trail is part of the deliverable, not a debug aid. Every skipped, planned and executed
  action is recorded with a reason.

## Verification

```sh
npm run check
npm test
```

Gates owned here: the governor blocks the daily/weekly invitation budget and reports why; a
second run of the same campaign performs no duplicate step; a write plan without confirmation is
refused; a dry-run of a write campaign produces a preview and sends nothing.

## Child DOX Index

None. This folder is small enough to be owned here.
