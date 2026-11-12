import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sceneFile } from '../content-fixtures.ts';
import { validateWaveform } from '../../src/waveform.ts';

test('authored reference waveforms retain changing 5 ms audio peaks', async () => {
  for (const slug of ['patrick', 'chocolate', 'wumbo', 'onions']) {
    const scene = JSON.parse(await readFile(sceneFile(slug), 'utf8'));
    const wave = validateWaveform(JSON.parse(await readFile(sceneFile(slug, scene.waveform), 'utf8')));
    assert.ok(Math.max(...wave.peaks) - Math.min(...wave.peaks) > 0.05);
  }
});
