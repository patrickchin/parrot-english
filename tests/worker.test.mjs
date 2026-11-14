import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createWorker } from '../server/worker.mjs';
test('serves application assets, health, and HEAD requests without exposing unknown paths', async () => {
  const worker = createWorker({ '/index.html': { type: 'text/html', body: 'hello', encoding: 'utf8' } }, 'test-revision');
  const get = (path, options) => worker.fetch(new Request('https://parrotbook.test' + path, options));
  assert.equal((await get('/not-present')).status, 404);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
  assert.equal(await (await get('/')).text(), 'hello');
  const head = await get('/', { method: 'HEAD' });
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), '5');
  const health = await get('/api/health');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await health.json()).revision, 'test-revision');
});

test('serves the app on page paths while missing assets and API routes stay 404', async () => {
  const worker = createWorker({ '/index.html': { type: 'text/html; charset=utf-8', body: 'app', encoding: 'utf8' } });
  const get = (path, method = 'GET') => worker.fetch(new Request('https://parrotbook.test' + path, { method }));
  for (const path of ['/dubs', '/dubs/', '/en/dubs', '/zh/dubs/', '/packs', '/en/packs', '/zh/packs/pack_test-AB_9', '/library/teens', '/scenes/patrick', '/scenes/patrick/dubs/dub_abc123', '/scenes/patrick/', '/en', '/zh/', '/en/library/teens', '/zh/scenes/toy-story-infinity', '/en/scenes/patrick/dubs/dub_abc123', '/es/', '/ja/library/teens', '/ko/dubs', '/es/scenes/patrick', '/ja/scenes/patrick/dubs/dub_abc123']) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(await response.text(), 'app');
    assert.equal(await (await get(path, 'HEAD')).text(), '');
  }
  for (const path of ['/assets/missing.js', '/packs/pack_test/pack.json', '/packs/invalid', '/scenes/missing/scene.json', '/api/missing', '/scenes/patrick/missing.js', '/en/assets/missing.js', '/zh/api/health', '/fr/scenes/patrick']) {
    assert.equal((await get(path)).status, 404);
  }
});



test('native text assets preserve Unicode JSON and byte lengths for GET and HEAD', async () => {
  const body = JSON.stringify({ title: '佩奇 🐷', line: 'Can we play?' });
  const bytes = new TextEncoder().encode(body);
  const worker = createWorker({ '/scene.json': { type: 'application/json', body, encoding: 'utf8' } });
  const get = options => worker.fetch(new Request('https://parrotbook.test/scene.json', options));
  const response = await get();
  assert.deepEqual(await response.json(), JSON.parse(body));
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  const head = await get({ method: 'HEAD' });
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  const range = await get({ headers: { Range: 'bytes=0-17' } });
  assert.equal(range.status, 200, 'ESA serves complete code and metadata; OSS handles media ranges');
  assert.equal(range.headers.get('accept-ranges'), 'none');
  assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes);
});


test('gzip text assets preserve Unicode content and ignore byte ranges of the compressed representation', async () => {
  const body = JSON.stringify({ title: '英语启蒙', lines: ['Good morning.', 'How are you?'] });
  const bytes = gzipSync(body);
  const worker = createWorker({ '/scene.json': { type: 'application/json; charset=utf-8', body: bytes.toString('base64'), encoding: 'base64', contentEncoding: 'gzip' } });
  const get = options => worker.fetch(new Request('https://parrotbook.test/scene.json', options));
  for (const options of [undefined, { headers: { Range: 'bytes=0-17' } }]) {
    const response = await get(options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(response.headers.get('accept-ranges'), 'none');
    assert.equal(response.headers.get('content-range'), null);
    assert.equal(gunzipSync(Buffer.from(await response.arrayBuffer())).toString(), body);
  }
  const head = await get({ method: 'HEAD' });
  assert.equal(head.headers.get('content-encoding'), 'gzip');
  assert.equal(head.headers.get('content-length'), String(bytes.length));
  assert.equal(await head.text(), '');
});
