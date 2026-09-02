import assert from "node:assert/strict";
import test from "node:test";
import {
  accountPrivateMediaPrefix,
  learnerPrivateMediaPrefix,
  learnerRecordingsPrefix,
  privateMediaPathSegment,
} from "../worker/private-media-storage.ts";

test("private media uses readable account and learner directories", () => {
  const owner = {
    privateMediaName: "Mary",
    userEmail: "guardian@example.com",
  };

  assert.equal(
    accountPrivateMediaPrefix(owner.userEmail),
    "accounts/guardian@example.com/",
  );
  assert.equal(
    learnerPrivateMediaPrefix(owner),
    "accounts/guardian@example.com/learners/Mary/",
  );
  assert.equal(
    learnerRecordingsPrefix(owner),
    "accounts/guardian@example.com/learners/Mary/recordings/",
  );
});

test("private media escapes only unsafe path characters", () => {
  assert.equal(
    privateMediaPathSegment("Mary /\n100% \\ ok"),
    "Mary %2F%0A100%25 %5C ok",
  );
  assert.equal(privateMediaPathSegment(".."), "%2E%2E");
  assert.throws(() => privateMediaPathSegment(" \n "), /segment is empty/);
});

test("path escaping stays injective after stored names are assigned", () => {
  assert.notEqual(privateMediaPathSegment("Å"), privateMediaPathSegment("Å"));
  assert.equal(
    accountPrivateMediaPrefix("  GUARDIAN＠EXAMPLE.COM "),
    "accounts/guardian@example.com/",
  );
});
