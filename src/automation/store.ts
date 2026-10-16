/**
 * Dedup and durable state: who has been contacted, which step of which sequence ran, and when.
 *
 * Append-only. Re-running a campaign must not repeat a step the store already records as done, so
 * nothing here rewrites or deletes history.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type ActionOutcome = "executed" | "unconfirmed" | "skipped" | "failed";

export interface ActionRecord {
  readonly leadId: string;
  readonly campaignId: string;
  readonly stepId: string;
  readonly outcome: ActionOutcome;
  /** ISO-8601 timestamp. */
  readonly at: string;
  readonly note?: string;
}

export interface AutomationStore {
  /** True when this exact step is spent for this lead in this campaign. */
  hasDone(leadId: string, campaignId: string, stepId: string): Promise<boolean>;
  append(record: ActionRecord): Promise<void>;
  all(): Promise<readonly ActionRecord[]>;
}

const KEY_SEPARATOR = "\u0000";

function keyOf(record: Pick<ActionRecord, "leadId" | "campaignId" | "stepId">): string {
  return [record.leadId, record.campaignId, record.stepId].join(KEY_SEPARATOR);
}

/**
 * A spent step is one that actually reached LinkedIn, or one whose delivery is unknown.
 *
 * `unconfirmed` counts as done on purpose: retrying a write whose outcome is unknown risks sending
 * the same message twice, which is worse than not sending it at all. `skipped` and `failed` do not
 * count, because nothing was sent and a later attempt is legitimate.
 */
function isSpent(outcome: ActionOutcome): boolean {
  return outcome === "executed" || outcome === "unconfirmed";
}

function spentKeys(records: readonly ActionRecord[]): Set<string> {
  const spent = new Set<string>();
  for (const record of records) {
    if (isSpent(record.outcome)) spent.add(keyOf(record));
  }
  return spent;
}

export function createMemoryStore(seed: readonly ActionRecord[] = []): AutomationStore {
  const records: ActionRecord[] = [...seed];
  let spent = spentKeys(records);

  return {
    async hasDone(leadId, campaignId, stepId) {
      return spent.has(keyOf({ leadId, campaignId, stepId }));
    },
    async append(record) {
      records.push(record);
      if (isSpent(record.outcome)) spent.add(keyOf(record));
    },
    async all() {
      return [...records];
    },
  };
}

function parseLine(line: string): ActionRecord {
  return JSON.parse(line) as ActionRecord;
}

export function createFileStore(file: string): AutomationStore {
  const load = async (): Promise<ActionRecord[]> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map(parseLine);
  };

  let cache: Promise<ActionRecord[]> | undefined;
  const records = (): Promise<ActionRecord[]> => {
    cache ??= load();
    return cache;
  };

  return {
    async hasDone(leadId, campaignId, stepId) {
      return spentKeys(await records()).has(keyOf({ leadId, campaignId, stepId }));
    },
    async append(record) {
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
      cache = undefined; // next read re-reads; the file, not this process, is the source of truth
    },
    async all() {
      return [...(await records())];
    },
  };
}
