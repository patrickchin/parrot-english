import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as speechRecorder from "../src/media/speech-recorder.ts";

const startSpeechRecording =
  speechRecorder.startSpeechRecording ??
  (() => Promise.reject(new Error("startSpeechRecording is missing")));
const recordSpeechClip =
  speechRecorder.recordSpeechClip ??
  (() => Promise.reject(new Error("recordSpeechClip is missing")));

describe("recording MIME negotiation", () => {
  it("selects the first supported portable recording type", () => {
    class FakeRecorder {}
    FakeRecorder.isTypeSupported = (type) => type === "audio/webm;codecs=opus";

    assert.equal(
      speechRecorder.selectRecordingMimeType(FakeRecorder),
      "audio/webm;codecs=opus"
    );
  });

  it("uses the recorder-reported MIME type for the returned blob", async () => {
    const { stream } = createStream();
    const { FakeMediaRecorder } = createRecorderClass();
    FakeMediaRecorder.isTypeSupported = (type) => type === "audio/mp4";
    FakeMediaRecorder.prototype.mimeType = "audio/mp4";

    const session = await startSpeechRecording({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: async () => stream,
    });

    assert.equal((await session.stop()).type, "audio/mp4");
  });
});

function createTrack() {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

function createStream(track = createTrack()) {
  return {
    track,
    stream: {
      getTracks() {
        return [track];
      },
    },
  };
}

function createRecorderClass({ onStart, startError } = {}) {
  const instances = [];
  class FakeMediaRecorder {
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      this.stopCalls = 0;
      instances.push(this);
    }

    start() {
      if (startError) throw startError;
      this.state = "recording";
      onStart?.();
    }

    stop() {
      this.stopCalls += 1;
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["child audio"], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }

  return { FakeMediaRecorder, instances };
}

describe("hold-to-talk speech recorder", () => {
  it("does not request microphone access when recording is unsupported", async () => {
    let requestedMicrophone = false;

    await assert.rejects(
      startSpeechRecording({
        MediaRecorder: undefined,
        getUserMedia() {
          requestedMicrophone = true;
          throw new Error("microphone should not be requested");
        },
      }),
      speechRecorder.RecordingUnsupportedError
    );

    assert.equal(requestedMicrophone, false);
  });

  it("starts immediately and returns captured audio when stopped", async () => {
    const { stream, track } = createStream();
    const { FakeMediaRecorder, instances } = createRecorderClass();
    const constraints = [];
    const session = await startSpeechRecording({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia(value) {
        constraints.push(value);
        return Promise.resolve(stream);
      },
    });

    assert.equal(instances[0].state, "recording");
    assert.equal(track.stopped, false);
    assert.deepEqual(constraints, [speechRecorder.MICROPHONE_CONSTRAINTS]);

    const blob = await session.stop();

    assert.equal(await blob.text(), "child audio");
    assert.equal(track.stopped, true);
    assert.equal(instances[0].stopCalls, 1);
  });

  it("reports recording once only after permission and recorder start succeed", async () => {
    const events = [];
    const { stream } = createStream();
    const { FakeMediaRecorder } = createRecorderClass({
      onStart() {
        events.push("recorder started");
      },
    });
    let allowMicrophone;
    let finishRecording;
    const pending = recordSpeechClip({
      clearTimeout() {},
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: () =>
        new Promise((resolve) => {
          allowMicrophone = resolve;
        }),
      onRecordingStart() {
        events.push("callback");
      },
      setTimeout(callback) {
        finishRecording = callback;
        return 1;
      },
    });

    await Promise.resolve();
    assert.deepEqual(events, []);

    allowMicrophone(stream);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ["recorder started", "callback"]);

    finishRecording();
    await pending;
    assert.deepEqual(events, ["recorder started", "callback"]);
  });

  it("does not report recording when microphone permission fails", async () => {
    const { FakeMediaRecorder, instances } = createRecorderClass();
    let callbackCalls = 0;

    await assert.rejects(
      recordSpeechClip({
        MediaRecorder: FakeMediaRecorder,
        getUserMedia: () => Promise.reject(new Error("permission denied")),
        onRecordingStart() {
          callbackCalls += 1;
        },
      }),
      speechRecorder.MicrophoneAccessError
    );

    assert.equal(callbackCalls, 0);
    assert.equal(instances.length, 0);
  });

  it("does not report recording when aborted before recorder creation", async () => {
    const controller = new AbortController();
    const { stream, track } = createStream();
    const { FakeMediaRecorder, instances } = createRecorderClass();
    let allowMicrophone;
    let callbackCalls = 0;
    const pending = recordSpeechClip({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: () =>
        new Promise((resolve) => {
          allowMicrophone = resolve;
        }),
      onRecordingStart() {
        callbackCalls += 1;
      },
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort();
    allowMicrophone(stream);

    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(callbackCalls, 0);
    assert.equal(instances.length, 0);
    assert.equal(track.stopped, true);
  });

  it("does not report recording when recorder start fails", async () => {
    const { stream, track } = createStream();
    const { FakeMediaRecorder } = createRecorderClass({
      startError: new Error("recorder start failed"),
    });
    let callbackCalls = 0;

    await assert.rejects(
      recordSpeechClip({
        MediaRecorder: FakeMediaRecorder,
        getUserMedia: () => Promise.resolve(stream),
        onRecordingStart() {
          callbackCalls += 1;
        },
      }),
      /recorder start failed/
    );

    assert.equal(callbackCalls, 0);
    assert.equal(track.stopped, true);
  });

  it("cancels an active session with an AbortError and stops tracks", async () => {
    const { stream, track } = createStream();
    const { FakeMediaRecorder } = createRecorderClass();
    const session = await startSpeechRecording({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: () => Promise.resolve(stream),
    });

    session.cancel();

    await assert.rejects(session.stop(), { name: "AbortError" });
    assert.equal(track.stopped, true);
  });

  it("makes repeated stop calls safe", async () => {
    const { stream } = createStream();
    const { FakeMediaRecorder, instances } = createRecorderClass();
    const session = await startSpeechRecording({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: () => Promise.resolve(stream),
    });

    const first = session.stop();
    const second = session.stop();
    const [firstBlob, secondBlob] = await Promise.all([first, second]);

    assert.equal(firstBlob, secondBlob);
    assert.equal(instances[0].stopCalls, 1);
  });

  it("honors AbortSignal before and during recording", async () => {
    const before = new AbortController();
    before.abort();
    await assert.rejects(
      startSpeechRecording({ signal: before.signal }),
      { name: "AbortError" }
    );

    const { stream, track } = createStream();
    const { FakeMediaRecorder } = createRecorderClass();
    const during = new AbortController();
    const session = await startSpeechRecording({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia: () => Promise.resolve(stream),
      signal: during.signal,
    });

    during.abort();

    await assert.rejects(session.stop(), { name: "AbortError" });
    assert.equal(track.stopped, true);
  });
});
