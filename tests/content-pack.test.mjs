import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateCatalog, validatePack, loadContent, loadScene } from '../src/content-pack.ts';
import { validateDirectory, stageDirectory, publishDirectory, contentBase } from '../scripts/content.mjs';

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
  assert.equal(first.sceneCount, 79);
  assert.equal(first.files.size, 162);
  assert.ok(first.catalog.packs.every(pack => pack.manifest.startsWith('releases/' + first.revision + '/')));
  assert.ok([...first.files.keys()].every(path => path.startsWith('packs/')));
  const unsafe = join(folder, 'unsafe');
  await mkdir(unsafe);
  await writeFile(join(unsafe, 'catalog.json'), JSON.stringify({ version: 1, packs: [{ id: 'pack_test', manifest: 'outside/pack.json' }] }));
  await symlink(join(process.cwd(), 'content'), join(unsafe, 'outside'));
  await assert.rejects(validateDirectory(unsafe), /Symlinks/);
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
  assert.ok(commands[0].some(arg => arg.includes('/content/releases/')));
  assert.ok(commands[1].some(arg => arg.endsWith('/content/catalog.json')));
  assert.ok(commands[1].some(arg => arg.includes('Cache-Control:no-store')));
  await writeFile(log, ''); await writeFile(cli, fakeCli(true));
  await assert.rejects(publishDirectory('content'), /Alibaba CLI failed/);
  const failedCommands = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(failedCommands.length, 1);
  assert.ok(!failedCommands[0].some(arg => arg.endsWith('/content/catalog.json')));
});
