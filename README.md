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

- Five **read** operations are declared. `getMe`, `getProfile` and `getCompany` have answered a
  real account at tier 1; `searchPeople` and `searchCompanies` are verified offline (request
  rendering and the pinned spec) because the borrowed test session was revoked before they could
  answer. `docs/HANDOFF.md` F26 records that, rather than rounding it up to "works".
- Three **write** intents are declared and **deliberately un-runnable**:
  `sendConnectionInvitation`, `sendMessage`, `createPost`. No Voyager write request has been
  observed, and a write shape recalled from memory would be both unverifiable and permanently
  drifting. The executor refuses them. `docs/DISCOVERY.md` is how one becomes real.
- The suite is entirely offline. Live calls have been made by hand against a test account in an
  isolated `API_ANYTHING_HOME`; `docs/HANDOFF.md` records every one, including the sessions that
  were revoked and the one time a session was handed over incorrectly. **No write has ever been
  attempted.**

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
npm run cli -- doctor                    # session, account, and every read spec
npm run cli -- ops                       # what exists, and what is verified
npm run cli -- plan    --campaign c.json --leads l.json
npm run cli -- run     --campaign c.json --leads l.json --dry   # preview every write
npm run cli -- discover capture.har      # propose operations from browser evidence
```

`doctor` is the pre-flight: it performs exactly **one** live read (`getMe`), tells you which account
the session actually belongs to, says whether writes are permitted for that account, and renders
every read operation without sending.

A campaign is JSON: an id, where the audience came from, and ordered steps whose arguments may use
`{{field}}` placeholders resolved from each lead. See `test/fixtures/campaign.json`.

A write needs **four** things to run, and each is a separate chance to stop:

1. **an observed request shape** — the operation is `verified`, learned from real traffic;
2. **the account guard** — the signed-in account is listed in `LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS`.
   Checked first, because it is the only gate that compares the identity actually signed in rather
   than a flag someone set. An **empty list permits nothing**, so writes cannot reach your personal
   profile by accident;
3. **`LINKEDIN_AUTOMATOR_ALLOW_WRITES=true`**;
4. **`--confirm`** on this run.

Pacing ceilings default to LinkedIn's practical invitation envelope. The per-day ceiling for each
surface is configurable; the weekly and monthly ceilings stay at their conservative defaults.

## Verifying against a real account

Never on your primary profile. `docs/TESTING.md` covers the throwaway account, session isolation
(do **not** import your everyday browser's session), the staged order, and how to hand a session to
a helper by **path** rather than by value — an `li_at` cookie *is* the account until it expires.

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

## Security

Report a vulnerability privately through GitHub's advisory form — see [SECURITY.md](SECURITY.md).
Never include a session cookie in a report; a `li_at` value is the account until it expires.

## License

MIT. See [LICENSE](LICENSE).
