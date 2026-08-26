import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LessonRecordingApiError,
  loadLessonRecordingConsent,
  saveLessonRecording,
} from "../src/lessons/lesson-recording-api.ts";

const SLOT = {
  source: "parrot",
  lessonId: "01-peppas-high-ball",
  sceneIndex: 0,
  stepIndex: 2,
};
const MY_LESSON_REVISION = "a".repeat(64);

function responseFetch(payload, status = 200) {
  const calls = [];
  return {
    calls,
    async fetch(...args) {
      calls.push(args);
      return Response.json(payload, { status });
    },
  };
}

describe("lesson recording browser API", () => {
  it("loads the authenticated persisted consent state", async () => {
    const request = responseFetch({ enabled: true });

    assert.deepEqual(
      await loadLessonRecordingConsent({ fetch: request.fetch }),
      { enabled: true },
    );
    assert.deepEqual(request.calls[0], [
      "/api/lesson-recordings/consent",
      { method: "GET", signal: undefined },
    ]);
  });

  it("puts the original recorder blob into the encoded lesson slot", async () => {
    const request = responseFetch(
      { recordedAt: "2026-08-26T08:00:00.000Z" },
      201,
    );
    const blob = new Blob(
      [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])],
      { type: "audio/webm;codecs=opus" },
    );

    assert.deepEqual(
      await saveLessonRecording(blob, SLOT, {
        expectedLearnerProfileId: "profile-1",
        fetch: request.fetch,
      }),
      {
        recordedAt: "2026-08-26T08:00:00.000Z",
        saved: true,
      },
    );
    assert.equal(
      request.calls[0][0],
      "/api/lesson-recordings/parrot/01-peppas-high-ball/scenes/0/steps/2",
    );
    assert.deepEqual(request.calls[0][1], {
      body: blob,
      headers: {
        "Content-Type": "audio/webm;codecs=opus",
        "X-Parrot-Expected-Learner-Profile": "profile-1",
      },
      method: "PUT",
      signal: undefined,
    });
    assert.strictEqual(request.calls[0][1].body, blob);
  });

  it("rejects an invalid expected learner profile before making a request", async () => {
    const request = responseFetch(
      { recordedAt: "2026-08-26T08:00:00.000Z" },
      201,
    );

    for (const expectedLearnerProfileId of [
      "",
      " profile-1 ",
      "p".repeat(129),
    ]) {
      await assert.rejects(
        saveLessonRecording(
          new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
            type: "audio/webm",
          }),
          SLOT,
          { expectedLearnerProfileId, fetch: request.fetch },
        ),
        (error) => {
          assert.ok(error instanceof LessonRecordingApiError);
          assert.equal(error.code, "invalid_expected_learner_profile");
          return true;
        },
      );
    }
    assert.equal(request.calls.length, 0);
  });

  it("encodes a My Lesson ID without sending target or user metadata", async () => {
    const request = responseFetch(
      { recordedAt: "2026-08-26T08:00:00.000Z" },
      201,
    );
    const blob = new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], {
      type: "audio/ogg",
    });

    await saveLessonRecording(
      blob,
      {
        ...SLOT,
        source: "my",
        lessonId: "lesson/one",
        lessonRevision: MY_LESSON_REVISION,
      },
      {
        expectedLearnerProfileId: "profile-1",
        fetch: request.fetch,
      },
    );

    assert.equal(
      request.calls[0][0],
      "/api/lesson-recordings/my/lesson%2Fone/scenes/0/steps/2",
    );
    assert.deepEqual(request.calls[0][1].headers, {
      "Content-Type": "audio/ogg",
      "X-Parrot-Expected-Learner-Profile": "profile-1",
      "X-Parrot-Lesson-Revision": MY_LESSON_REVISION,
    });
  });

  it("turns revoked consent into a resolved disabled-recording result", async () => {
    const request = responseFetch(
      { error: "guardian_consent_required" },
      403,
    );

    assert.deepEqual(
      await saveLessonRecording(
        new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
          type: "audio/webm",
        }),
        SLOT,
        {
          expectedLearnerProfileId: "profile-1",
          fetch: request.fetch,
        },
      ),
      { reason: "recording_disabled", saved: false },
    );
  });

  it("turns pending account deletion into a resolved disabled-recording result", async () => {
    const request = responseFetch(
      { error: "account_deletion_pending" },
      409,
    );

    assert.deepEqual(
      await saveLessonRecording(
        new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
          type: "audio/webm",
        }),
        SLOT,
        {
          expectedLearnerProfileId: "profile-1",
          fetch: request.fetch,
        },
      ),
      { reason: "recording_disabled", saved: false },
    );
  });

  it("turns a changed My Lesson into a terminal stale-lesson result", async () => {
    const request = responseFetch({ error: "lesson_changed" }, 409);

    assert.deepEqual(
      await saveLessonRecording(
        new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
          type: "audio/webm",
        }),
        {
          ...SLOT,
          lessonId: "lesson-1",
          lessonRevision: MY_LESSON_REVISION,
          source: "my",
        },
        {
          expectedLearnerProfileId: "profile-1",
          fetch: request.fetch,
        },
      ),
      { reason: "lesson_changed", saved: false },
    );
  });

  it("turns a changed learner selection into a terminal stale-profile result", async () => {
    const request = responseFetch(
      { error: "learner_selection_changed" },
      409,
    );

    assert.deepEqual(
      await saveLessonRecording(
        new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
          type: "audio/webm",
        }),
        SLOT,
        {
          expectedLearnerProfileId: "profile-1",
          fetch: request.fetch,
        },
      ),
      { reason: "learner_selection_changed", saved: false },
    );
  });

  it("keeps other upload failures typed for the save queue", async () => {
    const request = responseFetch(
      { error: "unsupported_audio", message: "Unsupported recording." },
      415,
    );

    await assert.rejects(
      saveLessonRecording(
        new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        SLOT,
        {
          expectedLearnerProfileId: "profile-1",
          fetch: request.fetch,
        },
      ),
      (error) => {
        assert.ok(error instanceof LessonRecordingApiError);
        assert.equal(error.status, 415);
        assert.equal(error.code, "unsupported_audio");
        assert.equal(error.message, "Unsupported recording.");
        return true;
      },
    );
  });
});
