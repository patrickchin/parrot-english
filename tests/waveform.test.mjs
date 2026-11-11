import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { encodePcmWav } from '../src/pcm-recording.ts';
import { validateWaveform, waveformHeight, waveformPath } from '../src/waveform.ts';

test('reference waveforms retain changing 5 ms audio peaks on a shared scale', async () => {
  for (const slug of ['patrick', 'chocolate', 'wumbo', 'onions']) {
    const wave = validateWaveform(JSON.parse(await readFile(`public/scenes/${slug}/waveform-v2.json`, 'utf8')));
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


test('microphone PCM and peaks share a sample origin, preserve the stop tail, and have no 44.1 kHz drift', async () => {
  let Processor;
  const source = await readFile('src/capture-waveform.worklet.js', 'utf8');
  const environment = {
    sampleRate: 44100, currentFrame: 1000,
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_name, constructor) => { Processor = constructor; },
  };
  runInNewContext(source, environment);
  for (const frames of [44100, 512]) {
    const processor = new Processor();
    const messages = [];
    processor.port.postMessage = data => messages.push(data);
    processor.process([[new Float32Array(128).fill(0.9)]]);
    assert.equal(messages.length, 0, 'do not include audio before recording');
    processor.port.onmessage({ data: 'unknown' });
    processor.process([[new Float32Array(128).fill(0.9)]]);
    assert.equal(messages.length, 0, 'unknown commands cannot start capture');
    processor.port.onmessage({ data: 'start' });
    const pcm = new Float32Array(frames).fill(0.2); pcm[5] = -0.9;
    for (let offset = 0; offset < pcm.length; offset += 128) {
      environment.currentFrame = 1000 + offset;
      processor.process([[pcm.subarray(offset, offset + 128)]]);
      if (offset === 0) processor.port.onmessage({ data: 'start' }); // A duplicate must not reset retained PCM.
    }
    processor.port.onmessage({ data: 'stop' });
    assert.equal(messages[0].type, 'started');
    assert.equal(messages[0].time, 1000 / 44100, 'acknowledge the exact first retained frame');
    assert.equal(messages.at(-1).type, 'stopped', 'drain final PCM before confirming stop');
    processor.port.onmessage({ data: 'stop' });
    assert.equal(messages.filter(message => message.type === 'stopped').length, 1, 'duplicate stop is inert');
    const data = messages.filter(message => message.type === 'data');
    const saved = data.flatMap(message => [...message.samples]);
    assert.deepEqual(saved, [...pcm], 'retain sample zero and the final partial block');
    const peaks = data.flatMap(message => message.peaks);
    assert.equal(peaks.length, Math.ceil(frames / (44100 * 0.005)));
    assert.ok(Math.abs(peaks[0] - 0.9) < 0.00001);
    assert.ok(peaks.slice(1).every(p => Math.abs(p - 0.2) < 0.00001));
    processor.process([[new Float32Array(128).fill(0.8)]]);
    assert.equal(messages.at(-1).type, 'stopped', 'do not keep microphone data after stopping');
  }
});

test('PCM WAV uses standard headers and preserves sample order with no codec priming', async () => {
  const blob = encodePcmWav([new Float32Array([0, -1, 1]), new Float32Array([0.5, -0.5])], 44100);
  const bytes = await blob.arrayBuffer(), view = new DataView(bytes);
  const text = (from, to) => new TextDecoder().decode(bytes.slice(from, to));
  assert.equal(blob.type, 'audio/wav');
  assert.equal(text(0, 4), 'RIFF'); assert.equal(text(8, 12), 'WAVE'); assert.equal(text(36, 40), 'data');
  assert.equal(view.getUint32(4, true), bytes.byteLength - 8);
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(40, true), 10);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true)), [0, -32768, 32767, 16384, -16384]);
});
