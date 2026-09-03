import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deleteAllDubs,
  DubNotEnabledError,
  DubResetInProgressError,
  DubTakeRejectedError,
  grantDubConsent,
  getDubLineAudioUrl,
  loadDubStatus,
  saveDubLine,
} from "../src/dubbing/dub-api.ts";

const DUB_ID = "five-little-ducks-v2";

function loadStatus(options = {}) {
  return loadDubStatus({ dubId: DUB_ID, ...options });
}

function saveLine(lineId, blob, options = {}) {
  return saveDubLine(lineId, blob, { dubId: DUB_ID, ...options });
}

function lineAudioUrl(lineId, options = {}) {
  return getDubLineAudioUrl(lineId, { dubId: DUB_ID, ...options });
}

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

function duckStatusLines() {
  return Array.from(
    { length: 24 },
    (_, index) => ({ id: `line-${index + 1}`, recordedAt: null, saved: false }),
  );
}

describe("duck dub browser API", () => {
  it("uses private same-origin requests and encoded line IDs", async () => {
    const controller = new AbortController();
    const status = {
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: "guardian-voice-r2-v2",
      lines: duckStatusLines(),
    };
    const load = requestRecorder(Response.json(status));

    assert.deepEqual(
      await loadStatus({ fetch: load.fetch, signal: controller.signal }),
      status,
    );
    assert.deepEqual(load.calls[0], [
      "/api/dubs/five-little-ducks-v2",
      { credentials: "same-origin", signal: controller.signal },
    ]);

    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
      type: "audio/webm;codecs=opus",
    });
    const saved = { recordedAt: "2026-08-25T10:00:00.000Z" };
    const upload = requestRecorder(Response.json(saved, { status: 201 }));
    assert.deepEqual(
      await saveLine("line/1", blob, {
        fetch: upload.fetch,
        signal: controller.signal,
      }),
      saved,
    );
    assert.deepEqual(upload.calls[0], [
      "/api/dubs/five-little-ducks-v2/lines/line%2F1",
      {
        body: blob,
        credentials: "same-origin",
        headers: {
          "Content-Type": "audio/webm;codecs=opus",
        },
        method: "PUT",
        signal: controller.signal,
      },
    ]);

    const remove = requestRecorder(new Response(null, { status: 204 }));
    assert.equal(
      await deleteAllDubs({ fetch: remove.fetch, signal: controller.signal }),
      undefined,
    );
    assert.deepEqual(remove.calls[0], [
      "/api/dubs",
      {
        credentials: "same-origin",
        method: "DELETE",
        signal: controller.signal,
      },
    ]);

    assert.equal(
      lineAudioUrl("line/1"),
      "/api/dubs/five-little-ducks-v2/lines/line%2F1/audio",
    );
  });

  it("submits the exact guardian consent body", async () => {
    const request = requestRecorder(new Response(null, { status: 204 }));

    await grantDubConsent({ fetch: request.fetch });

    assert.equal(request.calls[0][0], "/api/dubs/consent");
    assert.deepEqual(JSON.parse(request.calls[0][1].body), {
      accepted: true,
      consentVersion: "guardian-voice-r2-v2",
    });
  });

  it("uploads canonical learner waveform metadata with the private clip", async () => {
    const peakBars = Array.from({ length: 32 }, (_, index) => index / 31);
    const saved = {
      lineId: "line-1",
      peakBars: peakBars.map((peak) => Math.round(peak * 255) / 255),
      recordedAt: "2026-08-25T10:00:00.000Z",
    };
    const upload = requestRecorder(Response.json(saved, { status: 201 }));

    assert.deepEqual(
      await saveLine(
        "line-1",
        new Blob(["take"], { type: "audio/webm" }),
        { fetch: upload.fetch, peakBars },
      ),
      saved,
    );
    assert.equal(
      upload.calls[0][1].headers["X-Parrot-Dub-Peak-Bars"],
      JSON.stringify(peakBars.map((peak) => Math.round(peak * 255))),
    );
  });

  it("rejects malformed learner waveform metadata in status and save results", async () => {
    const malformedStatus = {
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: "guardian-voice-r2-v2",
      lines: duckStatusLines().map((line, index) => index === 0
        ? { ...line, peakBars: [1, 2] }
        : line),
    };

    await assert.rejects(
      loadStatus({ fetch: async () => Response.json(malformedStatus) }),
      /Your saved dub could not be loaded/,
    );
    await assert.rejects(
      saveLine("line-1", new Blob(["take"], { type: "audio/webm" }), {
        fetch: async () => Response.json({
          peakBars: [1, 2],
          recordedAt: "2026-08-25T10:00:00.000Z",
        }),
      }),
      /Your take was not saved/,
    );
  });

  it("targets every dub request and audio URL with one exact learner query", async () => {
    const learnerProfileId = "learner /Noah";
    const status = {
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: "guardian-voice-r2-v2",
      lines: duckStatusLines(),
    };
    const load = requestRecorder(Response.json(status));
    const upload = requestRecorder(
      Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }),
    );
    const consent = requestRecorder(new Response(null, { status: 204 }));
    const remove = requestRecorder(new Response(null, { status: 204 }));

    await loadStatus({ fetch: load.fetch, learnerProfileId });
    await saveLine("line/1", new Blob(["take"], { type: "audio/webm" }), {
      fetch: upload.fetch,
      learnerProfileId,
    });
    await grantDubConsent({ fetch: consent.fetch, learnerProfileId });
    await deleteAllDubs({ fetch: remove.fetch, learnerProfileId });

    assert.deepEqual(
      [load, upload, consent, remove].map(({ calls }) => calls[0][0]),
      [
        "/api/dubs/five-little-ducks-v2?learnerProfileId=learner+%2FNoah",
        "/api/dubs/five-little-ducks-v2/lines/line%2F1?learnerProfileId=learner+%2FNoah",
        "/api/dubs/consent?learnerProfileId=learner+%2FNoah",
        "/api/dubs?learnerProfileId=learner+%2FNoah",
      ],
    );
    assert.equal(
      lineAudioUrl("line/1", { learnerProfileId }),
      "/api/dubs/five-little-ducks-v2/lines/line%2F1/audio?learnerProfileId=learner+%2FNoah",
    );
  });

  it("uses an explicit Old MacDonald ID for per-rhyme requests", async () => {
    const dubId = "old-macdonald-v1";
    const lineIds = Array.from(
      { length: 35 },
      (_, index) => `old-macdonald-v1-line-${index + 1}`,
    );
    const lineId = lineIds[0];
    const status = {
      consentState: "granted",
      dubId,
      guardianConsentVersion: "guardian-voice-r2-v2",
      lines: lineIds.map((id) => ({ id, recordedAt: null, saved: false })),
    };
    const load = requestRecorder(Response.json(status));
    const upload = requestRecorder(
      Response.json({ recordedAt: "2026-08-25T10:00:00.000Z" }, { status: 201 }),
    );
    const consent = requestRecorder(new Response(null, { status: 204 }));
    const remove = requestRecorder(new Response(null, { status: 204 }));
    const take = new Blob(["take"], { type: "audio/webm" });

    assert.deepEqual(
      await loadStatus({ dubId, fetch: load.fetch }),
      status,
    );
    assert.deepEqual(
      await saveLine(lineId, take, { dubId, fetch: upload.fetch }),
      { recordedAt: "2026-08-25T10:00:00.000Z" },
    );
    await grantDubConsent({ fetch: consent.fetch });
    assert.equal(await deleteAllDubs({ fetch: remove.fetch }), undefined);

    assert.deepEqual(
      [load, upload, consent, remove].map(({ calls }) => calls[0][0]),
      [
        "/api/dubs/old-macdonald-v1",
        "/api/dubs/old-macdonald-v1/lines/old-macdonald-v1-line-1",
        "/api/dubs/consent",
        "/api/dubs",
      ],
    );
    assert.equal(
      lineAudioUrl(lineId, { dubId }),
      "/api/dubs/old-macdonald-v1/lines/old-macdonald-v1-line-1/audio",
    );
    assert.equal(
      lineAudioUrl("line-1"),
      "/api/dubs/five-little-ducks-v2/lines/line-1/audio",
    );
  });

  it("rejects Old MacDonald status payloads that are truncated, duplicated, or reordered", async () => {
    const dubId = "old-macdonald-v1";
    const ordered = Array.from(
      { length: 35 },
      (_, index) => `old-macdonald-v1-line-${index + 1}`,
    ).map((id) => ({ id, recordedAt: null, saved: false }));
    const malformedStatuses = [
      {
        consentState: "granted",
        dubId,
        guardianConsentVersion: "guardian-voice-r2-v2",
        lines: ordered.slice(0, 34),
      },
      {
        consentState: "granted",
        dubId,
        guardianConsentVersion: "guardian-voice-r2-v2",
        lines: [ordered[1], ordered[0], ...ordered.slice(2)],
      },
      {
        consentState: "granted",
        dubId,
        guardianConsentVersion: "guardian-voice-r2-v2",
        lines: [...ordered.slice(0, 34), ordered[0]],
      },
    ];

    for (const status of malformedStatuses) {
      await assert.rejects(
        () => loadStatus({ dubId, fetch: async () => Response.json(status) }),
        /Your saved dub could not be loaded\./,
      );
    }
  });

  it("rejects a complete status payload for the other supported rhyme", async () => {
    const duckStatus = {
      consentState: "granted",
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: "guardian-voice-r2-v2",
      lines: duckStatusLines(),
    };
    const oldMacDonaldStatus = {
      ...duckStatus,
      dubId: "old-macdonald-v1",
      lines: Array.from(
        { length: 35 },
        (_, index) => ({
          id: `old-macdonald-v1-line-${index + 1}`,
          recordedAt: null,
          saved: false,
        }),
      ),
    };

    await assert.rejects(
      () => loadStatus({
        dubId: "old-macdonald-v1",
        fetch: async () => Response.json(duckStatus),
      }),
      /Your saved dub could not be loaded\./,
    );
    await assert.rejects(
      () => loadStatus({
        fetch: async () => Response.json(oldMacDonaldStatus),
      }),
      /Your saved dub could not be loaded\./,
    );
  });

  it("notifies guardian access only for guardian-required failures before rejection", async () => {
    const previousDocument = globalThis.document;
    const eventTarget = new globalThis.EventTarget();
    const events = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: eventTarget,
    });
    eventTarget.addEventListener("guardian-access-required", () => events.push("notification"));

    try {
      const expectRejection = async (operation, message, expectedEvents) => {
        await assert.rejects(operation, (error) => {
          events.push("rejection");
          assert.equal(error.message, message);
          return true;
        });
        assert.deepEqual(events, expectedEvents);
        events.length = 0;
      };

      const guardianRequired = () =>
        Response.json({ error: "guardian_required" }, { status: 403 });
      await expectRejection(
        () => loadStatus({ fetch: async () => guardianRequired() }),
        "Your saved dub could not be loaded.",
        ["notification", "rejection"],
      );
      await expectRejection(
        () =>
          saveLine("line-1", new Blob(["take"]), {
            fetch: async () => guardianRequired(),
          }),
        "Your take was not saved. Try again.",
        ["notification", "rejection"],
      );
      await expectRejection(
        () => grantDubConsent({ fetch: async () => guardianRequired() }),
        "Voice dubbing could not be turned on.",
        ["notification", "rejection"],
      );
      await expectRejection(
        () => deleteAllDubs({ fetch: async () => guardianRequired() }),
        "Your saved nursery-rhyme voice clips were not deleted.",
        ["notification", "rejection"],
      );

      await expectRejection(
        () => grantDubConsent({
          fetch: async () =>
            Response.json({ error: "dubbing_not_enabled" }, { status: 403 }),
        }),
        "Voice dubbing could not be turned on.",
        ["rejection"],
      );
      await expectRejection(
        () => deleteAllDubs({
          fetch: async () => new Response("not json", { status: 403 }),
        }),
        "Your saved nursery-rhyme voice clips were not deleted.",
        ["rejection"],
      );
      await expectRejection(
        () => grantDubConsent({
          fetch: async () =>
            Response.json({ error: "guardian_required" }, { status: 500 }),
        }),
        "Voice dubbing could not be turned on.",
        ["rejection"],
      );
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
      else Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it("maps a revoked upload to DubNotEnabledError", async () => {
    for (const [status, error] of [
      [403, "dubbing_not_enabled"],
      [409, "dub_consent_revoking"],
    ]) {
      await assert.rejects(
        () => saveLine("line-1", new Blob(["take"]), {
          fetch: async () => Response.json({ error }, { status }),
        }),
        DubNotEnabledError,
      );
    }
  });

  it("turns guarded API failures into child-friendly errors", async () => {
    const failingFetch = async () => new Response(null, { status: 500 });

    await assert.rejects(
      loadStatus({ fetch: failingFetch }),
      /Your saved dub could not be loaded\./,
    );
    await assert.rejects(
      saveLine("line-1", new Blob(["take"], { type: "audio/webm" }), {
        fetch: failingFetch,
      }),
      /Your take was not saved\. Try again\./,
    );
    await assert.rejects(
      deleteAllDubs({ fetch: failingFetch }),
      /Your saved nursery-rhyme voice clips were not deleted\./,
    );
  });

  it("sanitizes rejected transports and malformed success payloads", async () => {
    const transportDetail = "Network stack exposed: socket 17";
    const rejectedFetch = async () => {
      throw new TypeError(transportDetail);
    };
    const take = new Blob(["take"], { type: "audio/webm" });

    for (const [operation, message] of [
      [() => loadStatus({ fetch: rejectedFetch }), "Your saved dub could not be loaded."],
      [() => saveLine("line-1", take, { fetch: rejectedFetch }), "Your take was not saved. Try again."],
      [
        () => deleteAllDubs({ fetch: rejectedFetch }),
        "Your saved nursery-rhyme voice clips were not deleted.",
      ],
      [
        () => loadStatus({ fetch: async () => Response.json({}) }),
        "Your saved dub could not be loaded.",
      ],
      [
        () => saveLine("line-1", take, { fetch: async () => Response.json({}) }),
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
      () => loadStatus({ fetch: rejectedFetch }),
      () => saveLine("line-1", new Blob(["take"]), { fetch: rejectedFetch }),
      () => deleteAllDubs({ fetch: rejectedFetch }),
    ]) {
      await assert.rejects(operation, (error) => error === abort);
    }
  });

  it("types an interrupted reset without exposing server details", async () => {
    await assert.rejects(
      loadStatus({
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
      loadStatus({
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
      saveLine("line-1", new Blob(["long take"]), {
        fetch: async () => new Response(null, { status: 413 }),
      }),
      (error) => {
        assert.ok(error instanceof DubTakeRejectedError);
        assert.equal(error.code, "dub_take_rejected");
        assert.equal(error.message, "That recording is too long. Try the line again.");
        return true;
      },
    );
  });

  it("asks for a new take when the server rejects the recorded audio", async () => {
    for (const [status, code] of [
      [400, "audio_required"],
      [415, "unsupported_audio"],
    ]) {
      await assert.rejects(
        saveLine("line-1", new Blob(["bad take"]), {
          fetch: async () =>
            Response.json(
              { error: code, message: `TECHNICAL ${code} detail` },
              { status },
            ),
        }),
        (error) => {
          assert.ok(error instanceof DubTakeRejectedError);
          assert.equal(error.code, "dub_take_rejected");
          assert.equal(
            error.message,
            "That recording did not work. Record the line again.",
          );
          assert.doesNotMatch(error.message, /technical|audio_required|unsupported_audio/i);
          return true;
        },
      );
    }
  });
});
