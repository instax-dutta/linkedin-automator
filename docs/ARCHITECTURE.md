# Architecture

Layered so that the only file which knows about `api-anything` is the adapter, and the only files
which know about time, storage or randomness are the ones that receive them as arguments.

```text
  cli.ts ─────────────┐
                      ▼
              src/index.ts  (public library surface)
                      │
        ┌─────────────┼──────────────┬───────────────┐
        ▼             ▼              ▼               ▼
   src/ops/    src/automation/    src/ree/       src/config.ts
   catalog     campaign engine    discovery      configuration
        │             │              │
        │             ▼              │
        │      LinkedInClient port ◀─┘ (ree drafts specs, never calls)
        │             │
        └─────────────┼──────────────▶ src/engine/client.ts
                      ▼
              src/engine/api-anything.ts   ← the only importer of `api-anything`
                      │
                      ▼
                  api-anything  ──► Voyager API (tier 1/2/3, healing, write guard)
```

## Layering rules

1. **`api-anything` is imported in exactly one file** (`src/engine/api-anything.ts`). Everything
   else depends on the `LinkedInClient` port. This is what makes the automation layer testable
   without a session, a browser, or a network.
2. **The port speaks this project's language**, not the vendor's. Upstream can reorganise its
   `CallResult` without touching the campaign engine.
3. **Time, storage and randomness are injected.** `pacing.ts` and `store.ts` take `now` and their
   persistence as arguments, because their behaviour *is* their boundary conditions and those are
   only testable deterministically.
4. **Plan before act.** Every action that could reach LinkedIn is materialised as a plan entry
   first. The runner executes plans; it never invents work. Dry-run is the same planner with the
   execution step removed, so a preview cannot diverge from the real run.

## Responsibilities

| component | owns | explicitly does not own |
|---|---|---|
| `src/engine/api-anything.ts` | calling `call()`, threading `allowWrites`, normalizing results | retries, healing, interpretation |
| `src/ops/` | which operations exist, their arguments, their guards | transport, pacing |
| `src/automation/pacing.ts` | spacing and budgets | what the work is |
| `src/automation/store.ts` | what already happened | when it is allowed to happen |
| `src/automation/campaign.ts` | audiences, ordered steps, template rendering | execution |
| `src/automation/dryrun.ts` | expanding a campaign into pending actions | sending anything |
| `src/automation/runner.ts` | confirmation gate, ordering, audit trail | deciding the plan |
| `src/ree/` | turning browser evidence into candidate specs | promoting them without review |

## The write path

A write taking the safest possible route through the system:

```text
campaign step (write kind)
  → planner emits a write plan entry with a confirmation requirement
    → dry-run: render the exact request, redact credentials, print, send nothing
      → operator confirms (or the entry stays pending)
        → runner checks the store (already contacted?) and the governor (budget left?)
          → runner calls the port with allowWrites
            → adapter calls api-anything with allowWrites
              → api-anything sends ONCE; ambiguous outcomes are reported, never retried
                → receipt checked and an audit record written
```

Each arrow is a place where the action can stop. That is the point: a write that cannot be
stopped at every one of them is a bug.

## Failure handling

api-anything's failure classes are preserved verbatim so the operator sees upstream's own
vocabulary and its `next` hint:

| class | this project's response |
|---|---|
| `auth` | stop the run; tell the operator to re-run `api-anything login linkedin` |
| `rate` | stop the run; do not retry; the governor is wrong and must be adjusted |
| `blocked` | stop the run; the operator clears the challenge by hand |
| `drift` | surface it; the fix is re-learning the operation, not retrying |
| `input` | usually a bad argument; fix the argument, never heal |
| `refused` | a write arrived without permission; fix the caller, not the operation |
| `error` | at most one retry, then report |

No component retries a write whose delivery is ambiguous, at any layer.
