import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createDatabase } from "../worker/database.ts";
import { createDubConsentRepository } from "../worker/dub-consent.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

function insertUser(sqlite, userId) {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  sqlite.prepare(
    `INSERT INTO user
      (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run(userId, "Guardian", `${userId}@example.test`, timestamp, timestamp);
}

let state;
let repository;

beforeEach(() => {
  state = createTestD1Database();
  insertUser(state.sqlite, "user-1");
  repository = createDubConsentRepository(createDatabase(state.d1), {
    createGeneration: () => "grant-1",
    now: () => new Date("2026-08-25T08:00:00.000Z"),
  });
});

afterEach(() => state.close());

test("a fresh account has no current dubbing grant", async () => {
  assert.deepEqual(await repository.status("user-1"), { state: "not_granted" });
  assert.equal(await repository.requireCurrentGrant("user-1"), null);
});

test("grant stores the current version and a fresh opaque generation", async () => {
  const granted = await repository.grant("user-1");
  assert.equal(granted.state, "granted");
  assert.equal(granted.consentVersion, "guardian-voice-r2-v2");
  assert.equal(granted.grantGeneration, "grant-1");
  assert.ok(granted.grantedAt instanceof Date);
});

test("revoking blocks grant and exact-generation checks until cleanup finishes", async () => {
  const granted = await repository.grant("user-1");
  const revoking = await repository.beginRevocation("user-1");
  assert.equal(revoking.state, "revoking");
  assert.equal(await repository.requireCurrentGrant("user-1", granted.grantGeneration), null);
  await assert.rejects(() => repository.grant("user-1"), /dub_consent_revoking/);
  await repository.finishRevocation("user-1", revoking.grantGeneration);
  assert.deepEqual(await repository.status("user-1"), { state: "not_granted" });
});

test("replaces a stale consent version with one fresh current generation", async () => {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  state.sqlite.prepare(
    `INSERT INTO guardian_dub_consent
      (auth_user_id, consent_version, grant_generation, state, granted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("user-1", "guardian-voice-r2-v1", "old-grant", "granted", timestamp, timestamp);

  assert.equal(await repository.requireCurrentGrant("user-1"), null);
  const granted = await repository.grant("user-1");
  assert.equal(granted.state, "granted");
  assert.equal(granted.consentVersion, "guardian-voice-r2-v2");
  assert.equal(granted.grantGeneration, "grant-1");
});

test("rejects wrong grant generations", async () => {
  await repository.grant("user-1");

  assert.equal(await repository.requireCurrentGrant("user-1", "wrong-grant"), null);
});

test("finishing a different revocation generation preserves the active cleanup", async () => {
  await repository.grant("user-1");
  const revoking = await repository.beginRevocation("user-1");

  await repository.finishRevocation("user-1", "wrong-grant");

  assert.deepEqual(await repository.status("user-1"), revoking);
});
