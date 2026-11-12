import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir, readdir, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateCatalog, validatePack, loadContent, loadScene } from '../src/content-pack.ts';
import { validateDirectory, stageDirectory, publishDirectory, contentBase, bucket } from '../scripts/content.mjs';

async function stagedFiles(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...(await stagedFiles(join(folder, entry.name))).map(path => entry.name + '/' + path));
    else files.push(entry.name);
  }
  return files.sort();
}

test('runtime discovery validates hosted packs and never fetches scene media before selection', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    return new Response(await readFile(new URL(url).pathname.replace(/^\/content\//, 'content/')), { headers: { 'content-type': 'application/json' } });
  };
  const catalog = await loadContent(contentBase + 'catalog.json');
  assert.equal(catalog.clips.length, 79);
  assert.equal(requests.length, 5);
  assert.equal(new Set(catalog.clips.map(clip => clip.packId)).size, 4);
  const clip = catalog.clips[0];
  const scene = await loadScene(clip);
  assert.equal(scene.id, clip.id);
  assert.ok(scene.base.startsWith(contentBase));
  assert.equal(catalog.locales.en.scenes[scene.id].title.length > 0, true);
  await assert.rejects(loadScene({ ...clip, id: 'scene_wrong' }), /sceneInvalid/);
});

test('pack trust boundaries reject traversal, unsupported versions, collisions and oversized responses', async t => {
  const catalog = JSON.parse(await readFile('content/catalog.json', 'utf8'));
  const pack = JSON.parse(await readFile('content/' + catalog.packs[0].manifest, 'utf8'));
  for (const value of [{ ...catalog, version: 99 }, { version: 1, packs: [catalog.packs[0], catalog.packs[0]] }, { version: 1, packs: [{ ...catalog.packs[0], manifest: '../secret.json' }] }]) assert.throws(() => validateCatalog(value));
  for (const change of [
    p => { p.scenes[0].manifest = '../scene.json'; },
    p => { p.scenes[1].id = p.scenes[0].id; },
    p => { p.scenes[1].routeSlug = p.scenes[0].routeSlug ?? p.scenes[0].slug; },
    p => { p.locales.en.scenes.scene_absent = { title: 'Bad', licence: '', changes: '' }; },
    p => { p.locales.en.navigation = { library: 'Overridden UI' }; },
  ]) { const bad = structuredClone(pack); change(bad); assert.throws(() => validatePack(bad, pack.id)); }
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(' '.repeat(64 * 1024 + 1));
  await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
  globalThis.fetch = async url => new Response(JSON.stringify(url.endsWith('catalog.json') ? catalog : { ...pack, scenes: [{ ...pack.scenes[0], poster: 'https://tracker.example/pixel.jpg' }] }));
  await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
});

test('staging is deterministic, includes only referenced content, and rejects symlink escapes', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-packs-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const first = await stageDirectory('content', join(folder, 'first'));
  const second = await stageDirectory('content', join(folder, 'second'));
  assert.equal(first.revision, second.revision);
  assert.deepEqual(first.catalog, second.catalog);
  assert.equal(first.sceneCount, 79);
  assert.equal(first.files.size, 162);
  assert.ok(first.catalog.packs.every(pack => /^releases\/[a-f0-9]{24}\/packs\//.test(pack.manifest)));
  assert.ok([...first.files.keys()].every(path => path.startsWith('packs/')));
  const expected = first.catalog.packs.flatMap(pack => {
    const prefix = pack.manifest.slice(0, pack.manifest.indexOf('/packs/'));
    return [...first.packFiles.get(pack.id).keys()].map(path => prefix + '/' + path);
  }).sort();
  assert.deepEqual(await stagedFiles(join(first.folder, 'objects')), expected);
  assert.deepEqual(await stagedFiles(join(second.folder, 'objects')), expected);
  for (const path of expected) assert.deepEqual(await readFile(join(first.folder, 'objects', path)), await readFile(join(second.folder, 'objects', path)));
  const unsafe = join(folder, 'unsafe');
  await mkdir(unsafe);
  await writeFile(join(unsafe, 'catalog.json'), JSON.stringify({ version: 1, packs: [{ id: 'pack_test', manifest: 'outside/pack.json' }] }));
  await symlink(join(process.cwd(), 'content'), join(unsafe, 'outside'));
  await assert.rejects(validateDirectory(unsafe), /Symlinks/);
});

test('pack URLs stay stable across unrelated changes and include all shared local references', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-independent-packs-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const source = join(folder, 'source');
  await mkdir(join(source, 'packs/shared'), { recursive: true });
  const catalog = { version: 1, packs: ['a', 'b'].map(name => ({ id: `pack_${name}`, manifest: `packs/pack_${name}.json` })) };
  await writeFile(join(source, 'catalog.json'), JSON.stringify(catalog));
  const packs = [];
  for (const name of ['a', 'b']) {
    const scene = {
      version: 1, id: `scene_${name}`, title: name, description: '', duration: 1, video: 'video.mp4',
      roles: [{ id: `role_${name}`, name: 'Sam', label: 'Sam', hint: '' }],
      lines: [{ id: `line_${name}`, roleId: `role_${name}`, start: 0, end: 1, text: 'Hello.', hint: '' }],
      credit: { title: '', attribution: '', source: 'https://example.com/source', licence: '', licenceUrl: 'https://example.com/licence', changes: '' },
    };
    const pack = { version: 1, id: `pack_${name}`, title: name, description: '', author: 'Sam', scenes: [{
      id: scene.id, slug: name, title: name, english: 'Hello.', note: '', source: scene.credit.source,
      cohort: 'older-audience', poster: 'shared/poster.jpg', tags: [], quotes: [], manifest: `scenes/${name}/scene.json`,
    }] };
    packs.push(pack);
    await mkdir(join(source, `packs/scenes/${name}`), { recursive: true });
    await writeFile(join(source, `packs/pack_${name}.json`), JSON.stringify(pack));
    await writeFile(join(source, `packs/scenes/${name}/scene.json`), JSON.stringify(scene));
    await writeFile(join(source, `packs/scenes/${name}/video.mp4`), name);
  }
  await writeFile(join(source, 'packs/shared/poster.jpg'), 'shared poster');
  const first = await stageDirectory(source, join(folder, 'first'));
  assert.equal(first.files.size, 7);
  const expected = first.catalog.packs.flatMap((pack, index) => {
    const prefix = pack.manifest.slice(0, pack.manifest.lastIndexOf('/'));
    const name = ['a', 'b'][index];
    return [`${prefix}/pack_${name}.json`, `${prefix}/scenes/${name}/scene.json`, `${prefix}/scenes/${name}/video.mp4`, `${prefix}/shared/poster.jpg`];
  }).sort();
  assert.deepEqual(await stagedFiles(join(first.folder, 'objects')), expected);

  packs[1].description = 'Edited only pack B';
  await writeFile(join(source, 'packs/pack_b.json'), JSON.stringify(packs[1]));
  const edited = await stageDirectory(source, join(folder, 'edited'));
  assert.equal(first.catalog.packs[0].manifest, edited.catalog.packs[0].manifest);
  assert.notEqual(first.catalog.packs[1].manifest, edited.catalog.packs[1].manifest);
  await writeFile(join(source, 'catalog.json'), JSON.stringify({ ...catalog, packs: [catalog.packs[0]] }));
  const withdrawn = await stageDirectory(source, join(folder, 'withdrawn'));
  assert.equal(first.catalog.packs[0].manifest, withdrawn.catalog.packs[0].manifest);

  await writeFile(join(source, 'catalog.json'), JSON.stringify(catalog));
  await writeFile(join(source, 'packs/shared/poster.jpg'), 'updated shared poster');
  const shared = await stageDirectory(source, join(folder, 'shared'));
  for (let index = 0; index < 2; index++) assert.notEqual(edited.catalog.packs[index].manifest, shared.catalog.packs[index].manifest);
});

test('publication activates its catalog last and never activates a failed object upload', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-publish-'));
  const originalPath = process.env.PATH, originalFetch = globalThis.fetch;
  t.after(async () => { process.env.PATH = originalPath; globalThis.fetch = originalFetch; await rm(folder, { recursive: true, force: true }); });
  const log = join(folder, 'log');
  const cli = join(folder, 'aliyun');
  const fakeCli = fail => `#!/usr/bin/env node\nimport {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');\nprocess.exit(${fail ? 1 : 0});\n`;
  await writeFile(cli, fakeCli(false)); await chmod(cli, 0o755);
  process.env.PATH = folder + ':' + originalPath;
  globalThis.fetch = async () => new Response(null, { status: 200 });
  await publishDirectory('content');
  const commands = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(commands.length, 2);
  assert.equal(commands[0][3], `oss://${bucket}/content/`);
  assert.ok(commands[0][2].endsWith('/objects/'));
  assert.ok(commands[1].some(arg => arg.endsWith('/content/catalog.json')));
  assert.ok(commands[1].some(arg => arg.includes('Cache-Control:no-store')));
  await writeFile(log, ''); await writeFile(cli, fakeCli(true));
  await assert.rejects(publishDirectory('content'), /Alibaba CLI failed/);
  const failedCommands = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(failedCommands.length, 1);
  assert.ok(!failedCommands[0].some(arg => arg.endsWith('/content/catalog.json')));
});
