import assert from "node:assert/strict";
import { describe, it } from "node:test";

const waveform = await import("../src/dubbing/dub-waveform.ts").catch(() => ({}));
const getNormalizedPeakBars = waveform.getNormalizedPeakBars ?? (() => null);

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
});
