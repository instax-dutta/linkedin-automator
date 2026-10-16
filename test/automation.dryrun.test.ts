import { test } from "node:test";
import assert from "node:assert/strict";

import { previewPlan } from "../src/automation/runner.js";
import type { PlanEntry } from "../src/automation/campaign.js";
import { createFakeEngine } from "./fixtures/engine.js";

const AT = "2026-10-16T12:00:00.000Z";

function entry(over: Partial<PlanEntry> = {}): PlanEntry {
  return {
    campaignId: "q4-outreach",
    leadId: "lead-1",
    stepId: "invite",
    op: "sendConnectionInvitation",
    kind: "write",
    args: { profileId: "ana" },
    requiresConfirmation: true,
    verified: false,
    at: AT,
    ...over,
  };
}

test("a dry run previews each write and never reaches the engine", async () => {
  const client = createFakeEngine([]);

  const previews = await previewPlan([entry({ stepId: "a" }), entry({ stepId: "b" })], { client });

  assert.equal(previews.length, 2);
  assert.equal(client.calls.length, 0, "a preview must not call the engine");
  assert.equal(previews[0]?.preview?.method, "POST");
});

test("a preview shows the exact arguments the write would carry", async () => {
  const client = createFakeEngine([]);

  const previews = await previewPlan(
    [entry({ args: { recipient: "ana", text: "Hi Ana" }, op: "sendMessage" })],
    { client },
  );

  assert.equal(previews[0]?.preview?.body, JSON.stringify({ recipient: "ana", text: "Hi Ana" }));
});

test("a preview is the engine's rendering, not something synthesised locally", async () => {
  const client = createFakeEngine([]);

  const previews = await previewPlan([entry({ op: "sendMessage" })], { client });

  assert.equal(
    previews[0]?.preview?.url,
    "https://www.linkedin.com/voyager/api/sendMessage",
    "the URL must come from the renderer, so a preview cannot drift from the real request",
  );
});

test("reads are not previewed, because there is no request worth showing", async () => {
  const client = createFakeEngine([]);

  const previews = await previewPlan(
    [entry({ kind: "read", op: "getProfile", requiresConfirmation: false })],
    { client },
  );

  assert.deepEqual(previews, []);
});

test("a step the planner skipped is not previewed", async () => {
  const client = createFakeEngine([]);

  const previews = await previewPlan([entry({ skipReason: "already done" })], { client });

  assert.deepEqual(previews, []);
});

test("a preview that cannot be rendered reports the reason instead of throwing", async () => {
  const client = createFakeEngine([]);
  const broken = {
    ...client,
    async preview() {
      throw new Error('no operation "sendConnectionInvitation" on linkedin');
    },
  };

  const previews = await previewPlan([entry()], { client: broken });

  assert.match(previews[0]?.error ?? "", /no operation/);
  assert.equal(previews[0]?.preview, undefined);
});
