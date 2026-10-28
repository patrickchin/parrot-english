import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWaveform, waveformHeight, waveformPath } from '../src/waveform.ts';

test('reference envelopes contain actual changing audio levels on a fixed scale', async () => {
  for (const slug of ['patrick', 'chocolate', 'wumbo', 'onions', 'sintel']) {
    const wave = validateWaveform(JSON.parse(await readFile(`public/packs/${slug}/waveform-v1.json`, 'utf8')));
    assert.ok(Math.max(...wave.peaks) - Math.min(...wave.peaks) > 0.05);
  }
  assert.equal(waveformHeight(0), 0);
  assert.ok(waveformHeight(0.02) < waveformHeight(0.2));
  const valid = { version: 1, duration: 0.04, step: 0.02, peaks: [0.1, 0.2] };
  for (const invalid of [{ ...valid, step: 0 }, { ...valid, peaks: [0.1] }, { ...valid, peaks: [-1, 0] }, { ...valid, peaks: [2, 0] }]) assert.throws(() => validateWaveform(invalid));
});

test('recorded traces remain silent outside their own time window', () => {
  const path = waveformPath([0.2, 0.2], 0, 0.12, 0.06);
  assert.match(path, /^M0 40 L0\.0 40\.0 /);
  assert.match(path, /L1000\.0 40\.0/);
  assert.notEqual(path, waveformPath([], 0, 0.12));
});
