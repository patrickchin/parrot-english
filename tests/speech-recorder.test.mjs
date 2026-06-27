import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RecordingUnsupportedError,
  recordSpeechClip,
} from "../src/speech-recorder.ts";

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

describe("speech recorder", () => {
  it("does not request microphone access when recording is unsupported", async () => {
    let requestedMicrophone = false;

    await assert.rejects(
      recordSpeechClip({
        MediaRecorder: undefined,
        getUserMedia() {
          requestedMicrophone = true;
          throw new Error("microphone should not be requested");
        },
      }),
      RecordingUnsupportedError
    );

    assert.equal(requestedMicrophone, false);
  });

  it("turns off the microphone after recording finishes", async () => {
    const { stream, track } = createStream();
    const getUserMediaCalls = [];
    const clearTimeoutCalls = [];
    let scheduledStop;
    let recorderOptions;
    let recorderState;
    let recorderStream;

    class FakeMediaRecorder {
      constructor(mediaStream, options) {
        this.stream = mediaStream;
        this.options = options;
        this.state = "inactive";
        recorderOptions = options;
        recorderState = this.state;
        recorderStream = mediaStream;
      }

      start() {
        this.state = "recording";
        recorderState = this.state;
      }

      stop() {
        this.state = "inactive";
        recorderState = this.state;
        this.ondataavailable?.({
          data: new Blob(["child audio"], { type: "audio/webm" }),
        });
        this.onstop?.();
      }
    }

    const promise = recordSpeechClip({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia(constraints) {
        getUserMediaCalls.push(constraints);
        return Promise.resolve(stream);
      },
      setTimeout(callback, delay) {
        scheduledStop = { callback, delay };
        return "timer-id";
      },
      clearTimeout(timerId) {
        clearTimeoutCalls.push(timerId);
      },
      recordingMs: 1234,
    });

    await Promise.resolve();

    assert.equal(getUserMediaCalls.length, 1);
    assert.deepEqual(getUserMediaCalls[0], {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    assert.equal(recorderStream, stream);
    assert.deepEqual(recorderOptions, { mimeType: "audio/webm" });
    assert.equal(recorderState, "recording");
    assert.equal(track.stopped, false);
    assert.equal(scheduledStop.delay, 1234);

    scheduledStop.callback();
    const audioBlob = await promise;

    assert.equal(await audioBlob.text(), "child audio");
    assert.equal(track.stopped, true);
    assert.deepEqual(clearTimeoutCalls, ["timer-id"]);
  });

  it("turns off the microphone when recording is cancelled", async () => {
    const { stream, track } = createStream();
    const controller = new AbortController();
    let recorderState;

    class FakeMediaRecorder {
      constructor() {
        this.state = "inactive";
        recorderState = this.state;
      }

      start() {
        this.state = "recording";
        recorderState = this.state;
      }

      stop() {
        this.state = "inactive";
        recorderState = this.state;
        this.onstop?.();
      }
    }

    const promise = recordSpeechClip({
      MediaRecorder: FakeMediaRecorder,
      getUserMedia() {
        return Promise.resolve(stream);
      },
      setTimeout() {
        return "timer-id";
      },
      clearTimeout() {},
      signal: controller.signal,
    });

    await Promise.resolve();
    assert.equal(recorderState, "recording");

    controller.abort();

    await assert.rejects(promise, { name: "AbortError" });
    assert.equal(recorderState, "inactive");
    assert.equal(track.stopped, true);
  });
});
