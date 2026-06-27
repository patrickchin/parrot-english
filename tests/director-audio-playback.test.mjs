import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";
import { playDirectorTurnSpeech } from "../src/director-audio-playback.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockDirectorTts() {
  const requests = [];

  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, "/api/director-tts");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "content-type": "application/json" });

    const body = JSON.parse(String(init.body));
    requests.push({ body, signal: init.signal });

    return new Response(
      JSON.stringify({
        audioSrc: `/generated/director-${requests.length}.mp3`,
        key: createDirectorSpeechSegmentKey(body),
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      }
    );
  };

  return requests;
}

describe("director audio playback", () => {
  it("plays each speech segment in order", async () => {
    mockDirectorTts();
    const played = [];

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [
        { lang: "zh-CN", text: "轮到你说：" },
        { lang: "en-US", text: "Hello, Peppa!" },
      ],
      playResolvedSegment: async (segment) => {
        played.push(segment.text);
      },
      waitForSilentSegment: async () => {},
    });

    assert.deepEqual(played, ["轮到你说：", "Hello, Peppa!"]);
  });

  it("falls back to silent timing when segment playback fails", async () => {
    mockDirectorTts();
    let silentCount = 0;

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "新的动态句子。" }],
      playResolvedSegment: async () => {
        throw new Error("audio failed");
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(silentCount, 1);
  });

  it("falls back to silent timing when generated audio fails", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 502 });
    let silentCount = 0;

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "生成失败的动态句子。" }],
      playResolvedSegment: async () => {
        throw new Error("Playback should not run without audio");
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(silentCount, 1);
  });

  it("reuses generated audio for repeated dynamic segments", async () => {
    const requests = mockDirectorTts();
    const playedSources = [];
    const speech = [{ lang: "zh-CN", text: "缓存这一句动态音频。" }];

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {},
    });
    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {},
    });

    assert.equal(requests.length, 1);
    assert.deepEqual(playedSources, [
      "/generated/director-1.mp3",
      "/generated/director-1.mp3",
    ]);
  });

  it("stops without silent fallback when playback is aborted", async () => {
    const controller = new AbortController();
    const abortError = new Error("Playback was cancelled");
    abortError.name = "AbortError";
    let playedCount = 0;
    let silentCount = 0;

    await playDirectorTurnSpeech({
      signal: controller.signal,
      speaker: "polly",
      speech: [
        { lang: "zh-CN", text: "轮到你了，跟着佩奇说。" },
        { lang: "zh-CN", text: "太棒了！我们继续下一句。" },
      ],
      playResolvedSegment: async () => {
        playedCount += 1;
        controller.abort();
        throw abortError;
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(playedCount, 1);
    assert.equal(silentCount, 0);
  });
});
