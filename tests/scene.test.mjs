import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asset, validateScene } from '../src/scene.ts';
test('the independently loaded scene rejects traversal, missing roles and overlapping timings', async () => {
  const scene = JSON.parse(await readFile(new URL('./fixtures/sintel/scene.json', import.meta.url), 'utf8'));
  assert.equal(validateScene(scene).lines.length, 5);
  assert.equal(asset(validateScene(scene), scene.video), scene.mediaBase + scene.video);
  assert.deepEqual(validateScene({ ...scene, tags: ['SpongeBob', '海绵宝宝'] }).tags, ['SpongeBob', '海绵宝宝']);
  assert.equal(validateScene({ ...scene, id: 'scene_example' }).id, 'scene_example');
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
  ]) { const invalid = structuredClone(scene); change(invalid); assert.throws(() => validateScene(invalid)); }
});


test('all 73 internal-test scenes have valid scenes, timed words, waveforms and separate audience folders', async () => {
  const scenes = JSON.parse(await readFile('src/review-clips.json', 'utf8'));
  const { validateWaveform } = await import('../src/waveform.ts');
  assert.equal(scenes.length, 73);
  assert.equal(scenes.filter(s => s.cohort === 'younger-age-5').length, 9);
  assert.equal(scenes.filter(s => s.cohort === 'older-audience').length, 38);
  assert.equal(scenes.filter(s => s.cohort === 'older-children').length, 12);
  assert.equal(scenes.filter(s => s.cohort === 'teens').length, 14);
  assert.equal(new Set(scenes.map(s => s.slug)).size, 73);
  assert.equal(new Set(scenes.map(s => s.routeSlug ?? s.slug)).size, scenes.length, 'public scene names must be unique');
  const ids = new Set();
  for (const entry of scenes) {
    assert.match(entry.routeSlug ?? entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const scene = validateScene(JSON.parse(await readFile(`public/scenes/${entry.slug}/scene.json`, 'utf8')));
    const wave = validateWaveform(JSON.parse(await readFile(`public/scenes/${entry.slug}/${scene.waveform}`, 'utf8')));
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
  const load = async slug => validateScene(JSON.parse(await readFile(`public/scenes/${slug}/scene.json`, 'utf8')));
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
  assert.throws(() => validateScene(invalid));
  const unused = structuredClone(ben);
  unused.roles.push({ id: 'role_unused', name: 'Unused', label: 'Unused', hint: '' });
  assert.throws(() => validateScene(unused));
  invalid.roles[0].selectable = 'yes';
  assert.throws(() => validateScene(invalid));
});


test('TV scenes preserve independent roles and the shared sofa response', async () => {
  const recipe = JSON.parse(await readFile('content/tv-review-scenes.json', 'utf8'));
  for (const entry of recipe.scenes) {
    const scene = validateScene(JSON.parse(await readFile(`public/scenes/${entry.publicSlug}/scene.json`, 'utf8')));
    assert.ok(scene.roles.filter(role => role.selectable !== false).length >= 2);
    assert.ok(scene.lines.length >= 3);
    assert.ok(scene.duration >= 10 && scene.duration <= 40);
    assert.equal(scene.lines.length, entry.lines.length);
  }
  const sofa = validateScene(JSON.parse(await readFile('public/scenes/friends-moving-couch/scene.json', 'utf8')));
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
  const game = validateScene(JSON.parse(await readFile('public/scenes/big-bang-the-present/scene.json', 'utf8')));
  assert.equal(game.roles.find(role => role.name === '艾米').selectable, false);
  const einstein = validateScene(JSON.parse(await readFile('public/scenes/young-sheldon-einstein/scene.json', 'utf8')));
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
  const water = validateScene(JSON.parse(await readFile('public/scenes/himym-water-is-a-drink/scene.json', 'utf8')));
  assert.equal(water.roles.find(role => role.name === '马修').selectable, false);
});


test('First English requires explicit level review and contains only short complete learner dialogues', async () => {
  const recipe = JSON.parse(await readFile('content/preschool-review-scenes.json', 'utf8'));
  const catalog = JSON.parse(await readFile('src/review-clips.json', 'utf8'));
  const beginners = catalog.filter(scene => scene.cohort === 'younger-age-5');
  assert.equal(beginners.length, 9);
  for (const entry of beginners) {
    const reviewed = recipe.scenes.find(scene => scene.publicSlug === entry.slug);
    assert.equal(reviewed.beginnerSuitable, true);
    const scene = validateScene(JSON.parse(await readFile(`public/scenes/${entry.slug}/scene.json`, 'utf8')));
    assert.ok(scene.lines.every(line => line.text.split(/\s+/).length <= 5));
    assert.ok(new Set(scene.lines.map(line => line.roleId)).size >= 2);
    assert.ok(scene.lines.filter((line, i, lines) => !i || line.roleId !== lines[i - 1].roleId).length >= 3);
    assert.ok(scene.roles.every(role => role.portrait));
  }
  const previous = recipe.scenes.filter(scene => scene.beginnerSuitable === false);
  assert.equal(previous.length, 14);
  for (const scene of previous) assert.equal(catalog.find(entry => entry.slug === scene.publicSlug).cohort, 'older-audience');
});
