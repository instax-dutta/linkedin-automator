# src/automation/ — campaign engine

## Purpose

The layer that turns individual operations into paced, deduplicated, resumable work: it decides
what to do, when it is allowed to happen, what has already happened, and whether a write is
permitted.

## Ownership

- `guard.ts` — the signed-in account guard. Pure: it compares an account against an allow-list.
  An empty list permits nothing, because "no list" must never mean "no restriction".
- `pacing.ts` — the rate-limit governor. The only component allowed to space requests; encodes
  LinkedIn's invitation allowances and per-scope budgets.
- `store.ts` — dedup and durable state: who has been contacted, which step of which sequence ran,
  and when.
- `campaign.ts` — the campaign model and the planner: lead templates, ordered steps, delays, and
  `planCampaign`, which expands a campaign into concrete actions without performing any of them.
  The plan carries the budget arithmetic (`usageAfter`) so its own sums are checkable.
- `runner.ts` — the executor, and the dry-run: `executePlan` consumes a plan, consults the
  confirmation gate and the store, and records the audit trail; `previewPlan` renders the exact
  request each writable step would send and sends nothing. Both read the same `Plan`, which is
  what keeps a preview from diverging from the real run.

## Local Contracts

- Nothing in this folder imports `api-anything`. It depends on the `LinkedInClient` port only.
- `pacing.ts` and `store.ts` are pure and injectable: no ambient clock, no ambient randomness,
  no direct filesystem access. Time and storage arrive as arguments so behaviour is deterministic
  under test.
- Every action that could reach LinkedIn is expressed as a plan entry first. `runner.ts` never
  invents work; it only executes an existing plan.
- A write plan entry carries a confirmation requirement. The runner refuses to execute a write
  whose requirement has not been satisfied, even when the engine would allow it.
- **The account guard is checked first, before the observed-shape gate and before confirmation.**
  Every later gate can be opened by a flag or a setting; only this one compares the identity that
  is actually signed in. An unknown account is refused, never assumed safe.
- A write that is refused records a `skipped` outcome with the reason and spends nothing, so it can
  legitimately be attempted again once the blocking gate is satisfied.
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
