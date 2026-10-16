# src/engine/ — LinkedInClient port and the api-anything adapter

## Purpose

Defines the single seam between this project and `api-anything`, so the automation layer can be
tested without a browser, a session, or a network call.

## Ownership

- `client.ts` — the `LinkedInClient` port: the interface the automation layer depends on. Also the
  result/error types it speaks in.
- `api-anything.ts` — the production adapter: the only file that imports `api-anything`. It also
  owns the failure-class mapping, because classifying an upstream error is part of translating
  upstream's vocabulary and belongs next to the translation rather than in a module of its own.

## Local Contracts

- `api-anything` may be imported **only** in `api-anything.ts`. Every other module depends on the
  port, never on the vendor package.
- The port speaks in a normalized result: `{ ok, data }` or a classified failure — not
  api-anything's raw `CallResult`, so upstream changes cannot leak into the automation layer.
- The port must expose the whole call surface the automation layer needs, including a dry-run
  preview, write permission, and a caller-supplied operation catalogue.
- api-anything's failure classes are preserved verbatim (`auth`, `rate`, `blocked`, `drift`,
  `input`, `refused`, `error`) so the operator sees upstream's own vocabulary and `next` hint.

## Work Guidance

- The adapter is thin and faithless: it does not retry, re-heal, or reinterpret. api-anything
  already owns the tier ladder, healing and write guard; duplicating that is a defect.
- On a nonzero CLI exit the cause is on stdout as JSON and the remediation hint is `next:` on
  stderr. Report the cause and append the hint; preferring stderr alone hides what went wrong.
- Thread `allowWrites` through explicitly. The adapter must default to refusing writes.
- Surface `truncated` and `healed` rather than discarding them — the operator needs both.
- Keep the port small enough that an in-memory fake is trivial to write.

## Verification

```sh
npm run check
npm test
```

The engine's gate: an in-memory fake satisfies the port, and `drift`/`rate`/`refused` results
arrive at the caller with class, reason and `next` intact.

## Child DOX Index

None. This folder is small enough to be owned here.
