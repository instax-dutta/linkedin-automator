# specs/ — LinkedIn site specs for api-anything

## Purpose

api-anything site specs for LinkedIn. A spec is the executable description of a Voyager request:
its method, URL template, header slots, parameter positions, response extraction and trigger. It
is what actually gets sent.

## Ownership

- `linkedin.json` — a **pin** of upstream api-anything's verified LinkedIn spec: the five read
  operations (`getMe`, `getProfile`, `getCompany`, `searchPeople`, `searchCompanies`). It is
  vendored so the request shapes this project depends on are reviewed in-repo, validated by
  `test/specs.test.ts`, and installable standalone into `API_ANYTHING_HOME`. Upstream remains the
  source of truth; when it changes, re-pin deliberately rather than drifting.
- `linkedin.md` — the same pin's site notes (caveats, argument formats, login advice).

There is deliberately **no write spec**. See below.

## Local Contracts

- Every spec file must pass api-anything's own `parseSite()`. Validation is a test, not a hope.
- Specs contain **references only**: `cookie:li_at`, `cookie:JSESSIONID`. A literal cookie value,
  CSRF token or bearer string in a spec is a defect, and the test suite asserts their absence.
- Auth follows LinkedIn's observed pattern: the `li_at` cookie, plus a `csrf-token` header that
  mirrors `JSESSIONID` with quotes stripped, plus `x-restli-protocol-version: 2.0.0`.
- **No `decorationId` and no GraphQL `queryId`.** Both rotate per deploy, turning a stable
  operation into a permanently drifting one. The test suite asserts neither string appears.
- `trigger.url` is required by the schema and must be a **page an operator can open**, not a bare
  origin. Discovery starts there.
- Installing this spec into `API_ANYTHING_HOME` is what makes an operation callable and dry-runnable
  offline. `test/engine.integration.test.ts` does exactly that into a temporary home.

## Work Guidance

- **Do not author a write spec from memory.** A write's request shape cannot be recalled: the
  endpoints carry rotating identifiers, and a wrong guess sends a real message to a real person.
  Write intents live in `src/ops/writes.ts` marked `verified: false` with no spec, the executor
  refuses them, and `docs/DISCOVERY.md` is the procedure that produces a real one.
- Copy the shape of upstream's `sites/linkedin.json` rather than inventing a variant, so a
  promoted operation can be contributed back.
- Keep `extract` pointing at the smallest subtree that holds the wanted fields, and list only the
  fields the automation layer consumes.
- Record provenance for each operation so a maintainer knows whether it was observed live or
  inferred from a bundle.

## Verification

```sh
node scripts/verify-gates.mjs specs
```

The specs gate: the file parses, its operations match the read catalog exactly, it declares no
write, every declared parameter is actually placed into its request, the csrf slot mirrors
JSESSIONID with quotes stripped, no credential literal is present, and neither `decorationId` nor
`queryId` appears anywhere.

## Child DOX Index

None. This folder is owned here.
