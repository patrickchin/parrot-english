import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDirectory, stageDirectory, publishDirectory, removePack, contentBase } from '../../scripts/content.mjs';

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
  assert.equal(first.sceneCount, 128);
  assert.equal(first.catalog.packs.length, 21);
  assert.equal(first.files.size, 277);
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
  await writeFile(join(unsafe, 'catalog.json'), JSON.stringify({ version: 1, packs: [{ id: 'pack_test', manifest: 'outside/pack.json', uploader: 'Patrick' }] }));
  await symlink(join(process.cwd(), 'content'), join(unsafe, 'outside'));
  await assert.rejects(validateDirectory(unsafe), /Symlinks/);
});

test('pack URLs stay stable across unrelated changes and include all shared local references', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-independent-packs-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const source = join(folder, 'source');
  await mkdir(join(source, 'packs/shared'), { recursive: true });
  const catalog = { version: 1, packs: ['a', 'b'].map(name => ({ id: `pack_${name}`, manifest: `packs/pack_${name}.json`, uploader: 'Patrick' })) };
  await writeFile(join(source, 'catalog.json'), JSON.stringify(catalog));
  const packs = [];
  for (const name of ['a', 'b']) {
    const scene = {
      version: 1, id: `scene_${name}`, title: name, description: '', duration: 1, video: 'video.mp4',
      roles: [{ id: `role_${name}`, name: 'Sam', label: 'Sam', hint: '' }],
      lines: [{ id: `line_${name}`, roleId: `role_${name}`, start: 0, end: 1, text: 'Hello.', hint: '' }],
      credit: { title: '', attribution: '', source: 'https://example.com/source', licence: '', licenceUrl: 'https://example.com/licence', changes: '' },
    };
    const pack = { version: 1, id: `pack_${name}`, title: name, franchise: `Franchise ${name}`, description: '', author: 'Sam', scenes: [{
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

test('CLI publication uses private signed PUTs then one atomic owner API batch, with explicit replacement only', async t => {
  const originalFetch = globalThis.fetch, originalUrl = process.env.OWNER_API_URL, originalToken = process.env.OWNER_API_TOKEN;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [['OWNER_API_URL', originalUrl], ['OWNER_API_TOKEN', originalToken]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.OWNER_API_URL = 'https://owner.example.test'; process.env.OWNER_API_TOKEN = 'test-owner-token';
  const requests = [], uploaded = new Map(); let counter = 0, active = 0, maximum = 0, failUpload = false, failApi = false, unsafePlan = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input), body = options.method === 'PUT' ? options.body : options.body && JSON.parse(options.body);
    requests.push({ url, method: options.method, body });
    assert.equal(options.redirect, 'error');
    if (url.origin === 'https://owner.example.test') {
      assert.equal(options.headers.Authorization, 'Bearer test-owner-token');
      if (failApi) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (url.pathname === '/uploads') {
        const id = 'upl_test' + ++counter;
        assert.ok(body.files.some(file => file.path === 'pack.json'));
        assert.ok(body.files.every(file => !file.path.startsWith('packs/') && file.size > 0));
        return Response.json({ id, uploads: body.files.map(file => ({ path: file.path,
          url: `${new URL(contentBase).origin}/content/uploads/${id}/files/${unsafePlan ? '../unsafe.json' : file.path}?signature=test-only`,
          headers: { 'Content-Type': file.type, 'x-oss-object-acl': 'private' },
        })) });
      }
      if (url.pathname === '/publish') return Response.json({ packs: body.uploads.map(id => {
        const pack = uploaded.get(id);
        assert.ok(pack, 'all pack manifests must upload before catalog activation');
        return { id: pack.id, title: pack.title, uploader: 'Patrick', manifest: `releases/${id}/packs/${pack.id}/pack.json`, sceneCount: pack.scenes.length };
      }) });
      if (url.pathname === '/packs/pack_example') return Response.json({ id: 'pack_example', deleted: true });
      assert.fail('Unexpected API request: ' + url.pathname);
    }
    assert.equal(url.origin, new URL(contentBase).origin);
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['x-oss-object-acl'], 'private');
    assert.ok(Buffer.isBuffer(options.body));
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve)); active--;
    const id = url.pathname.split('/')[3];
    if (url.pathname.endsWith('/pack.json')) uploaded.set(id, JSON.parse(options.body));
    return new Response(null, { status: failUpload ? 503 : 200 });
  };
  const result = await publishDirectory('content');
  assert.equal(result.catalog.packs.length, 21);
  assert.equal(requests.filter(item => item.method === 'PUT').length, 277);
  const activations = requests.filter(item => item.url.pathname === '/publish');
  assert.equal(activations.length, 1);
  assert.equal(requests.at(-1).url.pathname, '/publish');
  assert.equal(activations[0].body.uploads.length, 21);
  assert.equal(activations[0].body.replaceCatalog, undefined);
  assert.ok(maximum <= 8);
  requests.length = 0;
  await publishDirectory('content', { replaceCatalog: true });
  assert.equal(requests.at(-1).body.replaceCatalog, true);

  requests.length = 0; failUpload = true;
  await assert.rejects(publishDirectory('content'), /Pack file upload failed/);
  assert.ok(!requests.some(item => item.url.pathname === '/publish'));
  assert.equal(active, 0, 'await in-flight PUTs before reporting failure');
  requests.length = 0; failUpload = false; failApi = true;
  await assert.rejects(publishDirectory('content'), /401.*Unauthorized/);
  assert.ok(requests.every(item => item.url.origin === 'https://owner.example.test'));
  requests.length = 0; failApi = false; unsafePlan = true;
  await assert.rejects(publishDirectory('content'), /unsafe upload plan/);
  assert.ok(!requests.some(item => item.method === 'PUT'));
  unsafePlan = false; requests.length = 0;
  assert.deepEqual(await removePack('pack_example'), { id: 'pack_example', deleted: true });
  assert.deepEqual(requests.map(item => [item.method, item.url.pathname]), [['DELETE', '/packs/pack_example']]);
  await assert.rejects(removePack('../catalog.json'), /valid pack ID/);
  delete process.env.OWNER_API_TOKEN;
  await assert.rejects(publishDirectory('content'), /OWNER_API_URL and OWNER_API_TOKEN/);
});
