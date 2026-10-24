# Contributing

Thanks for helping. This project is the layer above two tools: **api-anything** owns transport,
auth, healing and the write guard, and **rea** owns browser and bundle evidence. Changes to those
belong upstream. What lives here is the operation catalog, pacing, dedup, planning, the confirming
executor, discovery plumbing, and the CLI.

`AGENTS.md` and the child `AGENTS.md` files are the binding contracts. Read the root and the
closest one before editing; this file is the contributor-facing summary, not a replacement.

## The one rule

**No test may reach LinkedIn.** Not once, not with a test account, not in CI. LinkedIn is a live
third-party service with a real account attached, so a test that calls it is a bug even when it
passes.

Tests bind the injectable `LinkedInClient` port to the fakes in `test/fixtures/`. The one test that
crosses a process boundary (`test/engine.integration.test.ts`) runs the pinned api-anything CLI
with `--dry`, which builds a request and stops.

Manual live checks are separate, deliberately human, and described in `docs/TESTING.md`. Use a
throwaway account and an isolated `API_ANYTHING_HOME`.

## Setup

Node >= 22.13, ESM only.

```sh
npm install
# npm 11 blocks the engine's build and the test runner's binary; approve both:
npm install-scripts approve api-anything esbuild
npm run check
node scripts/verify-suite.mjs
```

## The offline loop

Test-first, always:

1. Add a failing test under `test/` that names the behaviour it protects.
2. Watch it fail: `node --import tsx --test test/<file>.test.ts`.
3. Implement the smallest change that makes it pass.
4. Run the focused gate: `node scripts/verify-gates.mjs <gate>`, where `<gate>` is one of
   `engine`, `safety`, `pacing`, `planner`, `specs`, `reads`, `discovery`, `cli`, `account`.
5. Run the full check before opening a pull request:

```sh
node scripts/verify-suite.mjs
for g in engine safety pacing planner specs reads discovery cli account; do
  node scripts/verify-gates.mjs "$g"
done
node scripts/verify-typecheck.mjs
node scripts/verify-build.mjs
```

`npm test` is fine while iterating, but it is not the evidence. A broken test glob can report zero
tests, zero failures and exit 0. `verify-suite.mjs` discovers the files itself, requires a minimum
number of passes and requires the named safety tests to be present and green.

When you add tests, raise the measured minimum in `scripts/verify-gates.mjs` and `MINIMUM_TESTS` in
`scripts/verify-suite.mjs`. Never lower a minimum to make a run look green.

## Safety rules for writes

A write is guilty until the request proves otherwise. All four gates must be open:

1. an **observed** request shape (`verified: true`, with a spec learned from real traffic);
2. the signed-in account is in `LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS` — an empty list permits
   nothing;
3. `LINKEDIN_AUTOMATOR_ALLOW_WRITES=true`;
4. `--confirm` on this run.

Do not add a shortcut around any of them, and do not reorder the account guard behind another
gate. It is checked first because it compares the identity actually signed in rather than a flag.

- Reads are reads and writes are writes. Never register one as the other.
- A dry run must render through api-anything's own `--dry` path and send nothing. Do not
  reimplement request rendering locally; a preview that can drift from the real request is worse
  than no preview.
- An unverified write has no spec and must stay `verified: false` **until** a real request has been
  observed and `docs/DISCOVERY.md` has been followed. Never author a Voyager write shape from
  memory.
- Delivery ambiguity is not a retry signal. A write whose outcome is `error` or `drift` stays
  `unconfirmed` and is never retried.
- Pacing is replayed from the durable audit trail. Do not start a run at zero, and do not bypass
  the governor.
- Every action records an outcome. A refusal spends no budget and may be attempted again once the
  blocking gate is satisfied.

## Secrets

- Never commit `.api-anything*`, a cookie export, `cookies*.json`, a real HAR/SAZ, `state/`,
  `.env`, `.npmrc`, or key material. `.gitignore` covers these; do not force-add one.
- A `li_at` value **is** the account until it expires. Hand over a path (`API_ANYTHING_HOME`),
  never a value.
- If a credential reaches a commit, pull request, issue or chat, revoke the session first, then
  remove it from history before publishing. Say what happened in the pull request.
- `gitleaks git . --config .gitleaks.toml` must be clean. The one allowlisted line is documented
  in the config and in `docs/HANDOFF.md`; do not add a broad exception.
- Report vulnerabilities through `SECURITY.md`, never a public issue.

## Changes that touch the contracts

- If a change alters purpose, scope, ownership, a durable workflow or a safety rule, update the
  closest `AGENTS.md` in the same change, and any parent whose child index changes.
- Findings go into `docs/HANDOFF.md` as they happen: what you observed, how you established it,
  and what remains unverified. Correct a claim that has become false **in place**, with a dated
  amendment, rather than leaving it to contradict a later paragraph.
- `GATES.md` is the acceptance ledger. A new promised property needs a gate or a named verifier
  test, and a re-verification entry when the code moves under it.

## Commits and pull requests

- Conventional-commit subject; explain **why** in the body, not only what.
- One logical change per commit. Keep refactors separate from behaviour changes, and keep the test
  with the code it protects.
- A pull request says what changed, why, which commands you ran, and anything you could not
  verify. Never claim a live check you did not run.
- No credential values or captured session data in a pull request, an issue, or a review comment.
- Review for design, function, complexity, tests, naming, comments and documentation, in that
  order. Small diffs get better review than large ones.

## License

By contributing, you agree that your contribution is licensed under the MIT License. See
[LICENSE](LICENSE).
