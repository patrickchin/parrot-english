import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as storage from "../worker/lesson-recording-storage.ts";

function pagedBucket(pages) {
  const lists = [];
  const deletions = [];
  return {
    bucket: {
      async list(options) {
        lists.push(options);
        return pages.get(options.cursor ?? "");
      },
      async delete(keys) {
        deletions.push(keys);
      },
    },
    deletions,
    lists,
  };
}

describe("lesson recording storage", () => {
  it("deletes every page only below the encoded owner prefix", async () => {
    assert.equal(typeof storage.deleteAllLessonRecordings, "function");
    const prefix = "personalized-story-art/user%2Fone/lesson-recordings/";
    const state = pagedBucket(
      new Map([
        [
          "",
          {
            objects: [{ key: `${prefix}generated/lesson-1/clip-1.webm` }],
            truncated: true,
            cursor: "page-2",
          },
        ],
        [
          "page-2",
          {
            objects: [{ key: `${prefix}uploaded/lesson-2/clip-2.webm` }],
            truncated: false,
          },
        ],
      ]),
    );

    await storage.deleteAllLessonRecordings(state.bucket, "user/one");

    assert.deepEqual(state.lists, [
      { prefix },
      { prefix, cursor: "page-2" },
    ]);
    assert.deepEqual(state.deletions, [
      [`${prefix}generated/lesson-1/clip-1.webm`],
      [`${prefix}uploaded/lesson-2/clip-2.webm`],
    ]);
  });

  it("deletes only the exact encoded My Lesson subprefix", async () => {
    assert.equal(typeof storage.deleteLessonRecordingsForLesson, "function");
    const prefix =
      "personalized-story-art/user-1/lesson-recordings/uploaded/lesson%2Fone/";
    const state = pagedBucket(
      new Map([
        [
          "",
          {
            objects: [{ key: `${prefix}clip-1.webm` }],
            truncated: false,
          },
        ],
      ]),
    );

    await storage.deleteLessonRecordingsForLesson(
      state.bucket,
      "user-1",
      "uploaded",
      "lesson/one",
    );

    assert.deepEqual(state.lists, [{ prefix }]);
    assert.deepEqual(state.deletions, [[`${prefix}clip-1.webm`]]);
  });

  it("rejects any key returned outside the requested prefix before deleting", async () => {
    const state = pagedBucket(
      new Map([
        [
          "",
          {
            objects: [{ key: "personalized-story-art/user-2/private.webm" }],
            truncated: false,
          },
        ],
      ]),
    );

    await assert.rejects(
      storage.deleteAllLessonRecordings(state.bucket, "user-1"),
      /outside the lesson recording prefix/i,
    );
    assert.deepEqual(state.deletions, []);
  });

  it("rejects truncated pages whose cursor does not advance", async () => {
    const prefix = "personalized-story-art/user-1/lesson-recordings/";
    for (const cursor of [undefined, ""]) {
      const state = pagedBucket(
        new Map([
          [
            "",
            {
              objects: [{ key: `${prefix}clip-1.webm` }],
              truncated: true,
              cursor,
            },
          ],
        ]),
      );
      await assert.rejects(
        storage.deleteAllLessonRecordings(state.bucket, "user-1"),
        /did not advance its cursor/i,
      );
      assert.deepEqual(state.deletions, []);
    }

    const repeated = pagedBucket(
      new Map([
        [
          "",
          { objects: [], truncated: true, cursor: "page-2" },
        ],
        [
          "page-2",
          { objects: [], truncated: true, cursor: "page-2" },
        ],
      ]),
    );
    await assert.rejects(
      storage.deleteAllLessonRecordings(repeated.bucket, "user-1"),
      /did not advance its cursor/i,
    );
    assert.deepEqual(repeated.deletions, []);
  });
});
