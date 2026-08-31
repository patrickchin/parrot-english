import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCustomLessonRecordingKey,
  runPurgeCustomLessonRecordings,
} from "../scripts/purge-custom-lesson-recordings.mjs";

const accountId = "account id";
const apiToken = "test token";
const bucket = "lesson bucket";

const accountRecording =
  "personalized-story-art/account/lesson-recordings/my/a/scene-0/step 0?.audio";
const learnerRecording =
  "personalized-story-art/account/learners/learner/lesson-recordings/my/a/scene-0/step-0.audio";
const parrotRecording =
  "personalized-story-art/account/learners/learner/lesson-recordings/parrot/a/scene-0/step-0.audio";
const storyArt = "personalized-story-art/account/stories/my/cover.webp";

function cloudflareResponse(result, { status = 200, success = true } = {}) {
  return Response.json(
    { errors: [], messages: [], result, success },
    { status },
  );
}

function listPage(keys, { cursor, truncated }, responseOptions) {
  return cloudflareResponse(
    {
      cursor,
      objects: keys.map((key) => ({ key })),
      truncated,
    },
    responseOptions,
  );
}

function commandOptions(overrides = {}) {
  return {
    accountId,
    apiToken,
    bucket,
    ...overrides,
  };
}

describe("custom lesson recording purge", () => {
  it("matches only complete legacy and learner custom-recording key shapes", () => {
    for (const key of [
      "personalized-story-art/user/lesson-recordings/my/a/scene-0/step-0.audio",
      "personalized-story-art/user/learners/learner/lesson-recordings/my/a/scene-0/step-0.audio",
    ]) {
      assert.equal(isCustomLessonRecordingKey(key), true, key);
    }

    for (const key of [
      "personalized-story-art/user/lesson-recordings/parrot/a/scene-0/step-0.audio",
      "personalized-story-art/user/learners/learner/lesson-recordings/parrot/a/scene-0/step-0.audio",
      "personalized-story-art/user/lesson-recordings/my",
      "personalized-story-art/user/lesson-recordings/my/",
      "personalized-story-art/user/lesson-recordings/my/../../story-art.webp",
      "personalized-story-art/../lesson-recordings/my/a/scene-0/step-0.audio",
      "personalized-story-art/user/lesson-recordings/myish/a/scene-0/step-0.audio",
      "personalized-story-art/user/learners//lesson-recordings/my/a/scene-0/step-0.audio",
      "personalized-story-art/user/learners/learner/lesson-recordings/my",
      "personalized-story-art/user/stories/my/cover.webp",
      "other-prefix/user/lesson-recordings/my/a/scene-0/step-0.audio",
      null,
    ]) {
      assert.equal(isCustomLessonRecordingKey(key), false, String(key));
    }
  });

  it("dry-runs every list page, reports only exact keys, and never deletes", async () => {
    const calls = [];
    let output = "";
    const fetch = async (input, init = {}) => {
      const url = new URL(input);
      calls.push({ init, url });
      assert.equal(init.method, "GET");

      if (url.searchParams.get("cursor") === null) {
        return listPage([accountRecording, parrotRecording], {
          cursor: "second page",
          truncated: true,
        });
      }
      assert.equal(url.searchParams.get("cursor"), "second page");
      return listPage([learnerRecording, storyArt], { truncated: false });
    };

    const result = await runPurgeCustomLessonRecordings(
      commandOptions({
        fetch,
        writeOutput: (value) => {
          output += value;
        },
      }),
    );

    assert.deepEqual(result, {
      deleted: [],
      keys: [accountRecording, learnerRecording],
      verified: false,
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map(({ url }) => url.searchParams.get("cursor")),
      [null, "second page"],
    );
    for (const { init, url } of calls) {
      assert.equal(url.pathname, "/client/v4/accounts/account%20id/r2/buckets/lesson%20bucket/objects");
      assert.equal(url.searchParams.get("prefix"), "personalized-story-art/");
      assert.equal(url.searchParams.get("per_page"), "1000");
      assert.equal(init.headers.Authorization, "Bearer test token");
    }
    assert.match(output, /Dry run: found 2 exact custom lesson recording keys\./);
    assert.match(output, new RegExp(accountRecording.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(output, new RegExp(learnerRecording.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(output, /parrot/);
    assert.doesNotMatch(output, /stories\/my/);
  });

  it("treats a truthy non-boolean execute value as a dry run", async () => {
    const calls = [];
    let listRequests = 0;
    const fetch = async (input, init = {}) => {
      calls.push({ init, url: new URL(input) });
      if (init.method === "DELETE") return cloudflareResponse({});

      listRequests += 1;
      return listPage(listRequests === 1 ? [accountRecording] : [], {
        truncated: false,
      });
    };

    const result = await runPurgeCustomLessonRecordings(
      commandOptions({ execute: "false", fetch, writeOutput() {} }),
    );

    assert.deepEqual(result, {
      deleted: [],
      keys: [accountRecording],
      verified: false,
    });
    assert.equal(
      calls.filter(({ init }) => init.method === "DELETE").length,
      0,
    );
  });

  it("deletes exact keys sequentially and verifies a fresh empty scan", async () => {
    const calls = [];
    let listRequests = 0;
    let releaseFirstDelete;
    let firstDeleteStarted;
    const firstDeleteDone = new Promise((resolve) => {
      releaseFirstDelete = resolve;
    });
    const firstDeleteHasStarted = new Promise((resolve) => {
      firstDeleteStarted = resolve;
    });
    const fetch = async (input, init = {}) => {
      const url = new URL(input);
      calls.push({ init, url });
      if (init.method === "GET") {
        listRequests += 1;
        if (listRequests === 1) {
          return listPage([accountRecording], {
            cursor: "next",
            truncated: true,
          });
        }
        if (listRequests === 2) {
          assert.equal(url.searchParams.get("cursor"), "next");
          return listPage([learnerRecording, parrotRecording], { truncated: false });
        }
        assert.equal(url.searchParams.get("cursor"), null);
        return listPage([], { truncated: false });
      }

      assert.equal(init.method, "DELETE");
      if (calls.filter(({ init: callInit }) => callInit.method === "DELETE").length === 1) {
        firstDeleteStarted();
        await firstDeleteDone;
      }
      return cloudflareResponse({});
    };

    const purge = runPurgeCustomLessonRecordings(
      commandOptions({ execute: true, fetch, writeOutput() {} }),
    );
    await firstDeleteHasStarted;
    assert.deepEqual(
      calls
        .filter(({ init }) => init.method === "DELETE")
        .map(({ url }) => url.pathname),
      [
        "/client/v4/accounts/account%20id/r2/buckets/lesson%20bucket/objects/personalized-story-art/account/lesson-recordings/my/a/scene-0/step%200%3F.audio",
      ],
    );
    releaseFirstDelete();

    const result = await purge;
    assert.deepEqual(result, {
      deleted: [accountRecording, learnerRecording],
      keys: [accountRecording, learnerRecording],
      verified: true,
    });
    assert.deepEqual(
      calls
        .filter(({ init }) => init.method === "DELETE")
        .map(({ url }) => url.pathname),
      [
        "/client/v4/accounts/account%20id/r2/buckets/lesson%20bucket/objects/personalized-story-art/account/lesson-recordings/my/a/scene-0/step%200%3F.audio",
        "/client/v4/accounts/account%20id/r2/buckets/lesson%20bucket/objects/personalized-story-art/account/learners/learner/lesson-recordings/my/a/scene-0/step-0.audio",
      ],
    );
    assert.equal(listRequests, 3);
  });

  it("aborts a repeated listing cursor before any delete", async () => {
    const calls = [];
    const fetch = async (input, init = {}) => {
      const url = new URL(input);
      calls.push({ init, url });
      assert.equal(init.method, "GET");
      return listPage([accountRecording], { cursor: "same", truncated: true });
    };

    await assert.rejects(
      runPurgeCustomLessonRecordings(
        commandOptions({ execute: true, fetch, writeOutput() {} }),
      ),
      /did not advance/,
    );
    assert.equal(calls.length, 2);
    assert.equal(
      calls.filter(({ init }) => init.method === "DELETE").length,
      0,
    );
  });

  it("aborts a truncated page without a next cursor before any delete", async () => {
    const calls = [];
    const fetch = async (input, init = {}) => {
      calls.push({ init, url: new URL(input) });
      return listPage([accountRecording], { truncated: true });
    };

    await assert.rejects(
      runPurgeCustomLessonRecordings(
        commandOptions({ execute: true, fetch, writeOutput() {} }),
      ),
      /next cursor/,
    );
    assert.equal(
      calls.filter(({ init }) => init.method === "DELETE").length,
      0,
    );
  });

  it("rejects unsuccessful HTTP and API envelopes", async () => {
    await assert.rejects(
      runPurgeCustomLessonRecordings(
        commandOptions({
          fetch: async () => listPage([], { truncated: false }, { status: 503 }),
          writeOutput() {},
        }),
      ),
      /HTTP 503/,
    );

    await assert.rejects(
      runPurgeCustomLessonRecordings(
        commandOptions({
          fetch: async () => cloudflareResponse({ objects: [], truncated: false }, { success: false }),
          writeOutput() {},
        }),
      ),
      /unsuccessful envelope/,
    );
  });

  it("shows help without credentials or a scan", async () => {
    let output = "";
    const result = await runPurgeCustomLessonRecordings({
      argv: ["--help"],
      env: {},
      fetch: async () => {
        assert.fail("help must not call Cloudflare");
      },
      writeOutput: (value) => {
        output += value;
      },
    });

    assert.deepEqual(result, { help: true });
    assert.match(output, /--bucket <name>/);
    assert.match(output, /--execute/);
  });

  it("does not echo a credential-like unknown argument", async () => {
    await assert.rejects(
      runPurgeCustomLessonRecordings({
        argv: ["super-secret-token"],
        env: {},
        writeOutput() {},
      }),
      (error) => {
        assert.doesNotMatch(error.message, /super-secret-token/);
        return true;
      },
    );
  });
});
