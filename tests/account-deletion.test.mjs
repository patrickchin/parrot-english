import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabase } from "../worker/database.ts";
import {
  isAccountDeletionPending,
  prepareAccountDeletion,
} from "../worker/account-deletion.ts";
import { createTestD1Database } from "./helpers/d1-test-database.mjs";

const USER_ID = "user-1";
const USER_PREFIX = "personalized-story-art/user-1/";

function seedDatabase() {
  const state = createTestD1Database();
  state.sqlite
    .prepare(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .run(USER_ID, "Parent One", "one@example.test", 1_000, 1_000);
  const insertArt = state.sqlite.prepare(
    `INSERT INTO personalized_story_art (
      id, auth_user_id, story_id, status, r2_object_key, content_type,
      guardian_consent_version, guardian_consent_at, provider,
      prompt_version, created_at, updated_at
    ) VALUES (?, ?, ?, 'ready', ?, 'image/webp', 'guardian-photo-cloudflare-v1', ?,
      'cloudflare-workers-ai', 'red-ball-v1', ?, ?)`,
  );
  insertArt.run(
    "art-1",
    USER_ID,
    "the-red-ball",
    `${USER_PREFIX}the-red-ball/versions/one.webp`,
    1_000,
    1_000,
    1_000,
  );
  insertArt.run(
    "art-2",
    USER_ID,
    "future-story",
    `${USER_PREFIX}future-story/versions/two.webp`,
    1_000,
    1_000,
    1_000,
  );
  return { ...state, database: createDatabase(state.d1) };
}

describe("account deletion personalized-art lifecycle", () => {
  it("tombstones the account and art, purges every R2 object, then permits the user cascade", async () => {
    const state = seedDatabase();
    const events = [];
    try {
      const pages = new Map([
        [
          "",
          {
            cursor: "page-2",
            objects: [
              { key: `${USER_PREFIX}the-red-ball/versions/one.webp` },
              { key: `${USER_PREFIX}untracked/orphan.webp` },
            ],
            truncated: true,
          },
        ],
        [
          "page-2",
          {
            objects: [
              { key: `${USER_PREFIX}future-story/versions/two.webp` },
            ],
            truncated: false,
          },
        ],
      ]);

      await prepareAccountDeletion({
        bucket: {
          async delete(keys) {
            const tombstoneCount = state.sqlite
              .prepare("SELECT count(*) AS count FROM account_deletion_tombstone")
              .get().count;
            const statuses = state.sqlite
              .prepare(
                "SELECT status FROM personalized_story_art WHERE auth_user_id = ? ORDER BY id",
              )
              .all(USER_ID)
              .map(({ status }) => status);
            const userCount = state.sqlite
              .prepare("SELECT count(*) AS count FROM user WHERE id = ?")
              .get(USER_ID).count;
            events.push({ keys, statuses, tombstoneCount, userCount });
          },
          async list({ cursor = "", prefix }) {
            assert.equal(prefix, USER_PREFIX);
            return pages.get(cursor);
          },
        },
        database: state.database,
        now: () => new Date("2026-08-10T12:00:00.000Z"),
        userId: USER_ID,
      });

      assert.equal(await isAccountDeletionPending(state.database, USER_ID), true);
      assert.deepEqual(events, [
        {
          keys: [
            `${USER_PREFIX}the-red-ball/versions/one.webp`,
            `${USER_PREFIX}untracked/orphan.webp`,
          ],
          statuses: ["deleting", "deleting"],
          tombstoneCount: 1,
          userCount: 1,
        },
        {
          keys: [`${USER_PREFIX}future-story/versions/two.webp`],
          statuses: ["deleting", "deleting"],
          tombstoneCount: 1,
          userCount: 1,
        },
      ]);

      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM personalized_story_art")
          .get().count,
        0,
      );
      assert.equal(
        state.sqlite
          .prepare("SELECT count(*) AS count FROM account_deletion_tombstone")
          .get().count,
        1,
        "The opaque tombstone must outlive the user row to fence in-flight uploads",
      );
    } finally {
      state.close();
    }
  });

  it("keeps the user and tombstoned rows recoverable when R2 purge fails, then retries safely", async () => {
    const state = seedDatabase();
    let failDelete = true;
    try {
      const bucket = {
        async delete() {
          if (failDelete) throw new Error("temporary R2 failure");
        },
        async list() {
          return {
            objects: [{ key: `${USER_PREFIX}the-red-ball/versions/one.webp` }],
            truncated: false,
          };
        },
      };

      await assert.rejects(
        prepareAccountDeletion({
          bucket,
          database: state.database,
          userId: USER_ID,
        }),
        /temporary R2 failure/,
      );
      assert.equal(await isAccountDeletionPending(state.database, USER_ID), true);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?").get(USER_ID)
          .count,
        1,
      );
      assert.deepEqual(
        state.sqlite
          .prepare(
            "SELECT status FROM personalized_story_art WHERE auth_user_id = ? ORDER BY id",
          )
          .all(USER_ID)
          .map(({ status }) => status),
        ["deleting", "deleting"],
      );

      failDelete = false;
      await prepareAccountDeletion({
        bucket,
        database: state.database,
        userId: USER_ID,
      });
      state.sqlite.prepare("DELETE FROM user WHERE id = ?").run(USER_ID);
      assert.equal(
        state.sqlite.prepare("SELECT count(*) AS count FROM user WHERE id = ?").get(USER_ID)
          .count,
        0,
      );
    } finally {
      state.close();
    }
  });
});
