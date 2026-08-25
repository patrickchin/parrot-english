import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deleteDub,
  DubResetInProgressError,
  getDubLineAudioUrl,
  loadDubStatus,
  saveDubLine,
} from "../src/dubbing/dub-api.ts";

function requestRecorder(response) {
  const calls = [];
  return {
    calls,
    async fetch(...args) {
      calls.push(args);
      return response;
    },
  };
}

describe("duck dub browser API", () => {
  it("uses private same-origin requests and encoded line IDs", async () => {
    const controller = new AbortController();
    const status = {
      complete: false,
      dubId: "five-little-ducks-v1",
      guardianConsentVersion: "guardian-voice-r2-v1",
      lines: [
        { id: "line-1", recordedAt: null, saved: false },
      ],
    };
    const load = requestRecorder(Response.json(status));

    assert.deepEqual(
      await loadDubStatus({ fetch: load.fetch, signal: controller.signal }),
      status,
    );
    assert.deepEqual(load.calls[0], [
      "/api/dubs/five-little-ducks-v1",
      { credentials: "same-origin", signal: controller.signal },
    ]);

    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
      type: "audio/webm;codecs=opus",
    });
    const saved = { recordedAt: "2026-08-25T10:00:00.000Z" };
    const upload = requestRecorder(Response.json(saved, { status: 201 }));
    assert.deepEqual(
      await saveDubLine("line/1", blob, {
        fetch: upload.fetch,
        signal: controller.signal,
      }),
      saved,
    );
    assert.deepEqual(upload.calls[0], [
      "/api/dubs/five-little-ducks-v1/lines/line%2F1",
      {
        body: blob,
        credentials: "same-origin",
        headers: {
          "Content-Type": "audio/webm;codecs=opus",
          "X-Parrot-Guardian-Consent-Version": "guardian-voice-r2-v1",
        },
        method: "PUT",
        signal: controller.signal,
      },
    ]);

    const remove = requestRecorder(new Response(null, { status: 204 }));
    assert.equal(
      await deleteDub({ fetch: remove.fetch, signal: controller.signal }),
      undefined,
    );
    assert.deepEqual(remove.calls[0], [
      "/api/dubs/five-little-ducks-v1",
      {
        credentials: "same-origin",
        method: "DELETE",
        signal: controller.signal,
      },
    ]);

    assert.equal(
      getDubLineAudioUrl("line/1"),
      "/api/dubs/five-little-ducks-v1/lines/line%2F1/audio",
    );
  });

  it("turns guarded API failures into child-friendly errors", async () => {
    const failingFetch = async () => new Response(null, { status: 500 });

    await assert.rejects(
      loadDubStatus({ fetch: failingFetch }),
      /Your saved dub could not be loaded\./,
    );
    await assert.rejects(
      saveDubLine("line-1", new Blob(["take"], { type: "audio/webm" }), {
        fetch: failingFetch,
      }),
      /Your take was not saved\. Try again\./,
    );
    await assert.rejects(
      deleteDub({ fetch: failingFetch }),
      /Your saved dub was not deleted\./,
    );
  });

  it("sanitizes rejected transports and malformed success payloads", async () => {
    const transportDetail = "Network stack exposed: socket 17";
    const rejectedFetch = async () => {
      throw new TypeError(transportDetail);
    };
    const take = new Blob(["take"], { type: "audio/webm" });

    for (const [operation, message] of [
      [() => loadDubStatus({ fetch: rejectedFetch }), "Your saved dub could not be loaded."],
      [() => saveDubLine("line-1", take, { fetch: rejectedFetch }), "Your take was not saved. Try again."],
      [() => deleteDub({ fetch: rejectedFetch }), "Your saved dub was not deleted."],
      [
        () => loadDubStatus({ fetch: async () => Response.json({}) }),
        "Your saved dub could not be loaded.",
      ],
      [
        () => saveDubLine("line-1", take, { fetch: async () => Response.json({}) }),
        "Your take was not saved. Try again.",
      ],
    ]) {
      await assert.rejects(operation, (error) => {
        assert.equal(error.message, message);
        assert.doesNotMatch(error.message, /socket|stack|17/i);
        return true;
      });
    }
  });

  it("preserves request cancellation as AbortError", async () => {
    const abort = new Error("cancelled by caller");
    abort.name = "AbortError";
    const rejectedFetch = async () => {
      throw abort;
    };

    for (const operation of [
      () => loadDubStatus({ fetch: rejectedFetch }),
      () => saveDubLine("line-1", new Blob(["take"]), { fetch: rejectedFetch }),
      () => deleteDub({ fetch: rejectedFetch }),
    ]) {
      await assert.rejects(operation, (error) => error === abort);
    }
  });

  it("types an interrupted reset without exposing server details", async () => {
    await assert.rejects(
      loadDubStatus({
        fetch: async () =>
          Response.json(
            {
              error: "dub_reset_in_progress",
              message: "TECHNICAL marker generation reset-17 is deleting",
            },
            { status: 409 },
          ),
      }),
      (error) => {
        assert.ok(error instanceof DubResetInProgressError);
        assert.equal(error.code, "dub_reset_in_progress");
        assert.equal(
          error.message,
          "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
        );
        assert.doesNotMatch(error.message, /marker|generation|reset-17/i);
        return true;
      },
    );

    await assert.rejects(
      loadDubStatus({
        fetch: async () =>
          Response.json(
            { error: "account_deletion_pending" },
            { status: 409 },
          ),
      }),
      (error) => {
        assert.ok(!(error instanceof DubResetInProgressError));
        assert.equal(error.message, "Your saved dub could not be loaded.");
        return true;
      },
    );
  });

  it("explains when an uploaded take is too long", async () => {
    await assert.rejects(
      saveDubLine("line-1", new Blob(["long take"]), {
        fetch: async () => new Response(null, { status: 413 }),
      }),
      /That recording is too long\. Try the line again\./,
    );
  });
});
