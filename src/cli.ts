/**
 * The `linkedin-automator` executable.
 *
 * Parsing and rendering only: every decision lives in the library, so the CLI cannot become the
 * only place a rule is enforced. `runCli` takes its engine, store and streams as dependencies,
 * which is what makes the whole surface testable without spawning anything.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createApiAnythingClient } from "./engine/api-anything.js";
import type { LinkedInClient } from "./engine/client.js";
import { findOperation, listOperations, validateArgs, OperationInputError } from "./ops/index.js";
import { emptyUsage } from "./automation/pacing.js";
import { decideAccount } from "./automation/guard.js";
import { createFileStore, type AutomationStore } from "./automation/store.js";
import { planCampaign, LINKEDIN_SITE, type Lead } from "./automation/campaign.js";
import { executePlan, previewPlan } from "./automation/runner.js";
import { discoverCandidates, trafficFromHar } from "./ree/candidates.js";
import { loadCampaign, loadConfig, loadLeads } from "./config.js";

export interface CliDeps {
  readonly client?: LinkedInClient;
  readonly store?: AutomationStore;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly cwd?: string;
  readonly now?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const USAGE = `usage: linkedin-automator <command> [options]

  doctor                                      check the session, the account, and every read spec
  ops [name]                                  list operations, or describe one
  plan --campaign <file> --leads <file>       expand a campaign without doing anything
  run  --campaign <file> --leads <file>       execute a campaign
       [--dry]                                preview writes and send nothing
       [--confirm]                            confirm the writes in this run
  discover <capture.har>                      propose operations from browser evidence
  call <op> [k=v ...]                         call one read operation
  login                                       how to sign in

Planning and dry runs never send anything. A write needs all four of:
  an observed request shape, --confirm, LINKEDIN_AUTOMATOR_ALLOW_WRITES=true, and a signed-in
  account listed in LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS. Run "doctor" to check them.`;

interface Parsed {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

function parse(argv: readonly string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { positionals, flags };
}

function kv(pairs: readonly string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at <= 0) throw new OperationInputError(`expected name=value, got "${pair}"`);
    args[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return args;
}

export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = deps.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;

  const { positionals, flags } = parse(argv);
  const command = positionals[0];

  const fail = (message: string): number => {
    err(message);
    return 2;
  };

  const readText = (relative: string): Promise<string> =>
    readFile(path.resolve(cwd, relative), "utf8");

  const engineFor = (): LinkedInClient => deps.client ?? createApiAnythingClient({
    ...(loadConfig(env).apiAnythingHome ? { home: loadConfig(env).apiAnythingHome! } : {}),
  });

  // Campaign state has to outlive the process, or a re-run would repeat steps already taken.
  const storeFor = (): AutomationStore => {
    if (deps.store) return deps.store;
    const config = loadConfig(env);
    return createFileStore(path.resolve(cwd, config.stateDir, "state.jsonl"));
  };

  switch (command) {
    case undefined:
      err(USAGE);
      return 2;

    case "ops": {
      const wanted = positionals[1];
      if (wanted !== undefined) {
        let descriptor;
        try {
          descriptor = findOperation(wanted);
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error));
        }
        out(`${descriptor.name}  [${descriptor.kind}${descriptor.verified ? "" : ", unverified"}]`);
        out(`  ${descriptor.summary}`);
        for (const param of descriptor.params) {
          out(
            `  ${param.required ? "*" : " "} ${param.name}: ${param.type} — ${param.description}`,
          );
          if (param.hint) out(`      ${param.hint}`);
        }
        return 0;
      }

      for (const kind of ["read", "write"] as const) {
        out(`${kind}s:`);
        for (const descriptor of listOperations(kind)) {
          const mark = descriptor.verified ? "verified  " : "unverified";
          out(`  ${descriptor.name.padEnd(28)} ${mark}  ${descriptor.summary}`);
        }
      }
      return 0;
    }

    case "doctor": {
      const config = loadConfig(env);
      const client = engineFor();

      const me = await client.call<Record<string, unknown>>({
        site: LINKEDIN_SITE,
        op: "getMe",
      });
      if (!me.ok) {
        err(`session: ${me.class}: ${me.reason}`);
        if (me.next) err(`next: ${me.next}`);
        return 1;
      }

      const data = me.data ?? {};
      const name = [data.firstName, data.lastName]
        .filter((value): value is string => typeof value === "string" && value !== "")
        .join(" ");
      const account =
        typeof data.publicIdentifier === "string" ? data.publicIdentifier : undefined;

      out(`session: signed in as ${name || "(no name reported)"} (${account ?? "unknown"})`);
      if (me.tier !== undefined) out(`  transport: tier ${me.tier} in ${me.ms}ms`);

      const decision = decideAccount(account, config.allowedAccounts);
      out(
        decision.ok
          ? `writes: permitted for "${account}"`
          : `writes: refused — ${decision.reason}`,
      );
      if (!config.allowWrites) {
        out(
          "  note: LINKEDIN_AUTOMATOR_ALLOW_WRITES is off, so a write also needs that setting",
        );
      }

      out("reads (rendered, not sent):");
      for (const descriptor of listOperations("read")) {
        const args: Record<string, unknown> = {};
        for (const param of descriptor.params) {
          if (param.required) args[param.name] = "example";
        }
        try {
          const preview = await client.preview({ site: LINKEDIN_SITE, op: descriptor.name, args });
          out(`  ${descriptor.name.padEnd(16)} ${preview.method} ${preview.url}`);
        } catch (error) {
          out(
            `  ${descriptor.name.padEnd(16)} unavailable — ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      out("doctor changes nothing: one read, and the rest rendered without sending");
      return 0;
    }

    case "plan":
    case "run": {
      const campaignPath = flags.campaign;
      const leadsPath = flags.leads;
      if (typeof campaignPath !== "string" || typeof leadsPath !== "string") {
        return fail(USAGE);
      }

      const config = loadConfig(env);
      const campaign = loadCampaign(await readText(campaignPath));
      const leads: readonly Lead[] = loadLeads(await readText(leadsPath));

      const plan = await planCampaign(campaign, leads, {
        store: storeFor(),
        usage: emptyUsage(deps.now ?? new Date()),
        now: deps.now ?? new Date(),
        config: config.pacing,
      });

      const runnable = plan.entries.filter((entry) => entry.skipReason === undefined);
      out(
        `plan ${campaign.id}: ${plan.entries.length} entries, ${runnable.length} runnable, ` +
          `${plan.entries.length - runnable.length} blocked`,
      );
      for (const entry of plan.entries) {
        out(
          `  ${entry.leadId.padEnd(10)} ${entry.stepId.padEnd(10)} ${entry.kind.padEnd(5)} ` +
            `${entry.op.padEnd(26)} ${entry.skipReason ?? "runnable"}`,
        );
      }

      if (command === "plan") return 0;

      if (flags.dry === true) {
        const previews = await previewPlan(plan, { client: engineFor() });
        if (previews.length === 0) out("dry run: no writes to preview");
        for (const outcome of previews) {
          if (outcome.preview) {
            out(
              `PREVIEW ${outcome.entry.stepId}: ${outcome.entry.op} ` +
                `${outcome.preview.method} ${outcome.preview.url}`,
            );
            if (outcome.preview.body) out(`  body: ${outcome.preview.body}`);
          } else {
            out(`PREVIEW ${outcome.entry.stepId}: unavailable — ${outcome.error ?? "unknown"}`);
          }
        }
        out("dry run: nothing was sent");
        return 0;
      }

      const client = engineFor();

      // Resolve who is actually signed in. Without it the guard refuses every write, which is the
      // safe outcome, but a live run should say why before it starts rather than after.
      let account: string | undefined;
      if (plan.entries.some((entry) => entry.kind === "write" && entry.skipReason === undefined)) {
        const me = await client.call<Record<string, unknown>>({ site: LINKEDIN_SITE, op: "getMe" });
        if (me.ok && typeof me.data?.publicIdentifier === "string") {
          account = me.data.publicIdentifier;
          out(`account: signed in as "${account}"`);
        } else {
          out(
            `account: could not be established (${me.ok ? "no public identifier reported" : me.reason}) — writes will be refused`,
          );
        }
      }

      // Every gate open at once: this run's confirmation, the setting, and the account allow-list.
      const confirmed = flags.confirm === true && config.allowWrites;
      const outcomes = await executePlan(plan, {
        client,
        store: storeFor(),
        confirm: () => confirmed,
        allowUnverified: config.allowUnverified,
        allowedAccounts: config.allowedAccounts,
        ...(account !== undefined ? { account } : {}),
        ...(deps.now ? { now: () => deps.now! } : {}),
      });

      for (const outcome of outcomes) {
        out(
          `  ${outcome.entry.stepId.padEnd(10)} ${outcome.status.padEnd(11)} ` +
            `${outcome.reason ?? ""}`.trimEnd(),
        );
        if (outcome.next) out(`      next: ${outcome.next}`);
      }
      if (!confirmed && outcomes.some((outcome) => outcome.entry.kind === "write")) {
        out(
          "writes were refused: add --confirm and set LINKEDIN_AUTOMATOR_ALLOW_WRITES=true (run --dry first)",
        );
      }
      if (config.allowedAccounts.length === 0) {
        out(
          "no account is allow-listed: set LINKEDIN_AUTOMATOR_ALLOWED_ACCOUNTS to the test account's public id",
        );
      }

      const troubled = outcomes.filter(
        (outcome) => outcome.status === "refused" || outcome.status === "failed" || outcome.status === "unconfirmed",
      );
      out(
        `run complete: ${outcomes.length - troubled.length} ok, ${troubled.length} needing attention`,
      );
      return troubled.length === 0 ? 0 : 1;
    }

    case "discover": {
      const file = positionals[1];
      if (file === undefined) return fail(USAGE);
      const parsed = JSON.parse(await readText(file)) as unknown;
      const candidates = discoverCandidates({
        traffic: trafficFromHar(parsed),
        evidenceId: path.basename(file),
      });

      out(`discovered ${candidates.length} candidate operation(s) from ${path.basename(file)}:`);
      for (const candidate of candidates) {
        out(
          `  ${candidate.name.padEnd(26)} ${candidate.method.padEnd(5)} ${candidate.path}`,
        );
        out(
          `      ${candidate.kind}, ${candidate.confidence} (${candidate.provenance.source}, ` +
            `${candidate.provenance.evidence})`,
        );
      }
      out("these are proposals: see docs/DISCOVERY.md before promoting any into specs/");
      return 0;
    }

    case "call": {
      const name = positionals[1];
      if (name === undefined) return fail(USAGE);

      let descriptor;
      try {
        descriptor = findOperation(name);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }

      let args: Record<string, unknown>;
      try {
        args = kv(positionals.slice(2));
        validateArgs(descriptor, args);
      } catch (error) {
        err(error instanceof Error ? error.message : String(error));
        return 2;
      }

      if (descriptor.kind === "write") {
        return fail(
          `"${name}" is a write. Run a campaign with --dry to preview it, then --confirm with ` +
            `LINKEDIN_AUTOMATOR_ALLOW_WRITES=true. ${descriptor.verified ? "" : "It is also unverified: no request shape has been observed yet."}`.trim(),
        );
      }

      const outcome = await engineFor().call({ site: LINKEDIN_SITE, op: name, args });
      if (outcome.ok) {
        out(JSON.stringify(outcome.data, null, 2));
        return 0;
      }
      err(`${outcome.class}: ${outcome.reason}`);
      if (outcome.next) err(`next: ${outcome.next}`);
      return 1;
    }

    case "login":
      out("Sign in by importing your own browser session — no password is ever collected here:");
      out("  api-anything login linkedin");
      out("If several browser profiles are signed in, it lists them; pick one with --profile.");
      out("Then confirm the account with: linkedin-automator call getMe");
      return 0;

    default:
      return fail(`unknown command "${command}"\n\n${USAGE}`);
  }
}

async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (invokedDirectly) {
  void main();
}
