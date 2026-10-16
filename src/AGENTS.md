# src/ — source root

## Purpose

Source root for the library and CLI. Holds the entry points and the configuration module; the
behaviour lives in the four child modules.

## Ownership

- `index.ts` — the library's public surface. Everything a consumer may import is re-exported here.
  Adding an export is a public API change.
- `cli.ts` — the `linkedin-automator` executable. Argument parsing and output formatting only;
  no business rules live here.
- `config.ts` — loading and validating operator configuration (state directory, pacing overrides,
  write permission defaults).

## Local Contracts

- Modules under `src/` never import from `test/`.
- `index.ts` re-exports; it defines nothing itself.
- `cli.ts` and `config.ts` are the only files allowed to read `process.env` or the filesystem for
  configuration. Everything else takes its dependencies as arguments.
- Relative imports carry an explicit `.js` extension.

## Work Guidance

- Add an export to `index.ts` in the same change that adds the capability, not later.
- Keep the CLI thin: parse, call the library, render the result. Anything the CLI needs that the
  library cannot do is a missing library function, not a CLI-private helper.
- Prefer a small number of explicit options over a generic key/value passthrough.
- Business logic must be reachable from the library without the CLI, because that is what the tests
  exercise.

## Verification

```sh
npm run check    # typechecks src and test together
npm test
```

The CLI's own gate is that its `--dry` path prints redacted requests and exits zero without any
write reaching the engine.

## Child DOX Index

- `engine/AGENTS.md` — `LinkedInClient` port and the api-anything adapter.
- `ops/AGENTS.md` — typed LinkedIn operation catalog.
- `automation/AGENTS.md` — pacing, state, campaigns and the executor.
- `ree/AGENTS.md` — REA-driven discovery workflow.
