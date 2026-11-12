import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Authoring updates pack metadata, never application sources or public/.
test('authoring refreshes search text and moves scenes and translations between packs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'parrotbook-authoring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const references = [];
  for (const [id, slug, cohort] of [['pack_a', 'first', 'older-audience'], ['pack_b', 'second', 'younger-age-5']]) {
    const path = join(root, 'content/packs', id);
    const scene = { id: `scene_${slug}`, title: slug, tags: ['new tag'], lines: [{ text: 'Hello!', hint: '你好！' }],
      mediaBase: 'https://example.com/clips/', poster: 'poster.jpg', credit: { source: 'https://example.com/' }, roles: [{ id: `role_${slug}` }] };
    await mkdir(join(path, 'scenes', slug), { recursive: true });
    await writeFile(join(path, 'scenes', slug, 'scene.json'), JSON.stringify(scene));
    await writeFile(join(path, 'pack.json'), JSON.stringify({ id, scenes: [{ id: scene.id, slug, cohort, manifest: `scenes/${slug}/scene.json`, tags: [], quotes: [] }],
      locales: { en: { scenes: { [scene.id]: { title: `English ${slug}` } }, roles: { [`role_${slug}`]: { name: 'Sam' } } } } }));
    references.push({ id, manifest: `packs/${id}/pack.json` });
  }
  await writeFile(join(root, 'content/catalog.json'), JSON.stringify({ version: 1, packs: references }));
  const script = new URL('../scripts/content-paths.mjs', import.meta.url).href;
  const program = `const {catalog, writeCatalog} = await import(process.argv[1]);
    await writeCatalog(catalog.map(entry => ({...entry, cohort: 'younger-age-5'})));`;
  execFileSync(process.execPath, ['--input-type=module', '-e', program, script], { cwd: root });
  const load = async id => JSON.parse(await readFile(join(root, 'content/packs', id, 'pack.json'), 'utf8'));
  const first = await load('pack_a'), second = await load('pack_b');
  assert.deepEqual(first.scenes, []);
  assert.deepEqual(first.locales.en, { scenes: {}, roles: {} });
  assert.equal(second.scenes.length, 2);
  assert.deepEqual(second.scenes[0].tags, ['new tag']);
  assert.deepEqual(second.scenes[0].quotes, ['Hello!', '你好！']);
  assert.equal(second.locales.en.scenes.scene_first.title, 'English first');
  assert.equal(second.locales.en.roles.role_first.name, 'Sam');
  assert.equal(JSON.parse(await readFile(join(root, 'content/packs/pack_b/scenes/first/scene.json'), 'utf8')).id, 'scene_first');
});
