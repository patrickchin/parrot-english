import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import shareApi from '../dist/share.js';

const { createShareApi, handler } = shareApi;
const lower = headers => Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
const path = (id, kind = 'records') => `guest-shares/${kind}/${id}${kind === 'records' ? '.json' : '/video.mp4'}`;
const video = () => { const value = Buffer.alloc(80); value.writeUInt32BE(24); value.write('ftypisom', 4); return value; };
class Storage {
  objects = new Map(); calls = []; signed = []; failPut; failCopy; failDelete; beforeCopy; truncated = false;
  seed(key, bytes, headers = {}) {
    bytes = Buffer.from(bytes);
    this.objects.set(key, { bytes, headers: { 'content-type': key.endsWith('.mp4') ? 'video/mp4' : 'application/json', ...lower(headers),
      'content-length': String(bytes.length), etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"' } });
  }
  object(key) {
    const value = this.objects.get(key);
    if (!value) throw Object.assign(new Error('NoSuchKey'), { status: 404 });
    return value;
  }
  async put(key, bytes, options) {
    this.calls.push({ method: 'put', key, options });
    if (options.headers['x-oss-forbid-overwrite'] === 'true' && this.objects.has(key)) throw Object.assign(new Error('Already exists'), { status: 409 });
    this.seed(key, bytes, options.headers);
    if (this.failPut?.(key)) throw new Error('Lost storage response');
    return {};
  }
  async head(key) { this.calls.push({ method: 'head', key }); return { res: { headers: { ...this.object(key).headers } } }; }
  async get(key, options) {
    this.calls.push({ method: 'get', key, options });
    const object = this.object(key), maximum = Number(options?.headers?.Range?.split('-')[1]);
    if (options?.headers?.['If-Match'] && options.headers['If-Match'] !== object.headers.etag) throw Object.assign(new Error('Changed'), { status: 412 });
    return { content: Number.isFinite(maximum) ? object.bytes.subarray(0, maximum + 1) : object.bytes, res: { headers: { ...object.headers } } };
  }
  async copy(destination, source, bucket, options) {
    this.calls.push({ method: 'copy', key: destination, source, options }); this.beforeCopy?.(source);
    const object = this.object(source);
    if (object.headers.etag !== options.headers['If-Match']) throw Object.assign(new Error('Changed'), { status: 412 });
    if (this.failCopy) throw new Error('Copy failed');
    this.seed(destination, object.bytes, options.headers); return {};
  }
  async delete(key) {
    this.calls.push({ method: 'delete', key });
    if (this.failDelete?.(key)) throw new Error('Delete failed');
    this.objects.delete(key); return {};
  }
  async listV2(query) {
    this.calls.push({ method: 'listV2', query });
    return { objects: [...this.objects.keys()].filter(key => key.startsWith(query.prefix)).slice(0, query['max-keys']).map(name => ({ name })), isTruncated: this.truncated };
  }
  async signatureUrlV4(method, seconds, request, key, additionalHeaders) {
    this.signed.push({ method, seconds, request, key, additionalHeaders });
    return `https://example.oss-cn-hongkong.aliyuncs.com/${key}?signed=${method}`;
  }
  json(key) { return JSON.parse(this.object(key).bytes.toString()); }
}
function setup(config = {}) {
  const storage = new Storage(); let counter = 0, time = Date.parse('2026-11-14T12:00:00Z');
  const api = createShareApi({ client: storage, config, now: () => time, newId: prefix => `${prefix}_${String(++counter).padStart(24, '0')}` });
  const call = async (method, rawPath, body, token, headers = {}) => {
    const response = await api(Buffer.from(JSON.stringify({ rawPath, requestContext: { http: { method, path: rawPath } },
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body === undefined ? '' : JSON.stringify(body), isBase64Encoded: false })));
    return { ...response, value: response.body ? JSON.parse(response.body) : undefined };
  };
  const create = async () => {
    const response = await call('POST', '/shares', { title: 'A short scene', size: video().length,
      credits: { title: 'Source scene', source: 'https://example.com/source', attribution: 'Original performance' } });
    assert.equal(response.statusCode, 201);
    return response.value;
  };
  const upload = (share, bytes = video(), headers = {}) => storage.seed(path(share.id, 'uploads'), bytes, { 'x-oss-object-acl': 'private', ...headers });
  return { storage, api, call, create, upload, advance: milliseconds => { time += milliseconds; } };
}

test('creation reserves a bounded daily ticket before granting one private, length-bound upload', async () => {
  const { storage, call, create } = setup(); const share = await create();
  assert.match(share.id, /^shr_[A-Za-z0-9_-]{24}$/); assert.match(share.creatorToken, /^cap_/);
  const state = storage.json(path(share.id));
  assert.equal(state.creatorToken, undefined); assert.equal(state.creatorTokenHash.length, 64);
  assert.equal(JSON.stringify(state).includes(share.creatorToken), false);
  assert.equal(Date.parse(share.expiresAt) - Date.parse(state.createdAt), 7 * 86400000);
  assert.equal((await call('GET', '/shares/' + share.id)).statusCode, 404);
  const signature = storage.signed[0];
  assert.deepEqual(signature.additionalHeaders, ['content-length']);
  assert.equal(signature.request.headers['Content-Length'], '80');
  assert.equal(signature.request.headers['Content-Type'], 'video/mp4');
  assert.equal(signature.request.headers['x-oss-object-acl'], 'private');
  assert.equal(signature.seconds, 900); assert.equal(share.upload.headers['Content-Length'], undefined);
  assert.equal(storage.calls[0].method, 'listV2'); assert.equal(storage.calls[0].query['max-keys'], 101);
  assert.match(storage.calls[1].key, /^guest-shares\/tickets\/2026-11-14\//);
  assert(storage.calls.filter(call => call.method === 'put').every(call => call.options.headers['x-oss-object-acl'] === 'private'));
});

test('invalid input, traversal, and unsupported requests grant no upload authority', async () => {
  const { storage, call } = setup();
  for (const [body, status] of [[{ title: 'Test', size: 25 * 1024 * 1024 + 1 }, 413], [{ title: '', size: 80 }, 400],
    [{ title: 'Test', size: 1 }, 400], [{ title: 'Test', size: 80, credits: { title: 'X', source: 'javascript:alert(1)', attribution: 'X' } }, 400]]) {
    assert.equal((await call('POST', '/shares', body)).statusCode, status);
  }
  for (const bad of ['../content/catalog.json', '%2e%2e', 'shr_short', 'shr_' + 'A'.repeat(24) + '/../../catalog.json']) {
    assert.equal((await call('GET', '/shares/' + bad)).statusCode, 404);
  }
  assert.equal((await call('GET', '/shares')).statusCode, 404);
  assert.equal(storage.calls.length, 0); assert.equal(storage.signed.length, 0);
  assert.throws(() => createShareApi({ client: storage, config: { dailyLimit: 101 } }), TypeError);
});

test('quota includes failed creations and never depends on an in-memory counter', async () => {
  const { storage, call, create, advance } = setup({ dailyLimit: 1 });
  await create();
  assert.equal((await call('POST', '/shares', { title: 'Next', size: 80 })).statusCode, 429);
  advance(86400000);
  const next = await call('POST', '/shares', { title: 'Tomorrow', size: 80 }); assert.equal(next.statusCode, 201);
  assert(storage.calls.filter(call => call.method === 'listV2').every(call => /^guest-shares\/tickets\/\d{4}-\d{2}-\d{2}\/$/.test(call.query.prefix)));
  const failed = setup({ dailyLimit: 1 });
  failed.storage.failPut = key => key.includes('/records/');
  assert.equal((await failed.call('POST', '/shares', { title: 'Lost response', size: 80 })).statusCode, 503);
  assert.equal((await failed.call('POST', '/shares', { title: 'Retry creation', size: 80 })).statusCode, 429);
  assert.equal(failed.storage.signed.length, 0);
  const truncated = setup(); truncated.storage.truncated = true;
  assert.equal((await truncated.call('POST', '/shares', { title: 'Test', size: 80 })).statusCode, 429);
});

test('publication requires creator authority and verifies size, MIME, MP4 signature, and source ETag', async () => {
  const { storage, call, create, upload } = setup(); const share = await create(); const url = '/shares/' + share.id;
  assert.equal((await call('POST', url + '/publish')).statusCode, 401);
  assert.equal((await call('POST', url + '/publish', undefined, 'cap_' + 'Z'.repeat(24))).statusCode, 401);
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 409);
  upload(share, video(), { 'Content-Type': 'video/webm' });
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 400);
  upload(share, Buffer.alloc(80));
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 400);
  upload(share, Buffer.alloc(81));
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 400);
  const bounded = setup({ maxBytes: 80 }); const smaller = await bounded.create();
  bounded.upload(smaller, Buffer.alloc(81));
  assert.equal((await bounded.call('POST', '/shares/' + smaller.id + '/publish', undefined, smaller.creatorToken)).statusCode, 413);
  assert.equal(bounded.storage.json(path(smaller.id)).status, 'uploading');
  upload(share); storage.beforeCopy = key => storage.seed(key, Buffer.alloc(80));
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 409);
  assert.equal(storage.json(path(share.id)).status, 'uploading');
  assert.equal((await call('GET', url)).statusCode, 404);
});

test('publish activates a private copy last, is idempotent after lost responses, and returns only short GET authority', async () => {
  const { storage, call, create, upload } = setup(); const share = await create(), url = '/shares/' + share.id;
  upload(share); storage.failCopy = true;
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 503);
  assert.equal((await call('GET', url)).statusCode, 404);
  storage.failCopy = false;
  storage.failPut = key => key === path(share.id) && storage.json(key).status === 'published';
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 503);
  const copies = storage.calls.filter(call => call.method === 'copy').length;
  storage.failPut = undefined;
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 200);
  assert.equal(storage.calls.filter(call => call.method === 'copy').length, copies);
  const response = await call('GET', url);
  assert.equal(response.statusCode, 200); assert.deepEqual(response.value.credits, share.credits);
  assert.equal(response.value.creatorTokenHash, undefined); assert.equal(response.value.creatorToken, undefined);
  assert.equal(response.headers['Cache-Control'], 'no-store'); assert.equal(response.headers['X-Robots-Tag'], 'noindex');
  const signed = storage.signed.at(-1); assert.equal(signed.method, 'GET'); assert.equal(signed.seconds, 120);
  assert.equal(storage.object(path(share.id, 'published')).headers['x-oss-object-acl'], 'private');
  const finalPut = storage.calls.filter(call => call.method === 'put').at(-1);
  assert.equal(finalPut.key, path(share.id)); assert.equal(storage.json(finalPut.key).status, 'published');
  assert(storage.calls.every(call => !call.key || call.key.startsWith('guest-shares/')));
});

test('expiry stops discovery and publication and limits GET signatures to remaining link lifetime', async () => {
  const { call, create, upload, advance, storage } = setup(); const share = await create(), url = '/shares/' + share.id;
  upload(share); await call('POST', url + '/publish', undefined, share.creatorToken);
  advance(7 * 86400000 - 30000);
  assert.equal((await call('GET', url)).statusCode, 200); assert.equal(storage.signed.at(-1).seconds, 30);
  advance(30000);
  assert.equal((await call('GET', url)).statusCode, 410);
  assert.equal((await call('POST', url + '/publish', undefined, share.creatorToken)).statusCode, 410);
});

test('revocation commits before deletion, retries cleanup safely, and cannot be performed by a different creator', async () => {
  const { storage, call, create, upload } = setup(); const share = await create(), other = await create(), url = '/shares/' + share.id;
  upload(share); await call('POST', url + '/publish', undefined, share.creatorToken);
  assert.equal((await call('DELETE', url, undefined, other.creatorToken)).statusCode, 401);
  storage.failDelete = key => key.includes('/published/');
  assert.equal((await call('DELETE', url, undefined, share.creatorToken)).statusCode, 503);
  assert.equal(storage.json(path(share.id)).status, 'revoked'); assert.equal((await call('GET', url)).statusCode, 410);
  storage.failDelete = undefined;
  assert.equal((await call('DELETE', url, undefined, share.creatorToken)).statusCode, 204);
  assert.equal((await call('DELETE', url, undefined, share.creatorToken)).statusCode, 204);
  assert(!storage.objects.has(path(share.id, 'published'))); assert(!storage.objects.has(path(share.id, 'uploads')));
  assert(storage.calls.filter(call => call.method === 'delete').every(call => /guest-shares\/(uploads|published)\/shr_[A-Za-z0-9_-]{24}\/video.mp4/.test(call.key)));
  assert(storage.objects.has(path(share.id)));
});

test('public native trigger CORS preflight grants no storage access and rejects other origins', async () => {
  const { storage, call } = setup();
  const response = await call('OPTIONS', '/shares', undefined, undefined, { Origin: 'https://parrotbook.com',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' });
  assert.equal(response.statusCode, 204); assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://parrotbook.com');
  assert.equal((await call('OPTIONS', '/shares', undefined, undefined, { Origin: 'https://other.example', 'Access-Control-Request-Method': 'POST' })).statusCode, 403);
  assert.equal((await call('POST', '/shares', { title: 'X', size: 80 }, undefined, { Origin: 'https://other.example' })).statusCode, 403);
  assert.equal(storage.calls.length, 0);
  assert.equal((await handler(Buffer.from('{}'), {})).statusCode, 503);
});

test('real OSS SDK signs Content-Length and preserves private destination copy headers without network calls', async () => {
  const require = createRequire(new URL('../package.json', import.meta.url)); const OSS = require('ali-oss');
  const client = new OSS({ bucket: 'parrotbook-media-f6e09412', region: 'oss-cn-hongkong', accessKeyId: 'test-id', accessKeySecret: 'test-secret', authorizationV4: true, secure: true });
  const signed = new URL(await client.signatureUrlV4('PUT', 900, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '80', 'x-oss-object-acl': 'private' } }, 'guest-shares/uploads/test/video.mp4', ['content-length']));
  assert.equal(signed.searchParams.get('x-oss-additional-headers'), 'content-length');
  let request;
  client.request = async value => { request = value; return { data: { ETag: 'etag', LastModified: 'now' }, res: {} }; };
  await client.copy('guest-shares/published/test/video.mp4', 'guest-shares/uploads/test/video.mp4', client.options.bucket, { headers: {
    'If-Match': 'etag', 'Content-Type': 'video/mp4', 'Cache-Control': 'private,no-store', 'x-oss-object-acl': 'private',
  } });
  assert.equal(request.headers['x-oss-copy-source-if-match'], 'etag');
  assert.equal(request.headers['x-oss-object-acl'], 'private');
  assert.equal(request.headers['x-oss-metadata-directive'], 'REPLACE');
});
