# scripts/ — verification oracles

## Purpose

The commands `GATES.md` runs. A gate is only as good as its oracle, so these are production
artifacts with their own rules rather than throwaway helpers.

## Ownership

- `verify-suite.mjs` — runs the whole test suite and proves it actually ran.
- `verify-gates.mjs` — runs the focused tests behind one named gate.
- `verify-typecheck.mjs` — runs `tsc` and turns its silence into a matchable token.
- `verify-build.mjs` — builds, then executes the emitted CLI so the gate measures the shipped
  artifact rather than a compiler's exit code.

## Local Contracts

- **Portable Node only.** No `grep`, `tail`, `tr` or POSIX pipelines: gates must run under the
  same shell on any host unlazy supports. `npm` is invoked with `shell` set only on Windows.
- Print one decisive **success-only** token and exit 0. Exit nonzero with the failure detail on
  stderr otherwise. A gate matches on the token, so the token must not appear on failure.
- **Zero failures with zero tests is a failure, not a pass.** Every oracle declares a minimum
  number of passing tests and fails when the count drops below it. A broken glob or a renamed
  suite must be caught here, because it reports a clean exit otherwise.
- Resolve paths from `import.meta.url`, never from the caller's working directory.
- Never reach the network, and never touch a live account.

## Work Guidance

- When a suite gains tests, raise the minimum in `verify-gates.mjs`. A minimum left behind is a
  gate that can no longer fail for the reason it was written.
- Prefer asserting on a named test being present and green over asserting on a count alone: a count
  survives a test being replaced by an unrelated one.
- Keep each oracle's output short and greppable; it ends up in gate evidence.

## Verification

```sh
node scripts/verify-suite.mjs
for g in engine safety pacing planner specs reads discovery cli; do node scripts/verify-gates.mjs "$g"; done
node scripts/verify-typecheck.mjs
node scripts/verify-build.mjs
```

Negative control: `node scripts/verify-gates.mjs nope` must exit 2. Removing a required test from
`verify-suite.mjs`'s list must fail that oracle.

## Child DOX Index

None. This folder is owned here.
