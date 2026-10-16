# Research: the two upstream tools, and LinkedIn

Evidence base for this project. Every claim below names its source: a file in a cloned upstream
repo, a command that was run, or a URL. Cloned at the start of this build:

- `api-anything` — `github:goodnight000/api-anything`, cloned to `/tmp/repo-research/api-anything`
  (`#1788526`, and the exact commit is also what `package.json` pins).
- `rea` — `github:morluto/rea`, cloned to `/tmp/repo-research/rea` (`#13d04a0`; npm package
  `rea-agents@6.5.0`).

---

## 1. api-anything — the execution engine

Source: `README.md`, `docs/QUICKSTART.md`, `docs/REFERENCE.md`, `AGENTS.md`, `src/index.ts`,
`sites/linkedin.json`, `sites/linkedin.md`, `skills/api-anything/SKILL.md`.

**What it is.** A local tool that watches a site's own page make a request, learns which parts of
that request are your inputs, saves the result as an *operation*, and replays it over plain HTTP.
The agent calls the operation; the browser is only needed to learn.

**The transport tier ladder** (`docs/REFERENCE.md`, "Replay, fallback and repair") is the core
idea. The lowest tier that worked is remembered per operation:

| tier | transport | used when |
|---|---|---|
| 1 | Node `fetch` with a domain/path-scoped cookie jar | default |
| 2 | `fetch()` inside a real Chrome page on the site | tier 1 is `blocked` |
| 3 | run the trigger in Chrome and read the site's own response | per-request signatures, or a failed heal (reads only) |

**Failure classes** (`src/classify.ts`, surfaced in `CallResult.class`): `ok`, `drift`, `auth`,
`rate`, `blocked`, `input`, `error`, plus `refused` for an unauthorized write. A failure carries
`reason` and a `next` step, and the documented discipline is to follow `next` **at most once**,
then stop — every retry spends the operator's quota and can look like abuse.

**Self-healing.** Every call sends the stored template first. Only `drift` triggers a heal, which
tries a browser-free *rescan* (refetch the page and its scripts, find the new id next to its
anchor) and then a *recapture*. Three guards stop heal loops: an identical retemplate is not
drift, a re-drift within 10 minutes marks the operation stale for 30 minutes, and a healed
template is saved only after a replay succeeds.

**Writes.** `add --write` learns a write by **intercepting and aborting** the request in the
browser, so learning never performs the action. Calling one requires `allowWrites` at every entry
point. A write is sent **once** and retried only when the server certainly did not run it (a
400/401/403/404 answered to the write itself, not after a redirect). Timeouts and 5xx are
reported, not retried. `--dry` prints the exact request with credentials redacted. The honest
limitation in `docs/REFERENCE.md`: write handling is tested against a local fixture, **not**
against every site's real write endpoints — so a receipt must be confirmed by reading back.

**Login.** `api-anything login <site>` imports the site's cookies from the operator's everyday
browser — no password, no re-doing 2FA. If several browser profiles are signed in it **refuses**
and lists candidates rather than guessing, because they may be different people's accounts. It
prints cookie *names*, never values. `--window` opens a visible Chrome for a hand sign-in;
`--cookies <file>` covers headless/CI.

**Credential model.** `~/.api-anything` holds the cookie jar; specs hold references
(`cookie:li_at`, `session:x`), never values. `export` refuses to write a spec containing a live
cookie or session value from the machine, and learning refuses to save a spec with a detected
leftover credential.

**What it ships for LinkedIn** (`sites/linkedin.md`, verified live by the maintainers on
2026-09-27, all at tier 1):

| op | args | returns |
|---|---|---|
| `getMe` | none | own `firstName`, `lastName`, `occupation` (headline), `publicIdentifier` |
| `getProfile` | `publicId` | `firstName`, `lastName`, `headline`, `summary` (About), `publicIdentifier`, `countryCode`, `websites`, `influencer`, `creator`, `entityUrn` |
| `getCompany` | `universalName` | `name`, `universalName`, `tagline`, `description`, `industry`, `staffCount`, `website`, `headquarters`, `url` |
| `searchPeople` | `keywords` | first 10: `name`, `headline`, `location`, `url`, `publicId`, `distance` |
| `searchCompanies` | `keywords` | first 10: `name`, `subtitle`, `followers`, `description`, `url`, `universalName` |

**Auth shape for LinkedIn** (`sites/linkedin.md`, "How it works") — this is the single most
reusable fact in this whole document:

- Every operation calls the **Voyager** REST API directly.
- Auth is the imported `li_at` cookie plus a `csrf-token` header that mirrors the `JSESSIONID`
  cookie with its quotes stripped:
  `{ "ref": "cookie:JSESSIONID", "transform": "strip-quotes", "at": ["header:csrf-token"] }`.
- Plus the constant `x-restli-protocol-version: 2.0.0`.
- **No `decorationId`, no GraphQL `queryId`** — so nothing rotates per deploy. This is why the
  shipped operations stay stable where most LinkedIn scrapers rot weekly.

The concrete endpoints, from the same file:

- `getMe` → `GET /voyager/api/me` (normalized JSON), mini profile at `included[0]`.
- `getProfile` → `GET /voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=<publicId>`
  with `accept: application/json`.
- `getCompany` → `GET /voyager/api/organization/companies?q=universalName&universalName=<name>`
  with `accept: application/json`; the website field is `companyPageUrl`, aliased to `website`.
- `searchPeople` / `searchCompanies` → `GET /voyager/api/search/dash/clusters?q=all&query=(keywords:<k>,flagshipSearchIntent:SEARCH_SRP,queryParameters:(resultType:List(PEOPLE|COMPANIES)),includeFiltersInResponse:false)&start=0&count=10`.
  Results are extracted from `elements[*].items[*].itemUnion.entityResult`, which collects them
  from whichever cluster holds them and skips the inserted cards.

**Shipped limits that matter to this project** (`sites/linkedin.md`, "Known limits"):

- **Read-only. No posting, messaging, or connection requests.** This is exactly the gap this
  project fills.
- **No commas, colons or parentheses in `keywords`.** They are Rest.li syntax and cannot be
  encoded so LinkedIn reads them as text. The parameter pattern refuses them; use spaces.
- **Healing does not apply.** LinkedIn's profile and search pages are now React Server Components,
  so the trigger pages don't call these Voyager endpoints and a heal finds no matching request. A
  real change surfaces as `drift` with a hint to re-add. Practical consequence: **our added
  operations should not lean on healing either**; they should be re-learned when they break.
- No `searchJobs`: `/voyager/api/voyagerJobsDashJobCards` answers 500 without a `decorationId`,
  and baking one in would break on the next deploy.
- `getProfile`'s default projection has only `location.countryCode` and a `geoLocation.geoUrn`,
  and only a card URN for the experience list — so experience is **not** available from that one
  call.
- An unknown or restricted `publicId` answers `403 {"message":"This profile can't be accessed"}`,
  which surfaces as `input`.

**Pacing built in.** HTTP replays to one site are paced at **1 s within one process**; separate CLI
processes are *not* paced against each other. This is why the docs recommend one persistent process
for shared pacing — and why this project does its pacing in-process rather than shelling out per
call.

**Library surface** (`src/index.ts`, confirmed by import): `call`, `closeBrowser`, `capturePage`,
`addOperation`, `heal`, `healOperation`, `parseSite`, `loadSite`, `saveSite`, `listSites`,
`exportSite`, `browserAvailable`, `browserChoice`, `classify`, `learnOperation`, `rankCandidates`,
`createServer`, `serveStdio`. The two we build on are `call` and `parseSite`:

```ts
function call(siteName: string, opName: string, args?: Record<string, unknown>,
              opts?: CallOptions): Promise<CallResult>;

interface CallOptions { allowWrites?: boolean; fetchImpl?: typeof fetch;
                        maxTier?: Tier; minIntervalMs?: number; timeoutMs?: number; }
interface CallResult { ok: boolean; class: Class | "refused"; data?: unknown;
                       truncated?: string; tier?: Tier; healed?: boolean; ms: number;
                       reason?: string; next?: string; }
```

`parseSite(input: unknown): Site` is the important one for us: it lets hand-authored specs be
validated in a test **without a network call**.

**Not on npm.** `docs/QUICKSTART.md` says the package isn't published; install is via the clone or
`npx -y github:goodnight000/api-anything`. Our `package.json` uses the GitHub dependency form.
npm 11 blocks `prepare`/`postinstall` by default, so `npm install-scripts approve api-anything
esbuild` was required before the engine would build and the test runner would work.

**Safety stance** (`docs/REFERENCE.md`, "Safety and terms of service"). It automates *your own*
session on *your own* account, intended for things you could do by hand at human pace. It does not
solve CAPTCHAs or impersonate TLS fingerprints. Many sites' terms restrict automated access, and
the tool says the operator is responsible for how they use it. This project inherits that stance
and does not soften it.

---

## 2. rea — the reverse-engineering tool

Source: `README.md`, `docs/browser-observation.md`, `docs/web-network-captures.md`,
`docs/web-runtime.md`, `docs/website-module-trace.md`, `docs/mcp-contracts.md`, `docs/cli.md`,
`.agents/skills/reverse-engineer-anything/SKILL.md`, `server.json`.

**What it is.** REA ("Reverse Engineer Anything") is one MCP server plus a CLI for inspecting
binaries, Electron/JavaScript apps, .NET assemblies, Android packages, firmware, packet captures
— **and websites**. Analysis runs locally and results are returned as *Evidence* records with
provenance and explicit limitations.

**Why it is here.** Its website surfaces can produce the raw material for a new Voyager operation
without guessing: the endpoints a page actually calls, and the code that calls them. It is the
complement to api-anything — REA finds the request, api-anything learns and replays it.

**The surfaces that matter** (`docs/browser-observation.md`, "Shipped surfaces"):

| tool (MCP) | CLI | what it gives us |
|---|---|---|
| `list_browser_targets` | `rea list-browser-targets` | eligible page targets at a CDP endpoint |
| `inspect_web_page` | `rea inspect-web-page` | DOM, scripts, resources, attach-window network and console metadata, worker/quota info |
| `analyze_web_bundle` | `rea analyze-web-bundle` | parses script artifacts **without execution**: chunk edges, **route and endpoint candidates**, vendor fingerprints, WebMCP declarations, source maps |
| `observe_web_session` | `rea observe-web-session` | arms a window for an external user action and records ordered reload/SPA-nav/redirect/failure metadata |
| `observe_web_execution` | `rea observe-web-execution` | V8 precise coverage + request/initiator attribution for an armed window |
| `inspect_web_network_capture` | `rea inspect-web-network-capture` | **offline** inspection of HAR 1.2 / SAZ / mitmproxy / qlog — recorded URLs are never fetched |
| `trace_web_module_imports` | `rea trace-web-module-imports` | resolves one script's native ES imports against an import map |
| `compare_web_captures` | `rea compare-web-captures` | before/after comparison of captures or scenarios |

`analyze_web_bundle`'s "endpoint candidates" and `inspect_web_network_capture`'s offline HAR
reading are the two that let us work **without** a signed-in account, which is what makes the
discovery workflow demonstrable here.

**Key limits to respect** (`docs/browser-observation.md`, `docs/web-runtime.md`):

- CDP attachment is **passive**: REA attaches to an already-running target without launching it,
  driving actions, or evaluating target code. `capture_browser_scenario` is the separate,
  explicitly-action-driving surface. Do not blur the two.
- CDP needs the browser's **loopback** HTTP discovery endpoint; a browser whose automation channel
  exposes none has nothing to attach to. Endpoints must be loopback — `localhost`, private-LAN
  addresses, HTTPS and `wss:` are refused.
- Attaching can disturb another client's state: Chromium can clear a *different* client's
  `navigator.platform` emulation when REA's session disconnects. Use a disposable browser when
  that matters.
- Precise coverage **changes timing/JIT behaviour** and resets counters; results can be
  function-only when block coverage is unavailable, and missing coverage is *unknown*, not zero.
- Bundles can be enormous. `docs/cli.md` records a 334 MB Obsidian Evidence file reducing to a
  ~10 KB summary view — so the workflow is summary-first, then page into the retained evidence.
- REA's own skill is emphatic: separate **observations, inferences and unknowns**, cite Evidence
  IDs, and never imply static analysis observed execution.

**Install/run.** `npx rea-agents@latest <command>` or a globally installed `rea`. The offline
static-JavaScript path needs no native engine and no MCP registration. MCP setup registers it with
a coding agent, but the CLI is sufficient for scripting.

---

## 3. LinkedIn — the constraints we are building inside

Sources: `sites/linkedin.md` (above), plus current published guidance on LinkedIn API limits.

**Automation allowances.** Independent 2026 write-ups agree on the practical envelope for
invitations: roughly **80–100 invitations per day**, **~200 per week**, **~800 per month** per
account, with daily windows resetting at midnight UTC. LinkedIn's official rate-limit page states
that standard limits are *not* published and are per-application/per-member/per-endpoint,
resetting daily at midnight UTC. The safe reading: the real numbers are unpublished, so the
governor must be conservative and configurable, never tuned up to a hard published ceiling.

**Auth.** `li_at` cookie (the session) plus the `JSESSIONID`-mirrored `csrf-token` header. The
imported session is the operator's *everyday browser session*: if LinkedIn logs it out, both go —
which is a second reason to keep automated traffic slow.

**Structural risk.** Two facts drive the whole design:

1. LinkedIn **owns an internal API that is not the public API**, and its shape changes without
   notice. Specifications rot; guessing them wastes account goodwill.
2. The shipped read operations already reach that internal API successfully, and they do it
   *without* rotating identifiers. So the reliable path to more capability is to **observe real
   traffic and learn it**, not to reverse a signature scheme.

**Compliance posture.** LinkedIn's terms restrict automated access. This project therefore:
imports the operator's own session, paces like a human, defaults every write to dry-run, refuses
writes without explicit confirmation, does not solve CAPTCHAs, does not impersonate a TLS
fingerprint, and does not attempt to defeat bot detection. The operator owns the consequences.

---

## 4. How the two tools compose

```text
  observe            learn                     execute                 orchestrate
 ┌─────────┐      ┌──────────────┐        ┌────────────────┐      ┌──────────────┐
 │   REA   │─────▶│ api-anything │───────▶│  api-anything  │─────▶│    this      │
 │ bundles │      │  add / spec  │        │  call / tiers  │      │   project    │
 │ HAR/CDP │      │  (parseSite) │        │  heal, writes  │      │ campaigns    │
 └─────────┘      └──────────────┘        └────────────────┘      └──────────────┘
   evidence          operation               transport            pacing, dedup,
   + provenance      definition              + auth + guard       confirmation, audit
```

Division of labour, and why each piece sits where it does:

- **REA** answers "what request does this UI action make, and where is it in the bundle?" It is a
  discovery and evidence tool. It deliberately does not drive LinkedIn for us.
- **api-anything** answers "how do I send that request again, safely, with my session, and recover
  when it drifts or is refused?" It owns transport, auth, healing and the write guard.
- **This project** answers "which of these should happen, in what order, how often, and with what
  proof that it happened?" It owns pacing, dedup, confirmation and the audit trail.

Rebuilding any of the first two would be both wasteful and worse; the interesting, unattended
part is the third.

## 5. Open unknowns

Recorded honestly, because they bound what this build can claim:

- **Write endpoints are unverified.** No invite/message/post request has been observed live here.
  The specs for them are therefore *drafts* carrying provenance, gated behind dry-run.
- **No live LinkedIn call was made during this build.** Every test uses fixtures. The engine path
  is exercised by an in-memory fake, and the shipped read specs are validated with `parseSite()`
  rather than executed.
- **Invitation ceilings are secondary sources**, not LinkedIn documentation. They are encoded as
  conservative, configurable defaults.
- **REA's live browser surfaces were not exercised here** (no CDP endpoint was started). The
  offline candidate/model logic is what is implemented and tested; the live runbook is documented
  for the operator to follow.
