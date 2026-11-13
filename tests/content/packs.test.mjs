import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir, readdir, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDirectory, stageDirectory, publishDirectory, bucket } from '../../scripts/content.mjs';

async function stagedFiles(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...(await stagedFiles(join(folder, entry.name))).map(path => entry.name + '/' + path));
    else files.push(entry.name);
  }
  return files.sort();
}

test('staging is deterministic, includes only referenced content, and rejects symlink escapes', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-packs-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const first = await stageDirectory('content', join(folder, 'first'));
  const second = await stageDirectory('content', join(folder, 'second'));
  assert.equal(first.revision, second.revision);
  assert.deepEqual(first.catalog, second.catalog);
  assert.equal(first.sceneCount, 116);
  assert.equal(first.files.size, 236);
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
  assert.equal(commands[0][commands[0].indexOf('--cache-control') + 1], 'public,max-age=31536000,immutable');
  assert.equal(commands[1][commands[1].indexOf('--cache-control') + 1], 'no-store');
  assert.equal(commands[1][commands[1].indexOf('--content-type') + 1], 'application/json');
  await writeFile(log, ''); await writeFile(cli, fakeCli(true));
  await assert.rejects(publishDirectory('content'), /Alibaba CLI failed/);
  const failedCommands = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(failedCommands.length, 1);
  assert.ok(!failedCommands[0].some(arg => arg.endsWith('/content/catalog.json')));
});
