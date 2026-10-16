import { test } from "node:test";
import assert from "node:assert/strict";

import { loadCampaign, loadConfig, loadLeads } from "../src/config.js";
import { DEFAULT_PACING } from "../src/automation/pacing.js";

test("writes are off unless the operator turns them on", () => {
  const config = loadConfig({});
  assert.equal(config.allowWrites, false);
  assert.equal(config.allowUnverified, false);
});

test("only an explicit affirmative enables a dangerous flag", () => {
  assert.equal(loadConfig({ LINKEDIN_AUTOMATOR_ALLOW_WRITES: "true" }).allowWrites, true);
  assert.equal(loadConfig({ LINKEDIN_AUTOMATOR_ALLOW_WRITES: "1" }).allowWrites, true);
  for (const value of ["yes", "TRUE!", "", "no", "0", "on"]) {
    assert.equal(
      loadConfig({ LINKEDIN_AUTOMATOR_ALLOW_WRITES: value }).allowWrites,
      false,
      `"${value}" must not enable writes`,
    );
  }
});

test("the pacing defaults are the conservative ones, and are overridable", () => {
  assert.deepEqual(loadConfig({}).pacing, DEFAULT_PACING);

  const tuned = loadConfig({
    LINKEDIN_AUTOMATOR_INVITES_PER_DAY: "25",
    LINKEDIN_AUTOMATOR_MESSAGES_PER_DAY: "40",
  });
  assert.equal(tuned.pacing.invitation.perDay, 25);
  assert.equal(tuned.pacing.message.perDay, 40);
  assert.equal(tuned.pacing.invitation.perWeek, DEFAULT_PACING.invitation.perWeek);
});

test("a nonsense pacing override is refused rather than silently ignored", () => {
  for (const value of ["many", "-5", "0", "1.5"]) {
    assert.throws(
      () => loadConfig({ LINKEDIN_AUTOMATOR_INVITES_PER_DAY: value }),
      /INVITES_PER_DAY/,
      `"${value}" must be rejected`,
    );
  }
});

test("the state directory and the engine home are configurable", () => {
  const config = loadConfig({
    LINKEDIN_AUTOMATOR_STATE_DIR: "/tmp/la-state",
    API_ANYTHING_HOME: "/tmp/la-home",
  });
  assert.equal(config.stateDir, "/tmp/la-state");
  assert.equal(config.apiAnythingHome, "/tmp/la-home");
});

test("a campaign definition is validated rather than trusted", () => {
  const campaign = loadCampaign(
    JSON.stringify({
      id: "q4",
      leadSource: "searchPeople:rust",
      steps: [{ id: "invite", op: "sendConnectionInvitation", args: { profileId: "{{id}}" } }],
    }),
  );
  assert.equal(campaign.id, "q4");
  assert.equal(campaign.steps.length, 1);
});

test("a campaign step naming an operation that does not exist is refused at load", () => {
  assert.throws(
    () =>
      loadCampaign(
        JSON.stringify({
          id: "q4",
          leadSource: "x",
          steps: [{ id: "s", op: "invitePeople", args: {} }],
        }),
      ),
    /unknown operation "invitePeople"/,
  );
});

test("a malformed campaign is refused with a message that says what is wrong", () => {
  assert.throws(() => loadCampaign("{}"), /leadSource|steps|id/);
  assert.throws(() => loadCampaign("not json"), /JSON/);
});

test("leads must be an array of objects each carrying an id", () => {
  const leads = loadLeads(JSON.stringify([{ id: "a", publicId: "ana" }]));
  assert.equal(leads.length, 1);
  assert.throws(() => loadLeads(JSON.stringify({ id: "a" })), /array/i);
  assert.throws(() => loadLeads(JSON.stringify([{ publicId: "ana" }])), /id/);
});
