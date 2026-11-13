import { clips, sceneFile } from '../content-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateScene } from '../../src/scene.ts';

test('all 116 internal-test scenes have valid scenes, timed words, waveforms and separate audience folders', async () => {
  const scenes = clips;
  const { validateWaveform } = await import('../../src/waveform.ts');
  assert.equal(scenes.length, 116);
  assert.equal(scenes.filter(s => s.cohort === 'younger-age-5').length, 15);
  assert.equal(scenes.filter(s => s.cohort === 'older-audience').length, 72);
  assert.equal(scenes.filter(s => s.cohort === 'older-children').length, 15);
  assert.equal(scenes.filter(s => s.cohort === 'teens').length, 14);
  assert.equal(new Set(scenes.map(s => s.slug)).size, 116);
  assert.equal(new Set(scenes.map(s => s.routeSlug ?? s.slug)).size, scenes.length, 'public scene names must be unique');
  const ids = new Set();
  for (const entry of scenes) {
    assert.match(entry.routeSlug ?? entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const scene = validateScene(JSON.parse(await readFile(sceneFile(entry.slug), 'utf8')), `/scenes/${entry.slug}/`);
    assert.deepEqual((await readdir(dirname(sceneFile(entry.slug)))).sort(), ['scene.json', scene.waveform].sort(), 'ship only the waveform referenced by the scene');
    const wave = validateWaveform(JSON.parse(await readFile(sceneFile(entry.slug, scene.waveform), 'utf8')));
    assert.equal(wave.duration, scene.duration);
    assert.equal(scene.title, entry.title);
    assert.equal(scene.credit.source, entry.source);
    assert.equal(scene.mediaBase, `https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/${entry.slug}/`);
    assert.ok(scene.lines.every(l => l.words?.length));
    for (const entity of [scene, ...scene.roles, ...scene.lines]) {
      assert.ok(!ids.has(entity.id), `duplicate ID in ${entry.slug}`);
      ids.add(entity.id);
    }
  }
});

test('supporting speakers retain their dialogue without becoming practice roles', async () => {
  const load = async slug => validateScene(JSON.parse(await readFile(sceneFile(slug), 'utf8')), `/scenes/${slug}/`);
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
  assert.throws(() => validateScene(invalid, '/fixture/'));
  const unused = structuredClone(ben);
  unused.roles.push({ id: 'role_unused', name: 'Unused', label: 'Unused', hint: '' });
  assert.throws(() => validateScene(unused, '/fixture/'));
  invalid.roles[0].selectable = 'yes';
  assert.throws(() => validateScene(invalid, '/fixture/'));
});


test('TV scenes preserve independent roles and the shared sofa response', async () => {
  const recipe = JSON.parse(await readFile('content/tv-review-scenes.json', 'utf8'));
  for (const entry of recipe.scenes) {
    const scene = validateScene(JSON.parse(await readFile(sceneFile(entry.publicSlug), 'utf8')), `/scenes/${entry.publicSlug}/`);
    assert.ok(scene.roles.filter(role => role.selectable !== false).length >= 2);
    assert.ok(scene.lines.length >= 3);
    assert.ok(scene.duration >= 10 && scene.duration <= 40);
    assert.equal(scene.lines.length, entry.lines.length);
  }
  const sofa = validateScene(JSON.parse(await readFile(sceneFile('friends-moving-couch'), 'utf8')), '/scenes/friends-moving-couch/');
  const reply = sofa.lines.at(-1);
  assert.equal(reply.text, 'You think?');
  assert.equal(sofa.roles.find(role => role.id === reply.roleId).selectable, false);
});


test('successive TV batches use distinct source ranges and preserve the new cast', async () => {
  const recipe = JSON.parse(await readFile('content/tv-review-scenes.json', 'utf8'));
  assert.equal(recipe.scenes.filter(entry => entry.batch === '2026-11-11-b').length, 12);
  for (const [index, entry] of recipe.scenes.entries()) {
    for (const other of recipe.scenes.slice(index + 1)) {
      if (entry.sourceId === other.sourceId) assert.ok(entry.end <= other.start || other.end <= entry.start, `overlapping cuts: ${entry.slug}, ${other.slug}`);
    }
  }
  const game = validateScene(JSON.parse(await readFile(sceneFile('big-bang-the-present'), 'utf8')), '/scenes/big-bang-the-present/');
  assert.equal(game.roles.find(role => role.name === '艾米').selectable, false);
  const einstein = validateScene(JSON.parse(await readFile(sceneFile('young-sheldon-einstein'), 'utf8')), '/scenes/young-sheldon-einstein/');
  assert.equal(einstein.roles.find(role => role.id === einstein.lines[0].roleId).name, '斯特吉斯博士');
});


test('the third batch keeps all twelve exchanges distinct and preserves the water-scene support', async () => {
  const recipes = await Promise.all(['preschool', 'tv'].map(async name => JSON.parse(await readFile(`content/${name}-review-scenes.json`, 'utf8'))));
  const all = recipes.flatMap(recipe => recipe.scenes);
  const batch = all.filter(scene => scene.batch === '2026-11-11-c');
  assert.equal(batch.length, 12);
  assert.equal(batch.filter(scene => scene.cohort === 'younger-age-5').length, 6);
  for (const scene of batch) {
    assert.ok(new Set(scene.lines.map(line => line.roleId)).size >= 2);
    assert.ok(scene.lines.filter((line, i, lines) => !i || line.roleId !== lines[i - 1].roleId).length >= 3);
    for (const other of all) if (scene !== other && scene.sourceId === other.sourceId) assert.ok(scene.end <= other.start || other.end <= scene.start, `overlapping scenes: ${scene.slug}, ${other.slug}`);
  }
  const water = validateScene(JSON.parse(await readFile(sceneFile('himym-water-is-a-drink'), 'utf8')), '/scenes/himym-water-is-a-drink/');
  assert.equal(water.roles.find(role => role.name === '马修').selectable, false);
});


test('First English requires explicit level review and contains only short complete learner dialogues', async () => {
  const recipe = JSON.parse(await readFile('content/preschool-review-scenes.json', 'utf8'));
  const catalog = clips;
  const beginners = catalog.filter(scene => scene.cohort === 'younger-age-5');
  assert.equal(beginners.length, 15);
  for (const entry of beginners) {
    const reviewed = recipe.scenes.find(scene => scene.publicSlug === entry.slug);
    assert.equal(reviewed.beginnerSuitable, true);
    const scene = validateScene(JSON.parse(await readFile(sceneFile(entry.slug), 'utf8')), `/scenes/${entry.slug}/`);
    assert.ok(scene.lines.every(line => line.text.split(/\s+/).length <= 5));
    assert.ok(new Set(scene.lines.map(line => line.roleId)).size >= 2);
    assert.ok(scene.lines.filter((line, i, lines) => !i || line.roleId !== lines[i - 1].roleId).length >= 3);
    assert.ok(scene.roles.every(role => role.portrait));
  }
  const previous = recipe.scenes.filter(scene => scene.beginnerSuitable === false);
  assert.equal(previous.length, 14);
  for (const scene of previous) assert.equal(catalog.find(entry => entry.slug === scene.publicSlug).cohort, 'older-audience');
});

test('film franchises group sequels into five complete dialogue scenes each', async () => {
  const recipe = JSON.parse(await readFile('content/franchise-review-scenes.json', 'utf8'));
  const franchises = ['Shrek', 'Cars', 'Toy Story', 'Finding Nemo', 'Despicable Me', 'Up', 'Ratatouille', 'Kung Fu Panda', 'Madagascar', 'Harry Potter'];
  assert.equal(recipe.scenes.length, 29);
  for (const name of franchises) assert.equal(clips.filter(clip => clip.note === name).length, 5, name);
  for (const authored of recipe.scenes) {
    const clip = clips.find(clip => clip.slug === authored.publicSlug);
    const scene = validateScene(JSON.parse(await readFile(sceneFile(clip.slug), 'utf8')), '/fixture/');
    const source = recipe.sources.find(source => source.id === authored.sourceId);
    assert.equal(clip.note, source.franchise);
    assert.ok(scene.credit.title.startsWith(source.series));
    assert.ok(clip.tags.includes(source.series), 'exact film titles remain searchable');
    assert.ok(scene.duration >= 10 && scene.duration <= 40);
    assert.ok(new Set(scene.lines.map(line => line.roleId)).size >= 2);
    assert.ok(scene.lines.filter((line, index, lines) => !index || line.roleId !== lines[index - 1].roleId).length >= 3);
    assert.ok(scene.roles.every(role => role.portrait));
    for (const other of recipe.scenes) {
      if (other === authored) continue;
      const otherSource = recipe.sources.find(source => source.id === other.sourceId);
      if (source.url === otherSource.url) assert.ok(authored.end <= other.start || other.end <= authored.start, `overlapping excerpts: ${authored.slug}, ${other.slug}`);
    }
  }
  for (const note of ['Shrek 2', 'Shrek Forever After', 'Cars 2', 'Cars 3', 'Cars on the Road', 'Harry Potter and the Philosopher’s Stone']) {
    assert.equal(clips.filter(clip => clip.note === note).length, 0, 'sequels must not create separate folders');
  }
});
