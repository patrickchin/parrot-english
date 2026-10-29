import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asset, validatePack } from '../src/pack.ts';
test('the independently loaded pack rejects traversal, missing roles and overlapping timings', async () => {
  const pack = JSON.parse(await readFile(new URL('../public/packs/sintel/pack.json', import.meta.url), 'utf8'));
  assert.equal(validatePack(pack).lines.length, 5);
  assert.equal(asset(validatePack(pack), pack.video), pack.mediaBase + pack.video);
  for (const change of [
    p => { p.video = '../../secrets.mp4'; },
    p => { p.mediaBase = 'http://insecure.example/clips/'; },
    p => { p.mediaBase = 'https://example.com/clips/?token=private'; },
    p => { p.poster = 'https://tracker.example/picture.jpg'; },
    p => { p.waveform = '../../private.json'; },
    p => { p.lines[0].roleId = 'role_absent'; },
    p => { p.lines[1].start = 0; },
    p => { p.lines[0].end = 500; },
    p => { p.lines[1].id = p.lines[0].id; },
    p => { p.lines[0].words[0].end = 500; },
    p => { p.lines[0].words[0].text = 'wrong'; },
    p => { p.lines[0].words[1].start = p.lines[0].start - 0.1; },
  ]) { const invalid = structuredClone(pack); change(invalid); assert.throws(() => validatePack(invalid)); }
});
