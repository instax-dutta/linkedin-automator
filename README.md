# linkedin-automator

LinkedIn automation that runs on two existing tools instead of bespoke plumbing.

- **[api-anything](https://github.com/goodnight000/api-anything)** is the execution engine. LinkedIn's
  Voyager endpoints are stored as api-anything *site specs*, so every call goes through its tier
  ladder, cookie-import login, drift handling and write guard.
- **[rea](https://github.com/morluto/rea)** supplies the evidence for endpoints this project does not
  yet know — above all the write requests api-anything deliberately does not ship.

This project owns the layer above both: a typed operation catalog, a paced campaign engine, dedup
and durable state, a dry-run planner, a confirming executor, and a CLI.

## Status, honestly

- Five **read** operations work: `getMe`, `getProfile`, `getCompany`, `searchPeople`,
  `searchCompanies`.
- Three **write** intents are declared and **deliberately un-runnable**:
  `sendConnectionInvitation`, `sendMessage`, `createPost`. No Voyager write request has been
  observed, and a write shape recalled from memory would be both unverifiable and permanently
  drifting. The executor refuses them. `docs/DISCOVERY.md` is how one becomes real.
- **Nothing here has ever been run against a live LinkedIn account.** The suite is entirely
  offline. See `docs/HANDOFF.md`.

## Install

```sh
npm install
# npm 11 blocks the engine's build and the test runner's binary; approve both:
npm install-scripts approve api-anything esbuild
npm run check && node scripts/verify-suite.mjs
```

Sign in by importing your own browser session — no password is ever collected:

```sh
api-anything login linkedin
npm run cli -- call getMe        # confirm which account was imported
```

## Use

```sh
npm run cli -- ops                       # what exists, and what is verified
npm run cli -- plan    --campaign c.json --leads l.json
npm run cli -- run     --campaign c.json --leads l.json --dry   # preview every write
npm run cli -- discover capture.har      # propose operations from browser evidence
```

A campaign is JSON: an id, where the audience came from, and ordered steps whose arguments may use
`{{field}}` placeholders resolved from each lead. See `test/fixtures/campaign.json`.

A write needs **three** things to run: an observed request shape, `--confirm`, and
`LINKEDIN_AUTOMATOR_ALLOW_WRITES=true`. Pacing ceilings default to LinkedIn's practical
invitation envelope and are configurable.

## Layout

| path | what it is |
|---|---|
| `AGENTS.md` | the DOX contract tree — read the root first |
| `src/engine/` | the `LinkedInClient` port and the only file that imports api-anything |
| `src/ops/` | the operation catalog and its argument guards |
| `src/automation/` | pacing, state, planning, executing |
| `src/ree/` | turning REA evidence into candidate operations |
| `specs/` | the pinned read spec (and why there is no write spec) |
| `GATES.md` / `PLAN.md` | the unlazy acceptance ledger and the scope plan |
| `docs/HANDOFF.md` | running findings log — **read this before resuming** |

## Compliance

LinkedIn's terms restrict automated access. This project imports *your* session, paces like a human,
defaults every write to dry-run, refuses writes without explicit confirmation, and does not solve
CAPTCHAs or impersonate a TLS fingerprint. Whether and how you use it is your responsibility.
