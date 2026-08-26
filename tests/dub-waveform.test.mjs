import assert from "node:assert/strict";
import { describe, it } from "node:test";

const waveform = await import("../src/dubbing/dub-waveform.ts").catch(() => ({}));
const { DUB_LINES = [] } = await import("../src/dubbing/dub-script.ts").catch(() => ({}));
const { getStaticAudioLineForSpeech = () => ({ id: "" }) } = await import("../lib/static-audio.js").catch(() => ({}));
const getNormalizedPeakBars = waveform.getNormalizedPeakBars ?? (() => null);
const getDubGuidePeakBars = waveform.getDubGuidePeakBars ?? (() => []);

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

  it("provides a normalized waveform for every saved duck guide", () => {
    for (const lineNumber of [1, 2, 3, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 23, 24]) {
      const bars = getDubGuidePeakBars(`five-little-ducks-v2-guide-line-${lineNumber}`);
      assert.equal(bars.length, 32);
      assert.ok(bars.some((bar) => bar > 0));
      assert.ok(bars.every((bar) => bar >= 0 && bar <= 1));
    }
  });

  it("maps every authored duck lyric to a saved guide waveform", () => {
    assert.equal(DUB_LINES.length, 24);
    for (const line of DUB_LINES) {
      const { id } = getStaticAudioLineForSpeech("narrator", line.text);
      const bars = getDubGuidePeakBars(id);
      assert.equal(bars.length, 32, `${line.id} should resolve ${id}`);
      assert.ok(bars.some((bar) => bar > 0), `${line.id} should not be silent`);
    }
  });
});
