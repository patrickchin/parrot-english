import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createWorker } from '../server/worker.mjs';
test('serves video byte ranges for mobile seeking without exposing unknown paths', async () => {
  const worker = createWorker({ '/test.mp4': { type: 'video/mp4', body: btoa('0123456789') }, '/index.html': { type: 'text/html', body: btoa('hello') } }, 'test-revision');
  const get = (path, options) => worker.fetch(new Request('https://parrotbook.test' + path, options));
  let response = await get('/test.mp4', { headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await response.text(), '2345');
  assert.equal(await (await get('/test.mp4', { headers: { Range: 'bytes=-3' } })).text(), '789');
  assert.equal(await (await get('/test.mp4', { headers: { Range: 'bytes=7-' } })).text(), '789');
  for (const Range of ['bytes=20-', 'bytes=8-3', 'bytes=-', 'bytes=0-1,3-4', 'nonsense']) assert.equal((await get('/test.mp4', { headers: { Range } })).status, 416);
  response = await get('/test.mp4', { method: 'HEAD', headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(await response.text(), ''); assert.equal(response.headers.get('content-length'), '4');
  assert.equal((await get('/not-present')).status, 404);
  assert.equal((await get('/test.mp4', { method: 'POST' })).status, 405);
  assert.equal(await (await get('/')).text(), 'hello');
  const health = await get('/api/health');
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await health.json()).revision, 'test-revision');
});

test('serves the app on page paths while missing assets and API routes stay 404', async () => {
  const worker = createWorker({ '/index.html': { type: 'text/html; charset=utf-8', body: btoa('app') } });
  const get = (path, method = 'GET') => worker.fetch(new Request('https://parrotbook.test' + path, { method }));
  for (const path of ['/dubs', '/dubs/', '/library/teens', '/scenes/patrick', '/scenes/patrick/dubs/dub_abc123', '/scenes/patrick/', '/en', '/zh/', '/en/dubs', '/zh/dubs/', '/en/library/teens', '/zh/scenes/toy-story-infinity', '/en/scenes/patrick/dubs/dub_abc123']) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(await response.text(), 'app');
    assert.equal(await (await get(path, 'HEAD')).text(), '');
  }
  for (const path of ['/assets/missing.js', '/scenes/missing/scene.json', '/api/missing', '/scenes/patrick/missing.js', '/en/assets/missing.js', '/zh/api/health', '/fr/scenes/patrick']) {
    assert.equal((await get(path)).status, 404);
  }
});


test('native text assets preserve Unicode JSON and byte lengths for GET, HEAD and ranges', async () => {
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
  assert.equal(range.status, 206);
  assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.slice(0, 18));
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
