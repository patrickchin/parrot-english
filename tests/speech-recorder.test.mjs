import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as speechRecorder from "../src/media/speech-recorder.ts";

const startSpeechRecording =
  speechRecorder.startSpeechRecording ??
  (() => Promise.reject(new Error("startSpeechRecording is missing")));

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

function createRecorderClass() {
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
      this.state = "recording";
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
