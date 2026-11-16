import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Authoring updates pack metadata, never application sources or public/.
test('authoring routes by franchise and moves search text and translations without changing audience', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-authoring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const references = [];
  for (const [id, slug, cohort, franchise] of [['pack_a', 'first', 'older-audience', 'First franchise'], ['pack_b', 'second', 'younger-age-5', 'Second franchise']]) {
    const path = join(root, 'content/packs', id);
    const scene = { id: `scene_${slug}`, title: slug, tags: ['new tag'], lines: [{ text: 'Hello!', hint: '你好！' }],
      mediaBase: 'https://example.com/clips/', poster: 'poster.jpg', credit: { source: 'https://example.com/' }, roles: [{ id: `role_${slug}` }] };
    await mkdir(join(path, 'scenes', slug), { recursive: true });
    await writeFile(join(path, 'scenes', slug, 'scene.json'), JSON.stringify(scene));
    await writeFile(join(path, 'pack.json'), JSON.stringify({ id, franchise, scenes: [{ id: scene.id, slug, cohort, note: franchise, manifest: `scenes/${slug}/scene.json`, tags: [], quotes: [] }],
      locales: { en: { scenes: { [scene.id]: { title: `English ${slug}` } }, roles: { [`role_${slug}`]: { name: 'Sam' } } } } }));
    references.push({ id, manifest: `packs/${id}/pack.json` });
  }
  await writeFile(join(root, 'content/catalog.json'), JSON.stringify({ version: 1, packs: references }));
  const script = new URL('../../scripts/content-paths.mjs', import.meta.url).href;
  const program = `const {catalog, writeCatalog} = await import(process.argv[1]);
    await writeCatalog(catalog.map(entry => ({...entry, note: 'Second franchise'})));`;
  execFileSync(process.execPath, ['--input-type=module', '-e', program, script], { cwd: root });
  const load = async id => JSON.parse(await readFile(join(root, 'content/packs', id, 'pack.json'), 'utf8'));
  const first = await load('pack_a'), second = await load('pack_b');
  assert.deepEqual(first.scenes, []);
  assert.deepEqual(first.locales.en, { scenes: {}, roles: {} });
  assert.equal(second.scenes.length, 2);
  assert.deepEqual(second.scenes.map(scene => scene.cohort), ['older-audience', 'younger-age-5']);
  assert.deepEqual(second.scenes[0].tags, ['new tag']);
  assert.deepEqual(second.scenes[0].quotes, ['Hello!', '你好！']);
  assert.equal(second.locales.en.scenes.scene_first.title, 'English first');
  assert.equal(second.locales.en.roles.role_first.name, 'Sam');
  assert.equal(JSON.parse(await readFile(join(root, 'content/packs/pack_b/scenes/first/scene.json'), 'utf8')).id, 'scene_first');
});

test('shared franchises keep existing pack ownership and reject ambiguous or unknown new scenes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-authoring-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = [];
  for (const name of ['a', 'b']) {
    const folder = join(root, 'content/packs', `pack_${name}`);
    const scene = { id: `scene_${name}`, title: name, tags: [], lines: [], roles: [], credit: { source: 'https://example.com/' } };
    await mkdir(join(folder, 'scenes', name), { recursive: true });
    await writeFile(join(folder, 'scenes', name, 'scene.json'), JSON.stringify(scene));
    await writeFile(join(folder, 'pack.json'), JSON.stringify({ id: `pack_${name}`, franchise: 'Shared franchise', scenes: [{
      id: scene.id, slug: name, note: 'Shared franchise', cohort: 'older-audience', manifest: `scenes/${name}/scene.json`,
    }], locales: {} }));
    entries.push({ id: `pack_${name}`, manifest: `packs/pack_${name}/pack.json` });
  }
  await writeFile(join(root, 'content/catalog.json'), JSON.stringify({ version: 1, packs: entries }));
  const script = new URL('../../scripts/content-paths.mjs', import.meta.url).href;
  const program = `const assert = (await import('node:assert/strict')).default;
    const {catalog, writeCatalog, sceneFolder} = await import(process.argv[1]);
    assert.match(sceneFolder('a'), /pack_a/);
    assert.match(sceneFolder('b'), /pack_b/);
    assert.throws(() => sceneFolder('new', 'Shared franchise'), /Ambiguous content pack/);
    assert.throws(() => sceneFolder('new', 'Missing franchise'), /No content pack/);
    await assert.rejects(writeCatalog([...catalog, {...catalog[0], slug: 'new'}]), /Ambiguous content pack/);
    await writeCatalog(catalog.map(entry => ({...entry, cohort: 'teens'})));`;
  execFileSync(process.execPath, ['--input-type=module', '-e', program, script], { cwd: root });
  for (const name of ['a', 'b']) {
    const pack = JSON.parse(await readFile(join(root, `content/packs/pack_${name}/pack.json`), 'utf8'));
    assert.deepEqual(pack.scenes.map(scene => scene.slug), [name]);
    assert.equal(pack.scenes[0].cohort, 'teens');
  }
});

test('internet meme authoring keeps original creator labels inside the shared Memes pack', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-authoring-memes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, 'content/packs/pack_memes');
  await mkdir(join(folder, 'scenes/first'), { recursive: true });
  const scene = { id: 'scene_first', title: 'Hello', tags: ['internet', 'meme'], roles: [], lines: [], credit: { source: 'https://example.com/' } };
  const bytes = JSON.stringify(scene);
  await writeFile(join(folder, 'scenes/first/scene.json'), bytes);
  await writeFile(join(folder, 'pack.json'), JSON.stringify({ id: 'pack_memes', franchise: 'Memes', scenes: [{
    id: scene.id, slug: 'first', note: 'Original creator', tags: scene.tags, manifest: 'scenes/first/scene.json',
  }], locales: {} }));
  await writeFile(join(root, 'content/catalog.json'), JSON.stringify({ version: 1, packs: [{ id: 'pack_memes', manifest: 'packs/pack_memes/pack.json', uploader: 'Patrick' }] }));
  const script = new URL('../../scripts/content-paths.mjs', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    const assert = (await import('node:assert/strict')).default;
    const {catalog, sceneFolder, writeCatalog} = await import(process.argv[1]);
    assert.match(sceneFolder('new-clip', 'Another creator', ['internet', 'meme']), /pack_memes\\/scenes\\/new-clip$/);
    assert.throws(() => sceneFolder('new-film', 'A film', ['meme']), /No content pack/);
    await writeCatalog(catalog);
  `, script], { cwd: root });
  const pack = JSON.parse(await readFile(join(folder, 'pack.json'), 'utf8'));
  assert.equal(pack.scenes[0].note, 'Original creator');
  assert.deepEqual(pack.scenes[0].tags, ['internet', 'meme']);
  assert.equal(await readFile(join(folder, 'scenes/first/scene.json'), 'utf8'), bytes);
});
