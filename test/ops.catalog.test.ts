import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findOperation,
  listOperations,
  operationNames,
  validateArgs,
  OperationInputError,
} from "../src/ops/index.js";

test("the catalog exposes the five read operations api-anything ships for LinkedIn", () => {
  const reads = listOperations("read").map((op) => op.name).sort();
  assert.deepEqual(reads, [
    "getCompany",
    "getMe",
    "getProfile",
    "searchCompanies",
    "searchPeople",
  ]);
});

test("reads are marked verified because their shapes ship with api-anything", () => {
  assert.equal(findOperation("getProfile")?.verified, true);
});

test("the write intents are present but unverified, so nothing may run them yet", () => {
  const writes = listOperations("write");
  assert.deepEqual(writes.map((op) => op.name).sort(), [
    "createPost",
    "sendConnectionInvitation",
    "sendMessage",
  ]);
  assert.equal(
    writes.every((op) => op.verified === false),
    true,
  );
});

test("a read is never registered as a write, and vice versa", () => {
  assert.equal(findOperation("getMe")?.kind, "read");
  assert.equal(findOperation("sendMessage")?.kind, "write");
  assert.throws(() => findOperation("no-such-operation"));
});

test("a missing required argument is rejected before any request is built", () => {
  const profile = findOperation("getProfile");
  assert.ok(profile);
  assert.throws(
    () => validateArgs(profile, {}),
    (error: unknown) =>
      error instanceof OperationInputError && /publicId/.test(error.message),
  );
});

test("an argument the operation does not declare is rejected", () => {
  const me = findOperation("getMe");
  assert.ok(me);
  assert.throws(
    () => validateArgs(me, { extra: "surprise" }),
    (error: unknown) => error instanceof OperationInputError && /extra/.test(error.message),
  );
});

test("LinkedIn's Rest.li punctuation ban is enforced on keywords with a usable hint", () => {
  const search = findOperation("searchPeople");
  assert.ok(search);
  assert.throws(
    () => validateArgs(search, { keywords: "rust, engineer" }),
    (error: unknown) =>
      error instanceof OperationInputError &&
      error.hint !== undefined &&
      /spaces/.test(error.hint),
  );
  assert.doesNotThrow(() => validateArgs(search, { keywords: "rust engineer zurich" }));
});

test("a wrongly typed argument is rejected rather than coerced", () => {
  const profile = findOperation("getProfile");
  assert.ok(profile);
  assert.throws(
    () => validateArgs(profile, { publicId: 42 }),
    (error: unknown) => error instanceof OperationInputError,
  );
});

test("operation names are stable, unique identifiers", () => {
  const names = operationNames();
  assert.equal(new Set(names).size, names.length);
});
