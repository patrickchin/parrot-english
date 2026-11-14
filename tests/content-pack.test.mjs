import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog, validatePack, loadContent, loadScene } from '../src/content-pack.ts';
import { catalog, pack, documents, contentBase } from './fixtures/content-pack.mjs';

test('runtime discovery validates hosted packs and never fetches scene media before selection', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(url); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.ok(documents.has(url), `Unexpected content request: ${url}`);
    return Response.json(documents.get(url));
  };
  const loaded = await loadContent(contentBase + 'catalog.json');
  assert.equal(loaded.clips.length, 2);
  assert.equal(requests.length, 2);
  assert.equal(new Set(loaded.clips.map(clip => clip.packId)).size, 1);
  assert.deepEqual(loaded.packs, [{ id: pack.id, title: pack.title, description: pack.description,
    author: pack.author, sceneCount: pack.scenes.length, poster: loaded.clips[0].poster }]);
  const clip = loaded.clips[0];
  const scene = await loadScene(clip);
  assert.equal(scene.id, clip.id);
  assert.ok(scene.base.startsWith(contentBase));
  assert.equal(loaded.locales.en.scenes[scene.id].title, scene.title);
  await assert.rejects(loadScene({ ...clip, id: 'scene_wrong' }), /sceneInvalid/);
});

test('pack trust boundaries reject traversal, unsupported versions, collisions and oversized responses', async t => {
  for (const value of [{ ...catalog, version: 99 }, { version: 1, packs: [catalog.packs[0], catalog.packs[0]] }, { version: 1, packs: [{ ...catalog.packs[0], manifest: '../secret.json' }] }]) assert.throws(() => validateCatalog(value));
  for (const change of [
    p => { p.title = '   '; },
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
  globalThis.fetch = async url => Response.json(url.endsWith('catalog.json') ? catalog : { ...pack, scenes: [{ ...pack.scenes[0], poster: 'https://tracker.example/pixel.jpg' }] });
  await assert.rejects(loadContent(contentBase + 'catalog.json'), /contentLoad/);
});
