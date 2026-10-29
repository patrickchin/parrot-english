import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asset, validatePack } from '../src/pack.ts';
test('the independently loaded pack rejects traversal, missing roles and overlapping timings', async () => {
  const pack = JSON.parse(await readFile(new URL('./fixtures/sintel/pack.json', import.meta.url), 'utf8'));
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


test('all twenty additional scenes have valid independent packs, timed words, and reference waveforms', async () => {
  const scenes = JSON.parse(await readFile('content/extra-scenes.json', 'utf8'));
  const catalog = JSON.parse(await readFile('src/extra-clips.json', 'utf8'));
  const { validateWaveform } = await import('../src/waveform.ts');
  assert.equal(scenes.length, 20);
  assert.equal(new Set(scenes.map(s => s.slug)).size, 20);
  const ids = new Set();
  for (const scene of scenes) {
    const pack = validatePack(JSON.parse(await readFile(`public/packs/${scene.slug}/pack.json`, 'utf8')));
    const wave = validateWaveform(JSON.parse(await readFile(`public/packs/${scene.slug}/${pack.waveform}`, 'utf8')));
    assert.equal(wave.duration, pack.duration);
    assert.equal(pack.title, catalog.find(c => c.slug === scene.slug).title);
    assert.equal(pack.credit.source, catalog.find(c => c.slug === scene.slug).source);
    assert.equal(pack.mediaBase, `https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${scene.slug}/`);
    assert.ok(pack.lines.every(l => l.words?.length));
    for (const entity of [pack, ...pack.roles, ...pack.lines]) {
      assert.ok(!ids.has(entity.id), `duplicate ID in ${scene.slug}`);
      ids.add(entity.id);
    }
  }
});
