# Runbook: discovering a new LinkedIn operation

How to get from "we need to send an invitation" to a verified api-anything operation, with the
evidence that justifies it. Written to be followed, not interpreted.

The order matters: **observe → learn → replay → verify**. Never guess a request shape and ship it,
because a wrong write on a production account is a real message to a real person.

---

## Step 0 — Check whether it already exists

`api-anything` ships five LinkedIn reads (`getMe`, `getProfile`, `getCompany`, `searchPeople`,
`searchCompanies`). Re-learning one of those is wasted effort.

```sh
api-anything sites
api-anything ops linkedin        # lists parameters and the site's own notes
```

If the operation exists, stop. Wrap it in `src/ops/` and move on.

---

## Step 1 — Observe the real request (needs a signed-in browser)

Two routes. Prefer the first for a specific action, the second for finding what exists.

### Route A — live CDP observation of the action *you* perform

Start a disposable Chrome with a debugging port (a separate profile, so nothing else is disturbed):

```sh
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/rea-browser-profile \
  https://www.linkedin.com/feed/
```

Then, with REA:

```sh
rea list-browser-targets http://127.0.0.1:9222 --json            # pick the page TARGET_ID
rea observe-web-session http://127.0.0.1:9222 TARGET_ID --observation-ms 20000 --json
```

While the observation window is armed, **perform the action by hand** — open the profile, click
Connect, send the invitation. REA records the ordered navigation/lifecycle metadata for the
window. `observe_web_execution` additionally attributes requests to the script that initiated them.

REA attaches passively and does not drive the page; the click is yours. That is deliberate — it
keeps a human in the loop for the action being learned.

### Route B — static endpoint hunting in the JS bundle

No signed-in account needed, which is why this is the route that can be demonstrated and verified.

```sh
rea inspect-web-page http://127.0.0.1:9222 TARGET_ID --json      # script/resource inventory
rea analyze-web-bundle <script-url> --json                       # route + endpoint candidates
```

`analyze_web_bundle` parses **without executing** and yields endpoint candidates, chunk edges and
vendor fingerprints. Cross-check anything it suggests against Route A before trusting it: a
candidate from a bundle is an *inference*, not an observation.

### Route C — an existing HAR/SAZ capture

If you already have traffic logged (Fiddler `.saz`, or a HAR):

```sh
rea inspect-web-network-capture /abs/path/session.har har --json
rea inspect-web-network-capture /abs/path/session.har har --record 2 --json
```

This is fully offline — recorded URLs are never fetched. Use `detail: "summary"` first; the
complete evidence can be hundreds of megabytes.

---

## Step 2 — Learn the operation with api-anything

With the request observed, teach it:

```sh
# reads
api-anything add linkedin <opName> \
  --trigger 'https://www.linkedin.com/in/{publicId}/' \
  --example publicId=williamhgates --example2 publicId=satyanadella \
  --match path=/voyager/api/... \
  --extract '<subtree>' --pick 'field=<path>,other=<path>'

# writes: --write makes api-anything INTERCEPT AND ABORT while learning,
# so learning never performs the action
api-anything add linkedin <writeOpName> --write --trigger '...' --example ... --example2 ...
```

Read the `warnings` in the output. Then check the `preview` — that is what a call will actually
return, judged against the captured response. If the preview is wrong, fix the recipe with
`add <site> <op> --from <captureId>` plus the recipe flags; no browser and no `--example` needed.

### What the spec must look like afterwards

- Auth is the same shape as the shipped reads: `cookie:li_at` for the session plus
  `{ "ref": "cookie:JSESSIONID", "transform": "strip-quotes", "at": ["header:csrf-token"] }`.
- Headers include `x-restli-protocol-version: 2.0.0`.
- **No `decorationId`, no GraphQL `queryId`.** They rotate per deploy, which converts a stable
  operation into a permanently drifting one.
- No credential literals — references only. api-anything refuses to save a spec containing a live
  cookie value, and our own tests assert the absence independently.

---

## Step 3 — Verify before trusting

```sh
api-anything call linkedin <opName> <newArg>=<valueNotUsedAsExample>   # a third value
api-anything verify linkedin                                           # every read, with examples
```

Then for a write, always preview first:

```sh
api-anything call linkedin <writeOpName> ... --dry
```

`--dry` prints the exact request with credentials redacted. Check the recipient id and the body
text byte for byte before ever sending. After a real write, **read the result back** and confirm
the receipt — a 200 is an acknowledgement, not proof of delivery.

---

## Step 4 — Promote it into this repo

1. Add the operation to `specs/linkedin.read.json` or `specs/linkedin.write.json`.
2. Declare it in `src/ops/reads.ts` or `src/ops/writes.ts` with its arguments, guards and return
   shape, and record its provenance.
3. A write must be registered as a `write`; a read must never be.
4. The test suite asserts the spec parses via `parseSite()`, its parameters appear in its request
   template, no credential literal is present, and every `readOnly: false` operation is listed as
   a write.

If you could not verify the request, **do not put it in `specs/`**. Leave it as a draft from
`src/ree/` with its provenance and an unverified marker, so the executor can refuse it.

---

## Failure reference

| class | meaning | action |
|---|---|---|
| `auth` | session expired | `api-anything login linkedin`; the imported session is your browser's, so both go together |
| `rate` | throttled | stop; lower the governor; do not retry now |
| `blocked` | bot challenge | clear it by hand in a real browser |
| `drift` | the site changed | re-learn with `add`; LinkedIn's RSC pages mean healing often cannot help |
| `input` | bad argument, or the thing does not exist | fix the argument; never heal for this |
| `refused` | write without permission | grant permission deliberately, or fix the caller |

Follow `next` **at most once**, then stop and report.
