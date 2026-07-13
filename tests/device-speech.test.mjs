import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  playDeviceSpeech,
  selectEnglishDeviceVoice,
} from "../src/device-speech.ts";

describe("on-device lesson speech", () => {
  it("prefers a local English voice deterministically", () => {
    const remote = {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Remote English",
    };
    const localBritish = {
      default: false,
      lang: "en-GB",
      localService: true,
      name: "Local British",
    };
    const localChinese = {
      default: false,
      lang: "zh-CN",
      localService: true,
      name: "Local Chinese",
    };

    assert.equal(
      selectEnglishDeviceVoice([remote, localChinese, localBritish]),
      localBritish,
    );
  });

  it("speaks a character line and resolves only after speech ends", async () => {
    const spoken = [];
    const voice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "Local English",
    };
    let finish;
    const operation = playDeviceSpeech({
      speaker: "peppa",
      text: "Can you help me?",
      env: {
        createUtterance(text) {
          return { text };
        },
        getVoices() {
          return [voice];
        },
        speak(utterance) {
          spoken.push(utterance);
          finish = () => utterance.onend?.();
        },
        cancel() {},
      },
    });

    await Promise.resolve();
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].voice, voice);
    assert.equal(spoken[0].lang, "en-US");
    assert.ok(spoken[0].pitch > 1);
    assert.equal(spoken[0].text, "Can you help me?");
    finish();
    await operation;
  });

  it("cancels active device speech when playback is aborted", async () => {
    const controller = new AbortController();
    let cancelCount = 0;
    const operation = playDeviceSpeech({
      speaker: "narrator",
      text: "Great job!",
      signal: controller.signal,
      env: {
        createUtterance(text) {
          return { text };
        },
        getVoices() {
          return [];
        },
        speak() {},
        cancel() {
          cancelCount += 1;
        },
      },
    });

    controller.abort();
    await assert.rejects(operation, { name: "AbortError" });
    assert.equal(cancelCount, 1);
  });

  it("reports browsers without speech synthesis support", async () => {
    await assert.rejects(
      playDeviceSpeech({
        speaker: "dolly",
        text: "Hello!",
        env: null,
      }),
      /on-device speech is not supported/i,
    );
  });
});
