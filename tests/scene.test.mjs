import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asset, validateScene } from '../src/scene.ts';
test('the independently loaded scene rejects traversal, missing roles and overlapping timings', async () => {
  const scene = JSON.parse(await readFile(new URL('./fixtures/sintel/scene.json', import.meta.url), 'utf8'));
  assert.equal(validateScene(scene, '/fixture/').lines.length, 5);
  assert.equal(asset(validateScene(scene, '/fixture/'), scene.video), scene.mediaBase + scene.video);
  assert.deepEqual(validateScene({ ...scene, tags: ['SpongeBob', '海绵宝宝'] }, '/fixture/').tags, ['SpongeBob', '海绵宝宝']);
  assert.equal(validateScene({ ...scene, id: 'scene_example' }, '/fixture/').id, 'scene_example');
  for (const change of [
    p => { p.tags = 'SpongeBob'; },
    p => { p.tags = [null]; },
    p => { p.tags = ['   ']; },
    p => { p.tags = ['x'.repeat(81)]; },
    p => { p.tags = Array(33).fill('tag'); },
    p => { p.id = 'unknown_example'; },
    p => { p.id = 'pack_example'; },
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
  ]) { const invalid = structuredClone(scene); change(invalid); assert.throws(() => validateScene(invalid, '/fixture/')); }
});
