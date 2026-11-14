import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import ownerApi from '../dist/index.js';

const { createOwnerApi, handler } = ownerApi;
const origin = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com';
const types = { json: 'application/json', mp4: 'video/mp4', m4a: 'audio/mp4', jpg: 'image/jpeg' };
const encode = value => Buffer.from(JSON.stringify(value));
const normalize = headers => Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));

class Storage {
  objects = new Map(); calls = []; active = 0; maximum = 0; copyFailure; beforePutFailure; afterPutFailure; beforeCopy;
  seed(key, bytes, headers = {}) {
    bytes = Buffer.from(bytes);
    this.objects.set(key, { bytes, headers: { 'content-type': types[key.split('.').at(-1)] ?? 'application/json', ...normalize(headers),
      'content-length': String(bytes.length), etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"' } });
  }
  object(key) {
    const value = this.objects.get(key);
    if (!value) throw Object.assign(new Error('NoSuchKey'), { status: 404, code: 'NoSuchKey' });
    return value;
  }
  async operation(method, key, work) {
    this.calls.push({ method, key }); this.active++; this.maximum = Math.max(this.maximum, this.active);
    try { await new Promise(resolve => setImmediate(resolve)); return await work(); }
    finally { this.active--; }
  }
  head(key) { return this.operation('head', key, () => ({ res: { headers: { ...this.object(key).headers } } })); }
  get(key, options) {
    return this.operation('get', key, () => {
      const object = this.object(key), range = options?.headers?.Range?.match(/^bytes=0-(\d+)$/);
      return { content: range ? object.bytes.subarray(0, Number(range[1]) + 1) : object.bytes, res: { headers: { ...object.headers } } };
    });
  }
  put(key, bytes, options) {
    return this.operation('put', key, () => {
      if (this.beforePutFailure?.(key)) throw new Error('Storage rejected this write.');
      this.seed(key, bytes, options?.headers);
      if (this.afterPutFailure?.(key)) throw new Error('The response was lost after storage committed.');
      return {};
    });
  }
  copy(destination, source, bucket, options) {
    return this.operation('copy', destination, () => {
      this.beforeCopy?.(source);
      const object = this.object(source);
      if (object.headers.etag !== options.headers['If-Match']) throw Object.assign(new Error('PreconditionFailed'), { status: 412 });
      if (this.copyFailure?.(destination)) throw new Error('Copy temporarily failed.');
      this.seed(destination, object.bytes, options.headers);
      return {};
    });
  }
  async signatureUrlV4(method, expires, { headers }, key) {
    assert.equal(method, 'PUT'); assert.equal(expires, 900);
    assert.equal(headers['x-oss-object-acl'], 'private');
    return `${origin}/${key}?signature=test-only`;
  }
  json(key) { return JSON.parse(this.object(key).bytes.toString('utf8')); }
}

function packageFiles(name = 'alpha') {
  const scene = {
    version: 1, id: `scene_${name}`, title: 'Say hello', description: '', duration: 1,
    video: 'video.mp4', poster: 'poster.jpg', waveform: 'waveform.json',
    roles: [{ id: `role_${name}`, name: 'Sam', label: 'Sam', hint: 'One line' }],
    lines: [{ id: `line_${name}`, roleId: `role_${name}`, start: 0, end: 0.8, text: 'Hello.', hint: '' }],
    credit: { title: 'Original hello', attribution: 'Sam', source: 'https://example.com/original', licence: 'Test', licenceUrl: 'https://example.com/licence', changes: '' },
  };
  const pack = { version: 1, id: `pack_${name}`, title: `${name} scenes`, franchise: 'Sam stories', author: 'Sam', description: '', scenes: [{
    id: scene.id, slug: name, title: scene.title, english: 'Hello.', note: 'Sam stories', source: scene.credit.source,
    cohort: 'older-audience', tags: [], quotes: ['Hello.'], manifest: `scenes/${name}/scene.json`, poster: `scenes/${name}/poster.jpg`,
  }] };
  return new Map([
    ['pack.json', encode(pack)], [`scenes/${name}/scene.json`, encode(scene)],
    [`scenes/${name}/waveform.json`, encode({ version: 2, duration: 1, step: 0.005, peaks: Array(200).fill(0.1) })],
    [`scenes/${name}/video.mp4`, Buffer.from('video-A')], [`scenes/${name}/poster.jpg`, Buffer.from('poster')],
  ]);
}

function setup() {
  const storage = new Storage(); let counter = 0;
  const api = createOwnerApi({ client: storage, newId: () => `upl_test${++counter}`, now: () => 1234, revision: 'test-revision' });
  const call = async (method, path, body, options = {}) => {
    const response = await api(Buffer.from(JSON.stringify({ rawPath: path, requestContext: { http: { method, path } },
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body), isBase64Encoded: false, ...options })));
    return { ...response, value: JSON.parse(response.body) };
  };
  return { storage, api, call };
}

async function upload(state, files) {
  const response = await state.call('POST', '/uploads', { files: [...files].map(([path, bytes]) => ({ path, size: bytes.length, type: types[path.split('.').at(-1)] })) });
  assert.equal(response.statusCode, 200, response.body);
  for (const item of response.value.uploads) {
    assert.ok(item.url.includes(`/content/uploads/${response.value.id}/files/`));
    state.storage.seed(new URL(item.url).pathname.slice(1), files.get(item.path), item.headers);
  }
  return response.value.id;
}

function published(storage, files, release = 'known') {
  const pack = JSON.parse(files.get('pack.json'));
  const prefix = `content/releases/${release}/packs/${pack.id}/`;
  for (const [path, bytes] of files) storage.seed(prefix + path, bytes, { 'x-oss-object-acl': 'public-read' });
  const entry = { id: pack.id, uploader: 'Patrick', manifest: prefix.slice('content/'.length) + 'pack.json' };
  const current = storage.objects.has('content/catalog.json') ? storage.json('content/catalog.json') : { version: 1, packs: [] };
  storage.seed('content/catalog.json', encode({ ...current, packs: [...current.packs, entry] }));
  return entry;
}

test('native role configuration is required and FC event bodies use the documented shape', async () => {
  const unavailable = await handler(Buffer.from('{}'), {});
  assert.equal(unavailable.statusCode, 503);
  const state = setup();
  assert.equal((await state.call('GET', '/session')).value.revision, 'test-revision');
  assert.equal((await state.call('POST', '/uploads', undefined, { body: '{bad' })).statusCode, 400);
  assert.equal((await state.call('POST', '/uploads', undefined, { headers: { 'Content-Type': 'text/plain' }, body: '{}' })).statusCode, 415);
  const base64 = await state.call('POST', '/uploads', undefined, { body: encode({ files: [] }).toString('base64'), isBase64Encoded: true });
  assert.equal(base64.statusCode, 400);
  assert.equal((await state.api(Buffer.from('{}'))).statusCode, 400);
});

test('upload plans reject unsafe, duplicate and oversized input and isolate raw files from private state', async () => {
  const state = setup(), valid = { path: 'pack.json', size: 10, type: 'application/json' };
  for (const files of [[], [{ ...valid, path: '../pack.json' }], [valid, valid], [{ ...valid, path: 'index.html' }], [{ ...valid, size: 0 }], [{ ...valid, type: 'text/javascript' }]]) {
    assert.equal((await state.call('POST', '/uploads', { files })).statusCode, 400);
  }
  assert.equal((await state.call('POST', '/uploads', { files: [{ ...valid, size: 2 * 1024 * 1024 + 1 }] })).statusCode, 413);
  const files = packageFiles(); files.set('upload.json', Buffer.from('private note'));
  const id = await upload(state, files);
  assert.equal(state.storage.json(`content/uploads/${id}/upload.json`).id, id);
  const refresh = await state.call('GET', `/uploads/${id}`);
  assert.equal(refresh.value.uploads.length, files.size);
  assert.ok(refresh.value.uploads.every(item => item.headers['x-oss-object-acl'] === 'private'));
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 200);
  assert.ok(![...state.storage.objects.keys()].some(key => /^content\/releases\/.+\/upload\.json$/.test(key)));
});

test('publication copies referenced files server-side and activates catalog last while preserving unrelated packs', async () => {
  const state = setup();
  const original = published(state.storage, packageFiles('original'));
  const id = await upload(state, packageFiles('new'));
  state.storage.calls = [];
  const response = await state.call('POST', `/uploads/${id}/publish`);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.value, { id: 'pack_new', title: 'new scenes', franchise: 'Sam stories', uploader: 'Patrick', manifest: `releases/${id}/packs/pack_new/pack.json`, sceneCount: 1 });
  assert.deepEqual(state.storage.json('content/catalog.json').packs, [original, { id: response.value.id, manifest: response.value.manifest, uploader: 'Patrick' }]);
  const activation = state.storage.calls.findIndex(call => call.method === 'put' && call.key === 'content/catalog.json');
  assert.ok(activation > state.storage.calls.findLastIndex(call => call.method === 'copy'));
  assert.equal(state.storage.calls.filter(call => call.method === 'copy').length, 5);
  assert.ok(state.storage.calls.filter(call => call.method === 'get').every(call => call.key.endsWith('.json')));
  assert.ok(state.storage.calls.filter(call => call.method === 'put').every(call => call.key.endsWith('.json')));
  const before = state.storage.calls.length;
  assert.deepEqual((await state.call('POST', `/uploads/${id}/publish`)).value, response.value);
  assert.ok(state.storage.calls.slice(before).every(call => call.method !== 'copy' && call.method !== 'put'));
  assert.equal((await state.call('GET', `/uploads/${id}`)).value.uploads.length, 0);
  assert.ok(state.storage.maximum <= 8);
});

test('validation failures never activate missing, unsafe, malformed, duplicate or unavailable content', async () => {
  for (const mutate of [
    (files, state, id) => state.storage.objects.delete(`content/uploads/${id}/files/scenes/alpha/poster.jpg`),
    files => { const pack = JSON.parse(files.get('pack.json')); pack.franchise = ' '; files.set('pack.json', encode(pack)); },
    files => { const pack = JSON.parse(files.get('pack.json')); pack.scenes[0].poster = 'https://'; files.set('pack.json', encode(pack)); },
    files => { const scene = JSON.parse(files.get('scenes/alpha/scene.json')); scene.video = 'poster.jpg'; files.set('scenes/alpha/scene.json', encode(scene)); },
    files => { const scene = JSON.parse(files.get('scenes/alpha/scene.json')); scene.mediaBase = origin + '/content/uploads/upl_private/files/'; files.set('scenes/alpha/scene.json', encode(scene)); },
    files => { const pack = JSON.parse(files.get('pack.json')); pack.scenes[0].manifest = '../outside.json'; files.set('pack.json', encode(pack)); },
    files => { const pack = JSON.parse(files.get('pack.json')); pack.locales = { en: { scenes: {}, roles: { role_absent: { name: 'Sam', hint: '' } } } }; files.set('pack.json', encode(pack)); },
    files => { const wave = JSON.parse(files.get('scenes/alpha/waveform.json')); wave.duration = 2; files.set('scenes/alpha/waveform.json', encode(wave)); },
    files => { const scene = JSON.parse(files.get('scenes/alpha/scene.json')); scene.mediaBase = origin + '/clips/unavailable/'; files.set('scenes/alpha/scene.json', encode(scene)); },
  ]) {
    const state = setup(), files = packageFiles();
    // Most mutations alter source files before the direct upload. Missing-object
    // mutation needs the stored upload ID and is applied afterward instead.
    if (mutate.length < 3) mutate(files);
    const id = await upload(state, files);
    if (mutate.length === 3) mutate(files, state, id);
    const response = await state.call('POST', `/uploads/${id}/publish`);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(state.storage.objects.has('content/catalog.json'), false);
    assert.equal(state.storage.calls.some(call => call.method === 'copy'), false);
  }
  const state = setup(); published(state.storage, packageFiles());
  const duplicate = packageFiles(); const raw = JSON.parse(duplicate.get('pack.json')); raw.id = 'pack_duplicate'; duplicate.set('pack.json', encode(raw));
  const id = await upload(state, duplicate);
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 409);
  assert.equal(state.storage.json('content/catalog.json').packs.length, 1);
});

test('copy failures and changed staging ETags cannot replace an active catalog or poison immutable release URLs', async () => {
  const state = setup(), original = published(state.storage, packageFiles('original'));
  const id = await upload(state, packageFiles());
  state.storage.copyFailure = key => key.endsWith('scene.json');
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, [original]);
  state.storage.copyFailure = undefined;
  state.storage.seed(`content/uploads/${id}/files/scenes/alpha/video.mp4`, Buffer.from('video-B'));
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 409);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, [original]);

  const other = setup(), otherId = await upload(other, packageFiles()); let swapped = false;
  other.storage.beforeCopy = source => { if (!swapped && source.endsWith('video.mp4')) { swapped = true; other.storage.seed(source, Buffer.from('video-B')); } };
  assert.equal((await other.call('POST', `/uploads/${otherId}/publish`)).statusCode, 409);
  assert.equal(other.storage.objects.has('content/catalog.json'), false);
});

test('a lost activation response recovers idempotently from the prepared manifest', async () => {
  const state = setup(), id = await upload(state, packageFiles()); let once = true;
  state.storage.afterPutFailure = key => key === 'content/catalog.json' && once && (once = false, true);
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
  const copies = state.storage.calls.filter(call => call.method === 'copy').length;
  const result = await state.call('POST', `/uploads/${id}/publish`);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.value.id, 'pack_alpha');
  assert.equal(state.storage.calls.filter(call => call.method === 'copy').length, copies);
});

test('batch activation is atomic and explicit replacement avoids reading withdrawn packs', async () => {
  const state = setup(), original = published(state.storage, packageFiles('original'));
  const first = await upload(state, packageFiles('first')), second = await upload(state, packageFiles('second'));
  state.storage.copyFailure = key => key.endsWith('second/scene.json');
  assert.equal((await state.call('POST', '/publish', { uploads: [first, second] })).statusCode, 503);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, [original]);
  state.storage.copyFailure = undefined;
  const result = await state.call('POST', '/publish', { uploads: [first, second] });
  assert.equal(result.statusCode, 200, result.body); assert.equal(result.value.packs.length, 2);
  assert.deepEqual(state.storage.json('content/catalog.json').packs.map(pack => pack.id), ['pack_original', 'pack_first', 'pack_second']);

  const bootstrap = setup(), old = published(bootstrap.storage, packageFiles('old'));
  bootstrap.storage.seed('content/' + old.manifest, Buffer.from('{invalid JSON'));
  const id = await upload(bootstrap, packageFiles('replacement'));
  bootstrap.storage.calls = [];
  assert.equal((await bootstrap.call('POST', '/publish', { uploads: [id], replaceCatalog: true })).statusCode, 200);
  assert.deepEqual(bootstrap.storage.json('content/catalog.json').packs.map(pack => pack.id), ['pack_replacement']);
  assert.ok(!bootstrap.storage.calls.some(call => call.method === 'get' && call.key === 'content/' + old.manifest));
});

test('deletion removes management and discovery while retaining immutable pack and media objects', async () => {
  const state = setup(), id = await upload(state, packageFiles());
  const published = await state.call('POST', `/uploads/${id}/publish`);
  const before = [...state.storage.objects.keys()].sort();
  const result = await state.call('DELETE', '/packs/pack_alpha');
  assert.equal(result.statusCode, 200);
  assert.equal((await state.call('DELETE', '/packs/pack_alpha')).statusCode, 200);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
  assert.deepEqual((await state.call('GET', '/packs')).value.packs, []);
  assert.deepEqual([...state.storage.objects.keys()].sort(), before);
  assert.ok(state.storage.objects.has('content/' + published.value.manifest));
  assert.deepEqual((await state.call('POST', `/uploads/${id}/publish`)).value, published.value);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
});


test('owner list unions visible packs with the private index and hide/show preserves a server-assigned uploader', async () => {
  const state = setup(), files = packageFiles();
  const pack = JSON.parse(files.get('pack.json')); pack.author = 'Untrusted uploader'; files.set('pack.json', encode(pack));
  const id = await upload(state, files);
  const result = await state.call('POST', `/uploads/${id}/publish`);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.value.uploader, 'Patrick');
  state.storage.objects.delete('content/owner-packs.json');
  let list = await state.call('GET', '/packs');
  assert.equal(list.value.packs[0].visible, true); assert.equal(list.value.packs[0].uploader, 'Patrick');
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: 'no' })).statusCode, 400);
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 200);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
  list = await state.call('GET', '/packs');
  assert.equal(list.value.packs[0].visible, false);
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: true })).statusCode, 200);
  assert.equal((await state.call('GET', '/packs')).value.packs[0].visible, true);
});

test('hide writes its private record first and showing a hidden pack checks current global collisions', async () => {
  const state = setup(); published(state.storage, packageFiles());
  state.storage.afterPutFailure = key => key === 'content/owner-packs.json';
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 503);
  assert.equal(state.storage.json('content/catalog.json').packs.length, 1);
  state.storage.afterPutFailure = undefined;
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 200);
  const duplicate = packageFiles(), pack = JSON.parse(duplicate.get('pack.json'));
  pack.id = 'pack_other'; duplicate.set('pack.json', encode(pack)); published(state.storage, duplicate, 'other');
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: true })).statusCode, 409);
  assert.deepEqual(state.storage.json('content/catalog.json').packs.map(entry => entry.id), ['pack_other']);
});

test('a stale lost-result retry cannot overwrite a later publication of the same pack', async () => {
  const state = setup(), id = await upload(state, packageFiles()); let once = true;
  state.storage.afterPutFailure = key => key === 'content/catalog.json' && once && (once = false, true);
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
  state.storage.afterPutFailure = undefined;
  const newer = await upload(state, packageFiles());
  const result = await state.call('POST', `/uploads/${newer}/publish`);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 409);
  assert.equal(state.storage.json('content/catalog.json').packs[0].manifest, result.value.manifest);
});

test('installed OSS SDK signs required PUT headers and emits source ETag conditions with replacement metadata', async () => {
  const { createRequire } = await import('node:module');
  const OSS = createRequire(import.meta.url)('ali-oss');
  const client = new OSS({ bucket: 'parrotbook-media-f6e09412', region: 'oss-cn-hongkong',
    accessKeyId: 'test-only-access', accessKeySecret: 'test-only-secret', stsToken: 'test-only-token', authorizationV4: true, secure: true });
  const key = 'content/uploads/upl_test/files/pack.json';
  const signed = await client.signatureUrlV4('PUT', 900, { headers: { 'Content-Type': 'application/json', 'x-oss-object-acl': 'private' } }, key);
  const changed = await client.signatureUrlV4('PUT', 900, { headers: { 'Content-Type': 'text/plain', 'x-oss-object-acl': 'private' } }, key);
  assert.equal(new URL(signed).searchParams.get('x-oss-signature-version'), 'OSS4-HMAC-SHA256');
  assert.notEqual(new URL(signed).searchParams.get('x-oss-signature'), new URL(changed).searchParams.get('x-oss-signature'));
  let request;
  client.request = async params => { request = params; return { data: { ETag: 'copied' }, res: { headers: {} } }; };
  await client.copy('content/releases/upl_test/packs/pack_test/pack.json', key, 'parrotbook-media-f6e09412', { headers: {
    'If-Match': '"validated-etag"', 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=31536000,immutable', 'x-oss-object-acl': 'public-read',
  } });
  const headers = normalize(request.headers);
  assert.equal(headers['x-oss-copy-source-if-match'], '"validated-etag"');
  assert.equal(headers['x-oss-metadata-directive'], 'REPLACE');
  assert.equal(headers['x-oss-object-acl'], 'public-read');
  assert.equal(headers['cache-control'], 'public,max-age=31536000,immutable');
});


test('packs can omit franchise and continue to identify their managed uploader separately from the author', async () => {
  const state = setup(), files = packageFiles();
  const pack = JSON.parse(files.get('pack.json')); delete pack.franchise; files.set('pack.json', encode(pack));
  const id = await upload(state, files), result = await state.call('POST', `/uploads/${id}/publish`);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.value.uploader, 'Patrick'); assert.equal('franchise' in result.value, false);
  const list = await state.call('GET', '/packs');
  assert.equal(list.value.packs[0].uploader, 'Patrick'); assert.equal('franchise' in list.value.packs[0], false);
});


test('a failed private index update after activation still leaves the visible pack manageable', async () => {
  const state = setup(), id = await upload(state, packageFiles());
  state.storage.beforePutFailure = key => key === 'content/owner-packs.json';
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
  assert.equal(state.storage.objects.has('content/owner-packs.json'), false);
  const packs = (await state.call('GET', '/packs')).value.packs;
  assert.equal(packs[0].id, 'pack_alpha'); assert.equal(packs[0].visible, true);
  state.storage.beforePutFailure = undefined;
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 200);
  assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 200);
  assert.equal((await state.call('GET', '/packs')).value.packs[0].visible, false);
});


test('a completed older upload cannot be used in a replacement batch to revert a newer version', async () => {
  const state = setup(), first = await upload(state, packageFiles());
  assert.equal((await state.call('POST', `/uploads/${first}/publish`)).statusCode, 200);
  const second = await upload(state, packageFiles());
  const current = await state.call('POST', `/uploads/${second}/publish`);
  assert.equal(current.statusCode, 200);
  const other = await upload(state, packageFiles('other'));
  assert.equal((await state.call('POST', '/publish', { uploads: [first, other], replaceCatalog: true })).statusCode, 409);
  assert.deepEqual(state.storage.json('content/catalog.json').packs.map(entry => entry.manifest), [current.value.manifest]);
});


test('hide, delete and catalog replacement seal a lost publication result before removing discovery', async () => {
  for (const action of ['hide', 'delete', 'replace']) {
    const state = setup(), id = await upload(state, packageFiles()); let once = true;
    state.storage.afterPutFailure = key => key === 'content/catalog.json' && once && (once = false, true);
    assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
    assert.equal(state.storage.objects.has(`content/uploads/${id}/result.json`), false);
    state.storage.afterPutFailure = undefined;
    if (action === 'hide') assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 200);
    if (action === 'delete') assert.equal((await state.call('DELETE', '/packs/pack_alpha')).statusCode, 200);
    if (action === 'replace') {
      const next = await upload(state, packageFiles('next'));
      assert.equal((await state.call('POST', '/publish', { uploads: [next], replaceCatalog: true })).statusCode, 200);
    }
    assert.equal(state.storage.json(`content/uploads/${id}/result.json`).id, 'pack_alpha');
    const before = state.storage.json('content/catalog.json');
    assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 200);
    assert.deepEqual(state.storage.json('content/catalog.json'), before);
    assert.ok(!before.packs.some(entry => entry.id === 'pack_alpha'));
  }
});

test('a failed publication-result seal leaves visibility unchanged for a safe management retry', async () => {
  const state = setup(), id = await upload(state, packageFiles()); let once = true;
  state.storage.afterPutFailure = key => key === 'content/catalog.json' && once && (once = false, true);
  assert.equal((await state.call('POST', `/uploads/${id}/publish`)).statusCode, 503);
  state.storage.afterPutFailure = undefined;
  state.storage.beforePutFailure = key => key === `content/uploads/${id}/result.json`;
  assert.equal((await state.call('DELETE', '/packs/pack_alpha')).statusCode, 503);
  assert.equal(state.storage.json('content/catalog.json').packs[0].id, 'pack_alpha');
  state.storage.beforePutFailure = undefined;
  assert.equal((await state.call('DELETE', '/packs/pack_alpha')).statusCode, 200);
  assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
});


test('a mixed replacement cannot resurrect a previously hidden or deleted completed upload', async () => {
  for (const method of ['hide', 'delete']) {
    const state = setup(), first = await upload(state, packageFiles());
    assert.equal((await state.call('POST', `/uploads/${first}/publish`)).statusCode, 200);
    if (method === 'hide') assert.equal((await state.call('PATCH', '/packs/pack_alpha', { visible: false })).statusCode, 200);
    else assert.equal((await state.call('DELETE', '/packs/pack_alpha')).statusCode, 200);
    const other = await upload(state, packageFiles('other'));
    assert.equal((await state.call('POST', '/publish', { uploads: [first, other], replaceCatalog: true })).statusCode, 409);
    assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
    assert.equal((await state.call('POST', `/uploads/${first}/publish`)).statusCode, 200);
    assert.deepEqual(state.storage.json('content/catalog.json').packs, []);
  }
});


test('owner preflight covers management methods without touching storage and only admits its exact browser origin', async () => {
  const { api, storage } = setup();
  const request = (method, headers) => api(Buffer.from(JSON.stringify({ rawPath: '/packs/pack_alpha', requestContext: { http: { method } }, headers })));
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await request('OPTIONS', { origin: 'https://parrotbook.com', 'access-control-request-method': method, 'access-control-request-headers': 'authorization,content-type' });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://parrotbook.com');
    assert.match(response.headers['Access-Control-Allow-Methods'], new RegExp(method));
  }
  assert.deepEqual(storage.calls, []);
  assert.equal((await request('OPTIONS', { origin: 'https://untrusted.example', 'access-control-request-method': 'DELETE' })).statusCode, 403);
  assert.equal((await request('GET', { origin: 'https://untrusted.example' })).statusCode, 403);
  assert.equal((await request('OPTIONS', { origin: 'https://parrotbook.com', 'access-control-request-method': 'DELETE', 'access-control-request-headers': 'cookie' })).statusCode, 403);
});
