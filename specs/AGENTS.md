# specs/ — LinkedIn site specs for api-anything

## Purpose

api-anything site specs for LinkedIn. A spec is the executable description of a Voyager request:
its method, URL template, header slots, parameter positions, response extraction and trigger. It
is what actually gets sent.

## Ownership

- `linkedin.read.json` — read-only operations this project adds on top of what api-anything ships.
- `linkedin.write.json` — write operations (invitations, messages, posts), all `readOnly: false`.
- Both are plain api-anything site specs and are validated by api-anything's own `parseSite()`.

## Local Contracts

- Every spec file must pass `parseSite()`. Validation is a test, not a hope.
- Specs contain **references only**: `cookie:li_at`, `cookie:JSESSIONID`, `session:…`. A literal
  cookie value, CSRF token or bearer string in a spec is a defect, and the test suite asserts
  their absence.
- Write operations set `readOnly: false` and are declared with `--write` semantics upstream. The
  executor must refuse them without permission.
- Auth follows LinkedIn's observed pattern: the `li_at` cookie, plus a `csrf-token` header that
  mirrors `JSESSIONID` with quotes stripped, plus `x-restli-protocol-version: 2.0.0`.
- Avoid `decorationId` and GraphQL `queryId`: both rotate per deploy and turn a stable operation
  into a permanently drifting one. The comment records why.
- Do not author an operation whose request shape is unverified. Put it in the draft output of
  `src/ree/` instead and mark it unverified until someone observes the real traffic.

## Work Guidance

- Copy the shape of api-anything's shipped `sites/linkedin.json` rather than inventing a variant;
  consistency with upstream is what lets these be contributed back.
- Keep `extract` pointing at the smallest subtree that holds the wanted fields, and list only the
  fields the automation layer consumes.
- Record provenance for each operation in the sibling notes so a future maintainer knows whether
  it was observed live or drafted from bundle evidence.

## Verification

```sh
npm run check
npm test
```

The specs gate: each file parses, each operation's declared parameters appear in its request
template, no credential literal is present, and every `readOnly: false` operation is listed as a
write in `src/ops/`.

## Child DOX Index

None. This folder is owned here.
