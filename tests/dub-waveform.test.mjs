import assert from "node:assert/strict";
import { describe, it } from "node:test";

const waveform = await import("../src/dubbing/dub-waveform.ts").catch(() => ({}));
const { DUB_DEFINITIONS = [] } = await import("../src/dubbing/rhyme-catalog.ts").catch(() => ({}));
const getNormalizedPeakBars = waveform.getNormalizedPeakBars ?? (() => null);
const getDubRecordingPeakBars = waveform.getDubRecordingPeakBars ?? (() => null);

describe("dub take waveform peaks", () => {
  it("reduces signed PCM samples into normalized peak bars", () => {
    assert.deepEqual(
      getNormalizedPeakBars([-0.2, 0.1, -0.5, 0.3, -1, 0.4, 0.1, -0.8], 4),
      [0.2, 0.5, 1, 0.8],
    );
  });

  it("uses baseline bars for silent or empty recordings", () => {
    assert.deepEqual(getNormalizedPeakBars([0, 0, 0], 4), [0, 0, 0, 0]);
    assert.deepEqual(getNormalizedPeakBars([], 4), [0, 0, 0, 0]);
  });

  it("pads short clips instead of stretching them across the recording timeline", () => {
    assert.deepEqual(
      getNormalizedPeakBars([-0.2, 0.4, -1, 0.5], 4, 8),
      [0.4, 1, 0, 0],
    );
  });

  it("decodes one recording into the persisted 32-bar timeline", async () => {
    let closes = 0;
    class AudioContextDouble {
      close() {
        closes += 1;
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({
          getChannelData: () => Float32Array.from([0, 0.25, -1, 0.5]),
          sampleRate: 32,
        });
      }
    }

    const bars = await getDubRecordingPeakBars(
      new Blob(["take"], { type: "audio/webm" }),
      1_000,
      AudioContextDouble,
    );

    assert.equal(bars.length, 32);
    assert.deepEqual(bars.slice(0, 4), [0, 0.25, 1, 0.5]);
    assert.equal(bars.slice(4).every((bar) => bar === 0), true);
    assert.equal(closes, 1);
  });

  it("keeps waveform extraction optional when decoding fails", async () => {
    class AudioContextDouble {
      close() { return Promise.resolve(); }
      decodeAudioData() { return Promise.reject(new Error("decode failed")); }
    }

    assert.equal(
      await getDubRecordingPeakBars(new Blob(["take"]), 4_000, AudioContextDouble),
      null,
    );
  });

  it("scales one second of samples across two-, four-, and eight-second timelines", () => {
    const samples = Array.from({ length: 8 }, () => 1);
    const visibleBars = (durationMs) => getNormalizedPeakBars(
      samples,
      8,
      Math.round(8 * durationMs / 1_000),
    ).filter((peak) => peak > 0).length;

    assert.equal(visibleBars(2_000), 4);
    assert.equal(visibleBars(4_000), 2);
    assert.equal(visibleBars(8_000), 1);
  });

  it("keeps every visible guide waveform on its owning catalog line", () => {
    assert.equal(DUB_DEFINITIONS.length, 6);
    for (const definition of DUB_DEFINITIONS) {
      for (const line of definition.lines) {
        assert.ok(Array.isArray(line.guidePeakBars), `${line.id} owns guide bars`);
        assert.equal(line.guidePeakBars.length, 32, line.id);
        assert.ok(line.guidePeakBars.some((bar) => bar > 0), `${line.id} should not be silent`);
        assert.ok(line.guidePeakBars.every((bar) => bar >= 0 && bar <= 1));
      }
    }
  });
});
