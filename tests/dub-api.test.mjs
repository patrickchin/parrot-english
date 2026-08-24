import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deleteDub,
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

  it("explains when an uploaded take is too long", async () => {
    await assert.rejects(
      saveDubLine("line-1", new Blob(["long take"]), {
        fetch: async () => new Response(null, { status: 413 }),
      }),
      /That recording is too long\. Try the line again\./,
    );
  });
});
