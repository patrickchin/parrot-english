import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, validatePack, loadContent, loadScene } from '../src/content-pack.ts';
import { catalog, pack, documents, contentBase } from './fixtures/content-pack.mjs';

test('runtime discovery validates one published index without fetching pack or scene files before selection', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, url.endsWith('/catalog.json') ? 'no-cache' : 'default');
    assert.ok(documents.has(url), `Unexpected content request: ${url}`);
    return Response.json(documents.get(url));
  };
  const loaded = await loadContent(contentBase + 'catalog.json');
  assert.equal(loaded.clips.length, 2);
  assert.deepEqual(requests, [contentBase + 'catalog.json']);
  assert.equal(new Set(loaded.clips.map(clip => clip.packId)).size, 1);
  assert.deepEqual(loaded.packs, [{ id: pack.id, title: pack.title, franchise: pack.franchise, uploader: 'Patrick', description: pack.description,
    author: pack.author, sceneCount: pack.scenes.length, poster: loaded.clips[0].poster }]);
  const clip = loaded.clips[0];
  const scene = await loadScene(clip);
  assert.deepEqual(requests, [contentBase + 'catalog.json', clip.manifest]);
  assert.equal(scene.id, clip.id);
  assert.ok(scene.base.startsWith(contentBase));
  assert.equal(loaded.locales.en.scenes[scene.id].title, scene.title);
  await assert.rejects(loadScene({ ...clip, id: 'scene_wrong' }), /sceneInvalid/);
});

test('refresh reads the current catalog so withdrawn or updated releases cannot reappear from cache', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let current = catalog;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    if (url.endsWith('/catalog.json')) {
      assert.equal(options.cache, 'no-cache');
      return Response.json(current);
    }
    assert.equal(options.cache, 'default');
    return Response.json(documents.get(url));
  };
  assert.equal((await loadContent(contentBase + 'catalog.json')).packs.length, 1);
  current = { version: 1, packs: [], packData: {} };
  requests.length = 0;
  assert.deepEqual(await loadContent(contentBase + 'catalog.json'), { clips: [], packs: [], locales: {} });
  assert.deepEqual(requests, [contentBase + 'catalog.json']);
  current = { version: 1, packs: [{ ...catalog.packs[0], manifest: 'releases/upl_new/packs/pack_fixture/pack.json' }], packData: { [pack.id]: pack } };
  requests.length = 0;
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    if (url.endsWith('/catalog.json')) { assert.equal(options.cache, 'no-cache'); return Response.json(current); }
    return Response.json(pack);
  };
  const updated = await loadContent(contentBase + 'catalog.json');
  assert.ok(updated.clips.every(clip => clip.manifest.startsWith(contentBase + 'releases/upl_new/')));
  assert.deepEqual(requests, [contentBase + 'catalog.json']);
});

test('pack trust boundaries reject traversal, unsupported versions, collisions and oversized responses', async t => {
  for (const value of [{ ...catalog, version: 99 }, { version: 1, packs: [catalog.packs[0], catalog.packs[0]] }, { version: 1, packs: [{ ...catalog.packs[0], manifest: '../secret.json' }] }]) assert.throws(() => validateCatalog(value));
  for (const change of [
    p => { p.title = '   '; },
    p => { p.franchise = '   '; },
    p => { p.scenes[0].manifest = '../scene.json'; },
    p => { p.scenes[1].id = p.scenes[0].id; },
    p => { p.scenes[1].routeSlug = p.scenes[0].routeSlug ?? p.scenes[0].slug; },
    p => { p.locales.en.scenes.scene_absent = { title: 'Bad', licence: '', changes: '' }; },
    p => { p.locales.en.navigation = { library: 'Overridden UI' }; },
  ]) { const bad = structuredClone(pack); change(bad); assert.throws(() => validatePack(bad, pack.id)); }
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(' '.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
  globalThis.fetch = async () => Response.json({ ...catalog, packData: { [pack.id]: { ...pack, scenes: [{ ...pack.scenes[0], poster: 'https://tracker.example/pixel.jpg' }] } } });
  await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
});

test('discovery rejects incomplete snapshots and cross-pack collisions without a manifest fallback', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const other = { ...pack, id: 'pack_other' };
  for (const value of [
    { version: 1, packs: catalog.packs },
    { ...catalog, packData: {} },
    { ...catalog, packData: { ...catalog.packData, pack_orphan: other } },
    { version: 1, packs: [...catalog.packs, { id: other.id, manifest: 'packs/pack_other/pack.json', uploader: 'Patrick' }], packData: { [pack.id]: pack, [other.id]: other } },
  ]) {
    const requests = [];
    globalThis.fetch = async url => { requests.push(url); return Response.json(value); };
    await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
    assert.deepEqual(requests, [contentBase + 'catalog.json']);
  }
});

test('catalog retries one temporary failure, including an interrupted response body', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const failure of [
    () => { throw new TypeError('Network connection lost'); },
    () => new Response(null, { status: 503 }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Body interrupted')); } })),
  ]) {
    let requests = 0;
    globalThis.fetch = async () => ++requests === 1 ? failure() : Response.json(catalog);
    assert.equal((await loadContent(contentBase + 'catalog.json')).clips.length, 2);
    assert.equal(requests, 2);
  }
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(null, { status: 503 }); };
  await assert.rejects(loadContent(contentBase + 'catalog.json'), error => error.cause.message === 'HTTP 503');
  assert.equal(requests, 2);
});

test('catalog never retries permanent errors or invalid JSON, and abort prevents a retry', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const response of [() => new Response(null, { status: 404 }), () => new Response('{broken')]) {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return response(); };
    await assert.rejects(loadContent(contentBase + 'catalog.json'));
    assert.equal(requests, 1);
  }
  const abort = new AbortController();
  let requests = 0;
  globalThis.fetch = async () => { requests++; abort.abort(); throw abort.signal.reason; };
  await assert.rejects(loadContent(contentBase + 'catalog.json', abort.signal));
  assert.equal(requests, 1);
});

test('a stalled catalog times out and retries once', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  globalThis.fetch = async (_url, { signal }) => {
    requests++;
    if (requests > 1) return Response.json(catalog);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const loading = loadContent(contentBase + 'catalog.json');
  t.mock.timers.tick(12000);
  // Let rejection handling schedule the retry delay before advancing its clock.
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(300);
  assert.equal((await loading).clips.length, 2);
  assert.equal(requests, 2);
});
