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


test('all 32 internal-test scenes have valid packs, timed words, waveforms and separate audience folders', async () => {
  const scenes = JSON.parse(await readFile('src/review-clips.json', 'utf8'));
  const { validateWaveform } = await import('../src/waveform.ts');
  assert.equal(scenes.length, 32);
  assert.equal(scenes.filter(s => s.cohort === 'younger-age-5').length, 8);
  assert.equal(scenes.filter(s => s.cohort === 'older-audience').length, 24);
  assert.equal(new Set(scenes.map(s => s.slug)).size, 32);
  const ids = new Set();
  for (const scene of scenes) {
    const pack = validatePack(JSON.parse(await readFile(`public/packs/${scene.slug}/pack.json`, 'utf8')));
    const wave = validateWaveform(JSON.parse(await readFile(`public/packs/${scene.slug}/${pack.waveform}`, 'utf8')));
    assert.equal(wave.duration, pack.duration);
    assert.equal(pack.title, scene.title);
    assert.equal(pack.credit.source, scene.source);
    assert.equal(pack.mediaBase, `https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${scene.slug}/`);
    assert.ok(pack.lines.every(l => l.words?.length));
    for (const entity of [pack, ...pack.roles, ...pack.lines]) {
      assert.ok(!ids.has(entity.id), `duplicate ID in ${scene.slug}`);
      ids.add(entity.id);
    }
  }
});

test('supporting speakers retain their dialogue without becoming practice roles', async () => {
  const load = async slug => validatePack(JSON.parse(await readFile(`public/packs/${slug}/pack.json`, 'utf8')));
  const ben = await load('ben-blue-hat');
  const speakers = ben.lines.map(line => ben.roles.find(role => role.id === line.roleId).name);
  assert.deepEqual(speakers, ['霍莉', '本', '梅姨', '霍莉', '梅姨', '本', '霍莉']);
  assert.match(ben.lines.at(-1).text, /never lose you again/);
  const dinosaur = await load('peppa-toy-dinosaur');
  assert.equal(dinosaur.roles.find(role => role.id === dinosaur.lines.at(-2).roleId).selectable, false);
  assert.equal(dinosaur.lines.at(-2).text, 'Really scary!');
  assert.equal(dinosaur.roles.find(role => role.id === dinosaur.lines.at(-1).roleId).name, '小狗丹尼');
  const cars = await load('ka-chow');
  assert.deepEqual(cars.lines.slice(0, 2).map(line => cars.roles.find(role => role.id === line.roleId).name), ['奇克·海克斯', '闪电麦昆']);
  const speed = await load('i-am-speed');
  assert.equal(speed.roles.find(role => role.id === speed.lines[0].roleId).selectable, false);
  const invalid = structuredClone(ben);
  invalid.roles.forEach(role => { role.selectable = false; });
  assert.throws(() => validatePack(invalid));
  const unused = structuredClone(ben);
  unused.roles.push({ id: 'role_unused', name: 'Unused', label: 'Unused', hint: '' });
  assert.throws(() => validatePack(unused));
  invalid.roles[0].selectable = 'yes';
  assert.throws(() => validatePack(invalid));
});
