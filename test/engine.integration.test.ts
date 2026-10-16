/**
 * Integration verification against the real dependency.
 *
 * These tests drive the pinned api-anything CLI's own `--dry` renderer, installed into a temporary
 * `API_ANYTHING_HOME`. Nothing here reaches LinkedIn: a dry run builds the request and stops. This
 * is characterization of existing adapter code against a real dependency, not TDD-driven new
 * behaviour, and it is the only place a real process boundary is crossed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApiAnythingClient } from "../src/engine/api-anything.js";
import { listOperations } from "../src/ops/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withInstalledSpec<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(path.join(tmpdir(), "la-home-"));
  try {
    await mkdir(path.join(home, "sites"), { recursive: true });
    await copyFile(
      path.join(ROOT, "specs", "linkedin.json"),
      path.join(home, "sites", "linkedin.json"),
    );
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

/** One value per parameter, chosen to be different from the spec's stored examples. */
const ARGS_BY_OP: Record<string, Record<string, unknown>> = {
  getMe: {},
  getProfile: { publicId: "satyanadella" },
  getCompany: { universalName: "openai" },
  searchPeople: { keywords: "rust engineer zurich" },
  searchCompanies: { keywords: "boston dynamics" },
};

test("a preview of getProfile renders LinkedIn's Voyager request with the argument substituted", async () => {
  await withInstalledSpec(async (home) => {
    const client = createApiAnythingClient({ home });

    const preview = await client.preview({
      site: "linkedin",
      op: "getProfile",
      args: { publicId: "satyanadella" },
    });

    assert.equal(preview.method, "GET");
    assert.equal(
      preview.url,
      "https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=satyanadella",
    );
    assert.equal(preview.headers["x-restli-protocol-version"], "2.0.0");
  });
});

test("every catalogued read operation renders through the real renderer", async () => {
  await withInstalledSpec(async (home) => {
    const client = createApiAnythingClient({ home });

    for (const descriptor of listOperations("read")) {
      const preview = await client.preview({
        site: "linkedin",
        op: descriptor.name,
        args: ARGS_BY_OP[descriptor.name] ?? {},
      });
      assert.equal(preview.method, "GET", descriptor.name);
      assert.match(preview.url, /^https:\/\/www\.linkedin\.com\/voyager\/api\//, descriptor.name);
      assert.equal(preview.site, "linkedin");
      assert.equal(preview.op, descriptor.name);
    }
  });
});

test("a preview of an operation that does not exist is reported, not silently empty", async () => {
  await withInstalledSpec(async (home) => {
    const client = createApiAnythingClient({ home });

    await assert.rejects(
      () => client.preview({ site: "linkedin", op: "sendMessage", args: { text: "hi" } }),
      /no operation "sendMessage"/,
      "the write we have not learned yet must not render",
    );
  });
});

test("a preview carries no credential value, only what the renderer left behind", async () => {
  await withInstalledSpec(async (home) => {
    const client = createApiAnythingClient({ home });

    const preview = await client.preview({
      site: "linkedin",
      op: "getMe",
      args: {},
    });

    assert.equal(/AQED|li_at=/.test(JSON.stringify(preview)), false);
  });
});
