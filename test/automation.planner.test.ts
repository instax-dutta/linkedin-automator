import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planCampaign,
  renderArgs,
  usageFromRecords,
  type Campaign,
  type Lead,
} from "../src/automation/campaign.js";
import { createMemoryStore, type ActionRecord } from "../src/automation/store.js";
import { emptyUsage, DEFAULT_PACING, type Usage } from "../src/automation/pacing.js";

const NOON = new Date("2026-10-16T12:00:00.000Z");

const campaign: Campaign = {
  id: "q4-outreach",
  leadSource: "searchPeople:rust engineer zurich",
  steps: [
    { id: "invite", op: "sendConnectionInvitation", args: { profileId: "{{publicId}}" } },
    {
      id: "follow-up",
      op: "sendMessage",
      args: { recipient: "{{publicId}}", text: "Hi {{name}}" },
    },
  ],
};

const leads: Lead[] = [
  { id: "lead-1", publicId: "ana", name: "Ana" },
  { id: "lead-2", publicId: "bo", name: "Bo" },
];

interface Overrides {
  campaign?: Campaign;
  leads?: Lead[];
  store?: ReturnType<typeof createMemoryStore>;
  usage?: Usage;
  config?: typeof DEFAULT_PACING;
}

function opts(over: Overrides = {}) {
  return {
    store: over.store ?? createMemoryStore(),
    usage: over.usage ?? emptyUsage(NOON),
    now: NOON,
    config: over.config ?? DEFAULT_PACING,
  };
}

function plan(over: Overrides = {}) {
  return planCampaign(over.campaign ?? campaign, over.leads ?? leads, opts(over));
}

test("a template renders the lead's fields into the operation arguments", () => {
  assert.deepEqual(
    renderArgs({ recipient: "{{publicId}}", text: "Hi {{name}}" }, leads[0]!),
    { recipient: "ana", text: "Hi Ana" },
  );
});

test("an argument naming a field the lead does not have is refused, not left as a placeholder", () => {
  assert.throws(() => renderArgs({ text: "Hi {{missing}}" }, leads[0]!), /missing/);
});

test("planning expands the campaign across every lead and step, in step order", async () => {
  const { entries } = await plan();
  assert.deepEqual(
    entries.map((entry) => `${entry.leadId}:${entry.stepId}`),
    ["lead-1:invite", "lead-1:follow-up", "lead-2:invite", "lead-2:follow-up"],
  );
});

test("reads are planned without requiring confirmation; writes always require it", async () => {
  const { entries } = await plan({
    campaign: {
      id: "mix",
      leadSource: "test",
      steps: [
        { id: "look", op: "getProfile", args: { publicId: "{{publicId}}" } },
        { id: "invite", op: "sendConnectionInvitation", args: { profileId: "{{publicId}}" } },
      ],
    },
  });
  assert.equal(entries[0]?.requiresConfirmation, false);
  assert.equal(entries[1]?.requiresConfirmation, true);
});

test("write intents carry their unverified status into the plan", async () => {
  const { entries } = await plan();
  assert.equal(entries[0]?.verified, false, "no write spec has been observed yet");
});

test("a read reports itself as verified", async () => {
  const { entries } = await plan({
    campaign: {
      id: "read-only",
      leadSource: "test",
      steps: [{ id: "look", op: "getProfile", args: { publicId: "{{publicId}}" } }],
    },
  });
  assert.equal(entries[0]?.verified, true);
});

test("planning is idempotent: a step the store already spent is planned as skipped", async () => {
  const spent: ActionRecord = {
    leadId: "lead-1",
    campaignId: "q4-outreach",
    stepId: "invite",
    outcome: "executed",
    at: NOON.toISOString(),
  };
  const { entries } = await plan({ store: createMemoryStore([spent]) });
  const invite = entries.find((e) => e.leadId === "lead-1" && e.stepId === "invite");
  assert.equal(invite?.skipReason, "already done");
  assert.equal(entries.filter((e) => !e.skipReason).length, 3);
});

test("the governor stops invitations at the daily ceiling and says why", async () => {
  const usage: Usage = {
    ...emptyUsage(NOON),
    invitation: { day: 80, week: 80, month: 80 },
  };
  const { entries } = await plan({ usage });
  const invites = entries.filter((e) => e.stepId === "invite");
  assert.equal(invites.length, 2, "the intent stays visible even when it cannot run");
  assert.match(invites[0]?.skipReason ?? "", /daily/i);
  assert.equal(
    entries.filter((e) => e.stepId === "follow-up" && !e.skipReason).length,
    2,
    "a spent invitation budget must not block messages",
  );
});

test("the budget is rebuilt from the audit trail, so a second run cannot start from zero", async () => {
  const spent: ActionRecord = {
    leadId: "someone-else",
    campaignId: "an-earlier-run",
    stepId: "invite",
    op: "sendConnectionInvitation",
    outcome: "executed",
    at: NOON.toISOString(),
  };
  const usage = usageFromRecords([spent], NOON);

  const { entries } = await plan({
    usage,
    config: { ...DEFAULT_PACING, invitation: { perDay: 1, perWeek: 1, perMonth: 1 } },
  });

  const invite = entries.find((entry) => entry.stepId === "invite");
  assert.match(invite?.skipReason ?? "", /daily limit/i);
  assert.equal(usage.invitation.day, 1);
});

test("a write recorded yesterday still spends the week and month, but not today", () => {
  const yesterday = new Date(NOON.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const spent: ActionRecord = {
    leadId: "someone-else",
    campaignId: "an-earlier-run",
    stepId: "invite",
    op: "sendConnectionInvitation",
    outcome: "executed",
    at: yesterday,
  };

  const usage = usageFromRecords([spent], NOON);

  assert.equal(usage.invitation.day, 0);
  assert.equal(usage.invitation.week, 1);
  assert.equal(usage.invitation.month, 1);
});

test("a skipped or failed write spends no pacing budget when the trail is replayed", () => {
  const base: ActionRecord = {
    leadId: "lead-1",
    campaignId: "q4-outreach",
    stepId: "invite",
    op: "sendConnectionInvitation",
    outcome: "executed",
    at: NOON.toISOString(),
  };

  const usage = usageFromRecords(
    [
      { ...base, outcome: "skipped" },
      { ...base, outcome: "failed" },
      { ...base, outcome: "unconfirmed" },
    ],
    NOON,
  );

  assert.equal(usage.invitation.day, 1, "only the ambiguous write may have been delivered");
});

test("a plan never spends more than the budget, so its running total is authoritative", async () => {
  const result = await plan({
    config: { ...DEFAULT_PACING, invitation: { perDay: 1, perWeek: 1, perMonth: 1 } },
  });
  const runnable = result.entries.filter((e) => e.stepId === "invite" && !e.skipReason);
  assert.equal(runnable.length, 1);
  assert.equal(result.usageAfter.invitation.day, 1);
});

test("a step's delay offsets when the plan says it would run", async () => {
  const { entries } = await plan({
    campaign: {
      id: "paced",
      leadSource: "test",
      steps: [
        { id: "a", op: "getProfile", args: { publicId: "{{publicId}}" }, delayMs: 60_000 },
        { id: "b", op: "getCompany", args: { universalName: "x" } },
      ],
    },
  });
  assert.equal(entries[0]?.at, NOON.toISOString());
  assert.equal(entries[1]?.at, new Date(NOON.getTime() + 60_000).toISOString());
});

test("an argument that fails the operation's guard is planned as skipped with the reason", async () => {
  const { entries } = await plan({
    campaign: {
      id: "bad-guard",
      leadSource: "test",
      steps: [{ id: "s", op: "searchPeople", args: { keywords: "rust, engineer" } }],
    },
  });
  assert.match(entries[0]?.skipReason ?? "", /Rest\.li|spaces/);
});

test("an unknown operation is refused rather than silently planned", async () => {
  await assert.rejects(
    () =>
      plan({
        campaign: {
          id: "typo",
          leadSource: "test",
          steps: [{ id: "s", op: "sendConnectionrequest", args: {} }],
        },
      }),
    /unknown operation/,
  );
});
