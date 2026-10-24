/**
 * Turn browser evidence about LinkedIn's own frontend into candidate operations.
 *
 * Discovery only ever *proposes*. Nothing here is promoted into `specs/` or `src/ops/` without a
 * person confirming the observed traffic, because a guessed endpoint on a production account sends
 * a real message to a real person. Every candidate therefore carries the evidence it came from and
 * whether it was observed or inferred.
 */

export interface TrafficRecord {
  readonly method: string;
  readonly url: string;
}

export interface BundleEndpoint {
  readonly url: string;
  readonly method?: string;
}

export interface DiscoveryInput {
  /** Requests observed in a capture. The strongest evidence available. */
  readonly traffic?: readonly TrafficRecord[];
  /** Endpoints found by static bundle analysis, which runs no code. */
  readonly bundleEndpoints?: readonly BundleEndpoint[];
  /** The REA Evidence id, carried through so a claim can be traced back. */
  readonly evidenceId?: string;
}

export type CandidateSource = "observed-traffic" | "bundle-inference";

export interface CandidateProvenance {
  readonly source: CandidateSource;
  readonly evidence: string;
}

export interface CandidateOperation {
  readonly name: string;
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly kind: "read" | "write";
  readonly confidence: "observed" | "inferred";
  readonly provenance: CandidateProvenance;
}

const VOYAGER_PREFIX = "/voyager/api/";

/** LinkedIn's own hosts. Anything else in a capture is a third party and not ours to model. */
function isLinkedInHost(host: string): boolean {
  return host === "www.linkedin.com" || host.endsWith(".linkedin.com");
}

function parseVoyagerUrl(raw: string): { host: string; path: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (!isLinkedInHost(parsed.hostname)) return undefined;
  if (!parsed.pathname.startsWith(VOYAGER_PREFIX)) return undefined;
  return { host: parsed.hostname, path: parsed.pathname };
}

/**
 * Read requests out of a saved HAR 1.2 document.
 *
 * Purely offline: recorded URLs are read, never fetched. Anything that is not HAR 1.2 is refused
 * rather than half-read, because a partially parsed capture would silently under-report what the
 * page actually called.
 */
export function trafficFromHar(har: unknown): readonly TrafficRecord[] {
  if (typeof har !== "object" || har === null) {
    throw new Error("not a HAR document");
  }
  const log = (har as { log?: unknown }).log;
  if (typeof log !== "object" || log === null) {
    throw new Error("not a HAR document: no log object");
  }
  const { version, entries } = log as { version?: unknown; entries?: unknown };
  if (version !== "1.2") {
    throw new Error(`unsupported HAR version ${String(version)}; only HAR 1.2 is read`);
  }
  if (!Array.isArray(entries)) {
    throw new Error("not a HAR document: log.entries is not an array");
  }

  const records: TrafficRecord[] = [];
  for (const entry of entries) {
    const request = (entry as { request?: unknown } | null)?.request;
    if (typeof request !== "object" || request === null) continue;
    const { method, url } = request as { method?: unknown; url?: unknown };
    if (typeof method !== "string" || typeof url !== "string") continue;
    records.push({ method, url });
  }
  return records;
}

/**
 * Strip leading slashes without a regex.
 *
 * The path comes from an untrusted capture, and an anchored `^\/+` replacement is flagged as
 * polynomial on adversarial input; a linear scan does the same job with no backtracking.
 */
function withoutLeadingSlashes(value: string): string {
  let start = 0;
  while (value[start] === "/") start += 1;
  return value.slice(start);
}

/** The same, for the trailing run: a regex here is also polynomial on hostile input. */
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

/** `identity/dash/profiles` becomes `identityDashProfiles`. */
export function candidateName(path: string): string {
  // Collapse any run of leading slashes to the single slash the prefix expects.
  const normalised = path.startsWith("/") ? `/${withoutLeadingSlashes(path)}` : path;
  const trimmed = normalised.startsWith(VOYAGER_PREFIX)
    ? normalised.slice(VOYAGER_PREFIX.length)
    : normalised.startsWith("/")
      ? normalised.slice(1)
      : normalised;
  const parts = trimmed.split(/[^A-Za-z0-9]+/).filter((part) => part !== "");
  if (parts.length === 0) return "operation";
  return parts
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

function kindOf(method: string): "read" | "write" {
  return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD" ? "read" : "write";
}

function keyOf(method: string, host: string, path: string): string {
  return `${method.toUpperCase()} ${host}${path}`;
}

/**
 * Collect candidate operations, preferring observed traffic over bundle inference.
 *
 * A bundle can only suggest that an endpoint exists; a capture proves a request was made. Where
 * both see the same endpoint, the observed record wins and the inference is dropped.
 */
export function discoverCandidates(input: DiscoveryInput): readonly CandidateOperation[] {
  const evidence = input.evidenceId ?? "unrecorded";
  const byKey = new Map<string, CandidateOperation>();

  const add = (
    method: string,
    host: string,
    path: string,
    source: CandidateSource,
  ): void => {
    const key = keyOf(method, host, path);
    const existing = byKey.get(key);
    if (existing && existing.provenance.source === "observed-traffic") return;
    byKey.set(key, {
      name: candidateName(path),
      method: method.toUpperCase(),
      host,
      path,
      kind: kindOf(method),
      confidence: source === "observed-traffic" ? "observed" : "inferred",
      provenance: { source, evidence },
    });
  };

  for (const record of input.traffic ?? []) {
    const parsed = parseVoyagerUrl(record.url);
    if (parsed) add(record.method, parsed.host, parsed.path, "observed-traffic");
  }

  for (const endpoint of input.bundleEndpoints ?? []) {
    const parsed = parseVoyagerUrl(endpoint.url);
    if (parsed) add(endpoint.method ?? "GET", parsed.host, parsed.path, "bundle-inference");
  }

  // Names must be unique: they become operation identifiers a person will type.
  const names = new Map<string, number>();
  return [...byKey.values()].map((candidate) => {
    const seen = names.get(candidate.name) ?? 0;
    names.set(candidate.name, seen + 1);
    return seen === 0
      ? candidate
      : { ...candidate, name: `${candidate.name}${seen + 1}` };
  });
}

export interface DraftSiteOptions {
  readonly name?: string;
  readonly displayName?: string;
  readonly baseUrl?: string;
  /** The page an operator opens to observe the site's own traffic. */
  readonly triggerUrl?: string;
}

/**
 * Render candidates as a site spec that `parseSite()` accepts, so a person can review and edit it.
 *
 * The trigger is the site root because discovery has not observed the UI action that fires these
 * requests. That is precisely the part a person must supply, so the description says so rather
 * than implying the draft is ready to run. Credentials stay as references, as in every spec.
 */
export function toDraftSite(
  candidates: readonly CandidateOperation[],
  options: DraftSiteOptions = {},
): Record<string, unknown> {
  const baseUrl = options.baseUrl ?? "https://www.linkedin.com";
  // A trigger is a page a person opens, not a bare origin: discovery needs somewhere to start
  // observing the site's own requests from.
  const triggerUrl = options.triggerUrl ?? `${withoutTrailingSlashes(baseUrl)}/feed/`;
  return {
    name: options.name ?? "linkedin",
    displayName: options.displayName ?? "LinkedIn (draft)",
    baseUrl,
    description:
      "DRAFT discovered from browser evidence. Review each request against observed traffic and " +
      "replace the placeholder trigger before promoting any operation into specs/.",
    loginCookies: ["li_at", "JSESSIONID"],
    operations: candidates.map((candidate) => ({
      name: candidate.name,
      description: `${candidate.method} ${candidate.path} — discovered via ${candidate.provenance.source} (${candidate.provenance.evidence}); confidence: ${candidate.confidence}`,
      request: {
        method: candidate.method,
        url: `https://${candidate.host}${candidate.path}`,
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
          "csrf-token": "",
          "x-restli-protocol-version": "2.0.0",
        },
      },
      slots: [
        { ref: "cookie:JSESSIONID", at: ["header:csrf-token"], transform: "strip-quotes" },
      ],
      volatile: [],
      trigger: { url: triggerUrl },
      match: { method: candidate.method, host: candidate.host, path: candidate.path },
      response: { format: "json" },
      params: [],
      readOnly: candidate.kind === "read",
      minTier: 1,
      learnedLoggedIn: true,
    })),
  };
}
