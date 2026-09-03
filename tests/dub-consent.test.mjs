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

const ownerIdentity = {
  learnerName: "Mia",
  learnerProfileId: "learner-a",
  sessionId: "session-a",
  userId: "user-1",
};

const siblingIdentity = {
  learnerName: "Leo",
  learnerProfileId: "learner-b",
  sessionId: "session-b",
  userId: "user-1",
};

beforeEach(() => {
  state = createTestD1Database();
  insertUser(state.sqlite, "user-1");
  const insertLearner = state.sqlite.prepare(
    `INSERT INTO learner_profile
      (id, auth_user_id, name, private_media_name, name_key,
       onboarding_status)
     VALUES (?, ?, ?, ?, ?, 'not_started')`,
  );
  insertLearner.run("learner-a", "user-1", "Mia", "Mia", "mia");
  insertLearner.run("learner-b", "user-1", "Leo", "Leo", "leo");
  repository = createDubConsentRepository(createDatabase(state.d1), {
    createGeneration: () => "grant-1",
    now: () => new Date("2026-08-25T08:00:00.000Z"),
  });
});

afterEach(() => state.close());

test("a fresh account has no current dubbing grant", async () => {
  assert.deepEqual(await repository.status(ownerIdentity), { state: "not_granted" });
  assert.equal(await repository.requireCurrentGrant(ownerIdentity), null);
});

test("grant stores the current version and a fresh opaque generation", async () => {
  const granted = await repository.grant(ownerIdentity);
  assert.equal(granted.state, "granted");
  assert.equal(granted.consentVersion, "guardian-voice-r2-v2");
  assert.equal(granted.grantGeneration, "grant-1");
  assert.ok(granted.grantedAt instanceof Date);
});

test("revoking blocks grant and exact-generation checks until cleanup finishes", async () => {
  const granted = await repository.grant(ownerIdentity);
  const revoking = await repository.beginRevocation(ownerIdentity);
  assert.equal(revoking.state, "revoking");
  assert.equal(await repository.requireCurrentGrant(ownerIdentity, granted.grantGeneration), null);
  await assert.rejects(() => repository.grant(ownerIdentity), /dub_consent_revoking/);
  await repository.finishRevocation(ownerIdentity, revoking.grantGeneration);
  assert.deepEqual(await repository.status(ownerIdentity), { state: "not_granted" });
});

test("replaces a stale consent version with one fresh current generation", async () => {
  const timestamp = Date.parse("2026-08-25T08:00:00.000Z");
  state.sqlite.prepare(
    `INSERT INTO learner_dub_consent
      (learner_profile_id, auth_user_id, consent_version, grant_generation,
       state, granted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "learner-a",
    "user-1",
    "guardian-voice-r2-v1",
    "old-grant",
    "granted",
    timestamp,
    timestamp,
  );

  assert.equal(await repository.requireCurrentGrant(ownerIdentity), null);
  const granted = await repository.grant(ownerIdentity);
  assert.equal(granted.state, "granted");
  assert.equal(granted.consentVersion, "guardian-voice-r2-v2");
  assert.equal(granted.grantGeneration, "grant-1");
});

test("rejects wrong grant generations", async () => {
  await repository.grant(ownerIdentity);

  assert.equal(await repository.requireCurrentGrant(ownerIdentity, "wrong-grant"), null);
});

test("finishing a different revocation generation preserves the active cleanup", async () => {
  await repository.grant(ownerIdentity);
  const revoking = await repository.beginRevocation(ownerIdentity);

  await repository.finishRevocation(ownerIdentity, "wrong-grant");

  assert.deepEqual(await repository.status(ownerIdentity), revoking);
});

test("every learner uses an independent learner-scoped consent authority", async () => {
  const ownerGrant = await repository.grant(ownerIdentity);

  assert.deepEqual(await repository.status(siblingIdentity), {
    state: "not_granted",
  });
  assert.equal(await repository.requireCurrentGrant(siblingIdentity), null);
  assert.equal(
    state.sqlite.prepare("SELECT count(*) AS count FROM learner_dub_consent").get().count,
    1,
  );

  const siblingGrant = await repository.grant(siblingIdentity);
  const siblingRevocation = await repository.beginRevocation(siblingIdentity);
  assert.equal(siblingRevocation.state, "revoking");
  assert.deepEqual(await repository.status(ownerIdentity), ownerGrant);
  assert.equal(
    await repository.requireCurrentGrant(
      siblingIdentity,
      siblingGrant.grantGeneration,
    ),
    null,
  );
  await repository.finishRevocation(
    siblingIdentity,
    siblingRevocation.grantGeneration,
  );

  assert.deepEqual(await repository.status(siblingIdentity), {
    state: "not_granted",
  });
  assert.deepEqual(await repository.status(ownerIdentity), ownerGrant);
  assert.equal(
    state.sqlite.prepare("SELECT count(*) AS count FROM learner_dub_consent").get().count,
    1,
  );
});
