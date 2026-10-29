import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.mjs';

test('backend returns a current server time without caching and rejects unsupported routes/methods', async () => {
  const before = Date.now();
  const response = await worker.fetch(new Request('https://prototype.example/api/health'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.platform, 'Alibaba ESA');
  assert.ok(Date.parse(data.serverTime) >= before && Date.parse(data.serverTime) <= Date.now());
  assert.equal((await worker.fetch(new Request('https://prototype.example/missing'))).status, 404);
  const rejected = await worker.fetch(new Request('https://prototype.example/api/health', { method: 'POST' }));
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get('allow'), 'GET');
});
