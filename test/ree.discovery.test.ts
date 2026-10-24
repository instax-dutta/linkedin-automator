import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSite } from "api-anything";

import {
  candidateName,
  discoverCandidates,
  toDraftSite,
  type DiscoveryInput,
} from "../src/ree/candidates.js";
import { createReaClient, DEFAULT_REA_COMMAND } from "../src/ree/rea.js";

const input: DiscoveryInput = {
  evidenceId: "ev-1",
  traffic: [
    { method: "GET", url: "https://www.linkedin.com/voyager/api/me" },
    { method: "GET", url: "https://www.linkedin.com/voyager/api/me" },
    { method: "GET", url: "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=ana" },
    { method: "POST", url: "https://www.linkedin.com/voyager/api/growth/normInvitations" },
    { method: "GET", url: "https://www.linkedin.com/feed/" },
    { method: "GET", url: "https://tracking.example.com/collect" },
  ],
  bundleEndpoints: [
    { url: "https://www.linkedin.com/voyager/api/organization/companies" },
    { url: "https://www.linkedin.com/voyager/api/me" },
  ],
};

test("an operation name is derived from the Voyager path", () => {
  assert.equal(candidateName("/voyager/api/me"), "me");
  assert.equal(candidateName("/voyager/api/identity/dash/profiles"), "identityDashProfiles");
  assert.equal(candidateName("/voyager/api/organization/companies"), "organizationCompanies");
});

test("leading slashes before the Voyager prefix are ignored", () => {
  assert.equal(candidateName("///voyager/api/me"), "me");
});

test("only LinkedIn Voyager requests become candidates", () => {
  const candidates = discoverCandidates(input);
  const paths = candidates.map((c) => c.path);
  assert.equal(paths.includes("/voyager/api/me"), true);
  assert.equal(paths.some((p) => p.startsWith("/feed")), false);
  assert.equal(
    candidates.some((c) => c.host === "tracking.example.com"),
    false,
    "a third-party capture host is not a LinkedIn candidate",
  );
});

test("an endpoint seen twice is reported once", () => {
  const me = discoverCandidates(input).filter((c) => c.path === "/voyager/api/me");
  assert.equal(me.length, 1);
});

test("observed traffic is labelled as observed and outranks a bundle inference", () => {
  const me = discoverCandidates(input).find((c) => c.path === "/voyager/api/me");
  assert.equal(me?.provenance.source, "observed-traffic");
  assert.equal(me?.confidence, "observed");
});

test("an endpoint found only in a bundle is labelled an inference", () => {
  const company = discoverCandidates(input).find(
    (c) => c.path === "/voyager/api/organization/companies",
  );
  assert.equal(company?.provenance.source, "bundle-inference");
  assert.equal(company?.confidence, "inferred");
});

test("methods decide whether a candidate is a read or a write", () => {
  const candidates = discoverCandidates(input);
  assert.equal(candidates.find((c) => c.path === "/voyager/api/me")?.kind, "read");
  assert.equal(
    candidates.find((c) => c.path === "/voyager/api/growth/normInvitations")?.kind,
    "write",
  );
});

test("every candidate carries the evidence it came from", () => {
  for (const candidate of discoverCandidates(input)) {
    assert.equal(candidate.provenance.evidence, "ev-1");
  }
});

test("discovery never claims verification, because it only proposes", () => {
  for (const candidate of discoverCandidates(input)) {
    assert.equal(candidate.confidence === "observed" || candidate.confidence === "inferred", true);
    assert.notEqual(candidate.confidence, "verified");
  }
});

test("a draft spec parses through api-anything's own validator", () => {
  const draft = toDraftSite(discoverCandidates(input));
  assert.doesNotThrow(() => parseSite(draft));
});

test("a draft spec marks writes as writable and reads as read-only", () => {
  const draft = toDraftSite(discoverCandidates(input));
  const site = parseSite(draft);
  const invite = site.operations.find((op) => op.request.url.includes("normInvitations"));
  assert.equal(invite?.readOnly, false);
  const me = site.operations.find((op) => op.request.url.endsWith("/api/me"));
  assert.equal(me?.readOnly, true);
});

test("a draft spec says it is a draft and holds no credential", () => {
  const raw = JSON.stringify(toDraftSite(discoverCandidates(input)));
  assert.match(raw, /DRAFT/i);
  assert.equal(/AQED|li_at=/.test(raw), false);
  const site = parseSite(JSON.parse(raw) as unknown);
  const csrf = site.operations[0]?.slots.find((slot) => slot.at.includes("header:csrf-token"));
  assert.equal(csrf?.ref, "cookie:JSESSIONID");
});

test("a draft spec attaches a trigger so the shape is complete enough to review", () => {
  const site = parseSite(toDraftSite(discoverCandidates(input)));
  for (const op of site.operations) {
    assert.match(op.trigger.url, /^https:\/\/www\.linkedin\.com\//);
  }
});

test("a base URL with trailing slashes does not produce a doubled trigger path", () => {
  const site = parseSite(
    toDraftSite(discoverCandidates(input), { baseUrl: "https://www.linkedin.com///" }),
  );
  for (const op of site.operations) {
    assert.equal(op.trigger.url, "https://www.linkedin.com/feed/");
  }
});

test("the REA driver executes a pinned release rather than whatever is latest", () => {
  assert.deepEqual(DEFAULT_REA_COMMAND, ["npx", "-y", "rea-agents@6.5.0"]);
});

test("the REA driver shells out to the pinned CLI and returns its parsed evidence", async () => {
  const calls: string[][] = [];
  const rea = createReaClient({
    run: async (argv) => {
      calls.push(argv);
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          structuredContent: { evidence_id: "ev-9", normalized_result: { endpoint_candidates: [] } },
        }),
      };
    },
  });

  const result = await rea.analyzeWebBundle("https://www.linkedin.com/app/main.js");

  assert.equal(result.evidenceId, "ev-9");
  assert.deepEqual(calls[0], ["analyze-web-bundle", "https://www.linkedin.com/app/main.js", "--json"]);
});

test("the REA driver refuses to pretend a failed analysis succeeded", async () => {
  const rea = createReaClient({
    run: async () => ({ exitCode: 2, stderr: "provider unavailable", stdout: "" }),
  });

  await assert.rejects(() => rea.analyzeWebBundle("x"), /provider unavailable/);
});

test("the REA driver reads a saved HAR through REA's offline capture command", async () => {
  const calls: string[][] = [];
  const rea = createReaClient({
    run: async (argv) => {
      calls.push(argv);
      return { exitCode: 0, stderr: "", stdout: JSON.stringify({ structuredContent: {} }) };
    },
  });

  await rea.inspectNetworkCapture("/tmp/session.har", "har");

  assert.deepEqual(calls[0], ["inspect-web-network-capture", "/tmp/session.har", "har", "--json"]);
});
