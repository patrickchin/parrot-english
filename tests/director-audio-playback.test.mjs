import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createDirectorSpeechSegmentKey } from "../lib/director-speech-segments.js";
import {
  clearDirectorSpeechAudioCache,
  playDirectorTurnSpeech,
} from "../src/director-audio-playback.ts";

const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const DEFAULT_DYNAMIC_AUDIO_SRC = "data:audio/mpeg;base64,ZGlyZWN0b3ItMQ==";

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalAudio === undefined) {
    delete globalThis.Audio;
  } else {
    globalThis.Audio = originalAudio;
  }
  clearDirectorSpeechAudioCache();
});

function mockDirectorTts({
  audioSrcForRequest = () => DEFAULT_DYNAMIC_AUDIO_SRC,
  keyForBody = createDirectorSpeechSegmentKey,
} = {}) {
  const requests = [];

  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, "/api/director-tts");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "content-type": "application/json" });

    const body = JSON.parse(String(init.body));
    requests.push({ body, signal: init.signal });

    return new globalThis.Response(
      JSON.stringify({
        audioSrc: audioSrcForRequest(requests.length, body),
        key: keyForBody(body),
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
  it("uses static audio without requesting generated audio", async () => {
    globalThis.fetch = async () => {
      throw new Error("Static audio should not request generated audio");
    };
    const played = [];

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "轮到你了，跟着佩奇说。" }],
      playResolvedSegment: async (segment) => {
        played.push(segment);
      },
      waitForSilentSegment: async () => {},
    });

    assert.deepEqual(played, [
      {
        audioSrc: "/assets/audio/turn-hello.wav",
        lang: "zh-CN",
        text: "轮到你了，跟着佩奇说。",
      },
    ]);
  });

  it("plays static audio through the default audio playback path", async () => {
    const playedUrls = [];

    globalThis.Audio = class {
      constructor(url) {
        this.url = url;
      }

      play() {
        playedUrls.push(this.url);
        Promise.resolve().then(() => this.onended?.());
        return Promise.resolve();
      }
    };
    globalThis.fetch = async () => {
      throw new Error("Static audio should not request generated audio");
    };

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "轮到你了，跟着佩奇说。" }],
      waitForSilentSegment: async () => {},
    });

    assert.deepEqual(playedUrls, ["/assets/audio/turn-hello.wav"]);
  });

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
    globalThis.fetch = async () => new globalThis.Response("{}", { status: 502 });
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

  it("does not cache generated audio when the response audio source is empty", async () => {
    const validAudioSrc = "data:audio/mpeg;base64,ZGlyZWN0b3ItdmFsaWQ=";
    const requests = mockDirectorTts({
      audioSrcForRequest: (requestCount) =>
        requestCount === 1 ? "" : validAudioSrc,
    });
    const speech = [{ lang: "zh-CN", text: "不要缓存空的动态音频。" }];
    const playedSources = [];
    let silentCount = 0;

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });
    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(requests.length, 2);
    assert.equal(silentCount, 1);
    assert.deepEqual(playedSources, [validAudioSrc]);
  });

  it("does not cache generated audio when the response audio source is not playable TTS data", async () => {
    const invalidAudioSources = [
      "/broken",
      "https://bad.example/x",
      "data:text/plain;base64,SGVsbG8=",
      "data:audio/mpeg;base64,",
    ];
    const validAudioSrc = "data:audio/mpeg;base64,ZGlyZWN0b3ItdmFsaWQ=";
    const requests = mockDirectorTts({
      audioSrcForRequest: (requestCount) =>
        invalidAudioSources[requestCount - 1] ?? validAudioSrc,
    });
    const speech = [{ lang: "zh-CN", text: "不要缓存无效的动态音频。" }];
    const playedSources = [];
    let silentCount = 0;

    for (let index = 0; index < invalidAudioSources.length; index += 1) {
      await playDirectorTurnSpeech({
        speaker: "polly",
        speech,
        playResolvedSegment: async (segment) => {
          playedSources.push(segment.audioSrc);
        },
        waitForSilentSegment: async () => {
          silentCount += 1;
        },
      });
    }

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });
    await playDirectorTurnSpeech({
      speaker: "polly",
      speech,
      playResolvedSegment: async (segment) => {
        playedSources.push(segment.audioSrc);
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(requests.length, invalidAudioSources.length + 1);
    assert.equal(silentCount, invalidAudioSources.length);
    assert.deepEqual(playedSources, [validAudioSrc, validAudioSrc]);
  });

  it("falls back to silent timing when generated audio returns a mismatched key", async () => {
    mockDirectorTts({ keyForBody: () => "wrong-key" });
    let playedCount = 0;
    let silentCount = 0;

    await playDirectorTurnSpeech({
      speaker: "polly",
      speech: [{ lang: "zh-CN", text: "这句动态音频的 key 不匹配。" }],
      playResolvedSegment: async () => {
        playedCount += 1;
      },
      waitForSilentSegment: async () => {
        silentCount += 1;
      },
    });

    assert.equal(playedCount, 0);
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
      DEFAULT_DYNAMIC_AUDIO_SRC,
      DEFAULT_DYNAMIC_AUDIO_SRC,
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
