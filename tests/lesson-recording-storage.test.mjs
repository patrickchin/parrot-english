import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as storage from "../worker/lesson-recording-storage.ts";

function pagedBucket(pages) {
  const lists = [];
  const deletions = [];
  const writes = [];
  return {
    bucket: {
      async list(options) {
        lists.push(options);
        return pages.get(options.cursor ?? "");
      },
      async delete(keys) {
        deletions.push(keys);
      },
      async put(key, _value, options) {
        writes.push({ key, options });
        return { etag: `fence-${writes.length}`, key };
      },
    },
    deletions,
    lists,
    writes,
  };
}

describe("lesson recording storage", () => {
  it("does not purge a newer take that replaced the listed object", async () => {
    const prefix = "personalized-story-art/user-1/lesson-recordings/";
    const key = `${prefix}my/lesson-1/scene-0/step-1.audio`;
    const stale = { etag: "etag-a", key, version: "version-a" };
    const newer = {
      customMetadata: { state: "audio", uploadNonce: "upload-b" },
      etag: "etag-b",
      key,
      version: "version-b",
    };
    let current = stale;
    const conditionalWrites = [];
    const deletions = [];
    const bucket = {
      async delete(keys) {
        deletions.push(keys);
        current = null;
      },
      async list(options) {
        assert.deepEqual(options, { prefix });
        const page = { objects: [stale], truncated: false };
        current = newer;
        return page;
      },
      async put(putKey, _value, options) {
        conditionalWrites.push({ key: putKey, options });
        if (options.onlyIf?.etagMatches !== current?.etag) return null;
        current = {
          customMetadata: options.customMetadata,
          etag: "purge-fence",
          key: putKey,
          version: "purge-version",
        };
        return current;
      },
    };

    await storage.deleteAllLessonRecordings(bucket, "user-1");

    assert.strictEqual(current, newer);
    assert.deepEqual(deletions, []);
    assert.equal(conditionalWrites.length, 1);
    assert.deepEqual(conditionalWrites[0].options.onlyIf, {
      etagMatches: stale.etag,
    });
  });

  it("fences every listed object only below the encoded owner prefix", async () => {
    assert.equal(typeof storage.deleteAllLessonRecordings, "function");
    const prefix = "personalized-story-art/user%2Fone/lesson-recordings/";
    const state = pagedBucket(
      new Map([
        [
          "",
          {
            objects: [{ etag: "etag-1", key: `${prefix}my/lesson-1/clip-1.webm` }],
            truncated: true,
            cursor: "page-2",
          },
        ],
        [
          "page-2",
          {
            objects: [{ etag: "etag-2", key: `${prefix}my/lesson-2/clip-2.webm` }],
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
    assert.deepEqual(state.deletions, []);
    assert.deepEqual(state.writes.map(({ key, options }) => ({
      key,
      onlyIf: options.onlyIf,
    })), [
      {
        key: `${prefix}my/lesson-1/clip-1.webm`,
        onlyIf: { etagMatches: "etag-1" },
      },
      {
        key: `${prefix}my/lesson-2/clip-2.webm`,
        onlyIf: { etagMatches: "etag-2" },
      },
    ]);
  });

  it("fences only the exact encoded My Lesson subprefix", async () => {
    assert.equal(typeof storage.deleteLessonRecordingsForLesson, "function");
    const prefix =
      "personalized-story-art/user-1/lesson-recordings/my/lesson%2Fone/";
    const state = pagedBucket(
      new Map([
        [
          "",
          {
            objects: [{ etag: "etag-1", key: `${prefix}clip-1.webm` }],
            truncated: false,
          },
        ],
      ]),
    );

    await storage.deleteLessonRecordingsForLesson(
      state.bucket,
      "user-1",
      "lesson/one",
    );

    assert.deepEqual(state.lists, [{ prefix }]);
    assert.deepEqual(state.deletions, []);
    assert.deepEqual(state.writes.map(({ key, options }) => ({
      key,
      onlyIf: options.onlyIf,
    })), [{
      key: `${prefix}clip-1.webm`,
      onlyIf: { etagMatches: "etag-1" },
    }]);
  });

  it("rejects any key returned outside the requested prefix before fencing", async () => {
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
    assert.deepEqual(state.writes, []);
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
      assert.deepEqual(state.writes, []);
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
    assert.deepEqual(repeated.writes, []);
  });
});
