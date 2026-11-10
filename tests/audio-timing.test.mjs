import test from 'node:test';
import assert from 'node:assert/strict';
import { audibleContextTime, decodeTake } from '../src/audio-timing.ts';

test('audible clock uses the output sample timestamp and platform latency fallback', () => {
  const context = { currentTime: 10, baseLatency: 0.01, outputLatency: 0.09, getOutputTimestamp: () => ({ contextTime: 9.85, performanceTime: 1000 }) };
  assert.equal(audibleContextTime(context, 1050), 9.9);
  assert.equal(audibleContextTime(context, 1500), 10, 'never extrapolate beyond rendered samples');
  context.getOutputTimestamp = () => ({ contextTime: 0, performanceTime: 0 });
  assert.equal(audibleContextTime(context, 1050), 9.9);
  assert.ok(Math.abs(audibleContextTime({ ...context, currentTime: 0 }, 1050) + 0.1) < 1e-9, 'retain startup output latency before the first sample');
  assert.equal(audibleContextTime({ currentTime: 10 }, 1050), 10, 'old engines without either latency API');
});

test('decoded takes share pending work by Blob, replacements decode independently, and failures retry', async () => {
  const cache = new WeakMap();
  let decodes = 0, fail = false;
  const buffer = {};
  const context = { decodeAudioData: async () => { decodes++; if (fail) throw new Error('decode failed'); return buffer; } };
  const original = new Blob(['original']);
  assert.equal(decodeTake(cache, context, original), decodeTake(cache, context, original));
  assert.equal(await decodeTake(cache, context, original), buffer);
  assert.equal(await decodeTake(cache, context, original), buffer);
  assert.equal(decodes, 1);
  await decodeTake(cache, context, new Blob(['replacement']));
  assert.equal(decodes, 2);
  const broken = new Blob(['broken']); fail = true;
  await assert.rejects(decodeTake(cache, context, broken));
  fail = false;
  await decodeTake(cache, context, broken);
  assert.equal(decodes, 4);
});
