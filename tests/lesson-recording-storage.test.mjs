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
      customMetadata: {
        consentGeneration: "2",
        state: "audio",
        uploadNonce: "upload-b",
      },
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
      async head() {
        return current;
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

    await storage.deleteAllLessonRecordings(bucket, "user-1", 2, async () => {});

    assert.strictEqual(current, newer);
    assert.deepEqual(deletions, []);
    assert.equal(conditionalWrites.length, 1);
    assert.deepEqual(conditionalWrites[0].options.onlyIf, {
      etagMatches: stale.etag,
    });
  });

  it("fences an older-generation take that replaces a listed object", async () => {
    const prefix = "personalized-story-art/user-1/lesson-recordings/";
    const key = `${prefix}parrot/lesson-1/scene-0/step-1.audio`;
    const listed = {
      customMetadata: { consentGeneration: "0", state: "audio" },
      etag: "listed-etag",
      key,
      version: "listed-version",
    };
    const replacement = {
      customMetadata: { consentGeneration: "0", state: "audio" },
      etag: "replacement-etag",
      key,
      version: "replacement-version",
    };
    let current = listed;
    const writes = [];
    const bucket = {
      async head() { return current; },
      async list() { return { objects: [listed], truncated: false }; },
      async put(putKey, _value, options) {
        writes.push({ key: putKey, options });
        if (writes.length === 1) {
          current = replacement;
          return null;
        }
        assert.equal(options.onlyIf.etagMatches, replacement.etag);
        current = {
          customMetadata: options.customMetadata,
          etag: "purge-etag",
          key: putKey,
          version: "purge-version",
        };
        return current;
      },
    };

    await storage.deleteAllLessonRecordings(bucket, "user-1", 1, async () => {});

    assert.equal(writes.length, 2);
    assert.equal(current.customMetadata.state, "purged");
    assert.equal(current.customMetadata.invalidatedVersion, replacement.version);
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

    await storage.deleteAllLessonRecordings(state.bucket, "user/one", 1, async () => {});

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
      1,
      async () => {},
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
      storage.deleteAllLessonRecordings(state.bucket, "user-1", 1, async () => {}),
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
        storage.deleteAllLessonRecordings(state.bucket, "user-1", 1, async () => {}),
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
      storage.deleteAllLessonRecordings(repeated.bucket, "user-1", 1, async () => {}),
      /did not advance its cursor/i,
    );
    assert.deepEqual(repeated.deletions, []);
    assert.deepEqual(repeated.writes, []);
  });

  it("keeps re-consented takes that already exist when revocation cleanup lists", async () => {
    const prefix = "personalized-story-art/user-1/lesson-recordings/";
    const old = {
      customMetadata: { consentGeneration: "1", state: "audio" },
      etag: "old-etag",
      key: `${prefix}parrot/lesson-1/old.audio`,
      version: "old-version",
    };
    const reconsented = {
      customMetadata: { consentGeneration: "3", state: "audio" },
      etag: "new-etag",
      key: `${prefix}parrot/lesson-1/new.audio`,
      version: "new-version",
    };
    const accountFence = {
      customMetadata: { state: "account-deleting" },
      etag: "account-etag",
      key: `${prefix}parrot/lesson-1/account.audio`,
      version: "account-version",
    };
    const writes = [];
    const bucket = {
      async list() {
        return { objects: [old, reconsented, accountFence], truncated: false };
      },
      async put(key, _value, options) {
        writes.push({ key, options });
        return { etag: `fence-${writes.length}`, key };
      },
    };

    await storage.deleteAllLessonRecordings(bucket, "user-1", 2, async () => {});

    assert.deepEqual(writes.map(({ key }) => key), [old.key]);
  });

  it("keeps new-revision takes that already exist when lesson cleanup lists", async () => {
    const prefix =
      "personalized-story-art/user-1/lesson-recordings/my/lesson-1/";
    const old = {
      customMetadata: { lessonGeneration: "0", state: "audio" },
      etag: "old-etag",
      key: `${prefix}old.audio`,
      version: "old-version",
    };
    const edited = {
      customMetadata: { lessonGeneration: "1", state: "audio" },
      etag: "edited-etag",
      key: `${prefix}edited.audio`,
      version: "edited-version",
    };
    const writes = [];
    const bucket = {
      async list() {
        return { objects: [old, edited], truncated: false };
      },
      async put(key, _value, options) {
        writes.push({ key, options });
        return { etag: `fence-${writes.length}`, key };
      },
    };

    await storage.deleteLessonRecordingsForLesson(
      bucket,
      "user-1",
      "lesson-1",
      1,
      async () => {},
    );

    assert.deepEqual(writes.map(({ key }) => key), [old.key]);
  });

  it("retries transient purge listing and conditional fences with bounded pacing", async () => {
    const prefix = "personalized-story-art/user-1/lesson-recordings/";
    const object = {
      etag: "old-etag",
      key: `${prefix}legacy.audio`,
      version: "old-version",
    };
    let listAttempts = 0;
    let putAttempts = 0;
    const waits = [];
    const bucket = {
      async list() {
        listAttempts += 1;
        if (listAttempts === 1) throw new Error("list: TooManyRequests (10058)");
        return { objects: [object], truncated: false };
      },
      async put(key) {
        putAttempts += 1;
        if (putAttempts === 1) throw new Error("put: TooManyRequests (10058)");
        return { etag: "fence", key };
      },
    };

    await storage.deleteAllLessonRecordings(bucket, "user-1", 1, async (delay) => {
      waits.push(delay);
    });

    assert.equal(listAttempts, 2);
    assert.equal(putAttempts, 2);
    assert.equal(waits.length, 2);
    assert.equal(waits.every((delay) => delay >= 1_000), true);
  });

  it("retries a transient head while fencing the exact uploaded take", async () => {
    const key = "lesson.audio";
    const stored = {
      customMetadata: { state: "audio", uploadNonce: "upload-1" },
      etag: "audio-etag",
      key,
      version: "audio-version",
    };
    let headAttempts = 0;
    const waits = [];
    const bucket = {
      async head() {
        headAttempts += 1;
        if (headAttempts === 1) throw new Error("head: TooManyRequests (10058)");
        return stored;
      },
      async put(putKey) {
        return { etag: "fence", key: putKey };
      },
    };

    await storage.fenceLessonRecordingUpload(
      bucket,
      key,
      stored,
      "upload-1",
      "consent-revoked",
      async (delay) => { waits.push(delay); },
    );

    assert.equal(headAttempts, 2);
    assert.equal(waits.length, 1);
  });
});
