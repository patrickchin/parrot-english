import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateWaveform, waveformHeight, waveformPath } from '../src/waveform.ts';

test('reference waveforms retain changing 5 ms audio peaks on a shared scale', async () => {
  for (const slug of ['patrick', 'chocolate', 'wumbo', 'onions', 'sintel']) {
    const wave = validateWaveform(JSON.parse(await readFile(`public/packs/${slug}/waveform-v2.json`, 'utf8')));
    assert.ok(Math.max(...wave.peaks) - Math.min(...wave.peaks) > 0.05);
  }
  assert.equal(waveformHeight(0), 0);
  assert.ok(waveformHeight(0.02) < waveformHeight(0.2));
  const valid = { version: 2, duration: 0.01, step: 0.005, peaks: [0.1, 0.2] };
  for (const invalid of [{ ...valid, step: 0 }, { ...valid, peaks: [0.1] }, { ...valid, peaks: [-1, 0] }, { ...valid, peaks: [2, 0] }]) assert.throws(() => validateWaveform(invalid));
});

test('recorded traces remain silent outside their own time window', () => {
  const path = waveformPath([0.2, 0.2], 0, 0.12, 0.06);
  assert.match(path, /^M0 40 L0\.0 40\.0 /);
  assert.match(path, /L1000\.0 40\.0/);
  assert.notEqual(path, waveformPath([], 0, 0.12));
});


test('microphone worklet retains peaks between paints and has no drift at 44.1 kHz', async () => {
  let Processor;
  const source = await readFile('src/capture-waveform.worklet.js', 'utf8');
  runInNewContext(source, {
    sampleRate: 44100,
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_name, constructor) => { Processor = constructor; },
  });
  const processor = new Processor();
  const peaks = [];
  processor.port.postMessage = data => peaks.push(...data);
  processor.process([[new Float32Array(128).fill(0.9)]]);
  assert.equal(peaks.length, 0, 'do not include audio before recording');
  processor.port.onmessage();
  const pcm = new Float32Array(44100).fill(0.2);
  pcm[5] = -0.9;
  for (let offset = 0; offset < pcm.length; offset += 128) processor.process([[pcm.subarray(offset, offset + 128)]]);
  assert.equal(peaks.length, 200);
  assert.ok(Math.abs(peaks[0] - 0.9) < 0.00001);
  assert.ok(peaks.slice(1).every(p => Math.abs(p - 0.2) < 0.00001));
});
