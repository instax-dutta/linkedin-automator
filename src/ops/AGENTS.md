# src/ops/ — typed LinkedIn operation catalog

## Purpose

One place that says which LinkedIn operations exist, what they accept, what they return, and
whether they write. Everything else refers to operations by name through this catalog.

## Ownership

- `types.ts` — operation descriptors and the argument/result types for each operation.
- `reads.ts` — the five read-only operations shipped by api-anything: `getMe`, `getProfile`,
  `getCompany`, `searchPeople`, `searchCompanies`.
- `writes.ts` — write operations: connection invitations, direct messages, and post publishing.
- `index.ts` — the assembled catalog lookup used by the automation layer and the CLI.

## Local Contracts

- Each operation declares: name, kind (`read` | `write`), its site, a summary, its parameters
  (type, required, description, optional guard) and whether its request shape is verified.
- A `write` operation is `readOnly: false` in the spec and must be listed in `writes.ts`. A read
  must never be registered as a write, and vice versa.
- Operation names are stable identifiers. Renaming one is a breaking change and must move in the
  same commit as its call sites.
- Argument guards (LinkedIn's Rest.li restrictions, e.g. no commas/colons/parentheses in search
  keywords) are declared here and enforced before any request is built.

## Work Guidance

- Declare an operation only once. If the spec ships upstream, wrap it rather than re-learning it.
- Record the evidence for an operation's shape: where it was observed, and who verified it. An
  unverified write is still allowed in the catalog but must be marked unverified so the executor
  can refuse it without an explicit override.
- Keep the declared return shape narrower than LinkedIn's response. Pick the fields the automation
  layer actually consumes.
- Never place a credential, cookie value or CSRF token in a descriptor.

## Verification

```sh
npm run check
npm test
```

The ops gate: every **read** descriptor has a matching operation in the pinned spec, which parses
via api-anything's `parseSite()`; every declared `write` operation is refused by the executor
unless all four write gates are open; and every argument guard rejects the input it claims to
reject. Write intents deliberately have no spec until one is observed.

## Child DOX Index

None. This folder is small enough to be owned here.
