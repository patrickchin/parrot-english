import { randomBytes, createHash } from 'node:crypto';
import { posix } from 'node:path';
import { validateCatalog, validatePack, relativeContentPath, storageUrl } from '../src/content-pack.ts';
import { validateScene } from '../src/scene.ts';
import { validateWaveform } from '../src/waveform.ts';

export const ownerBucket = 'parrotbook-media-f6e09412';
export const ownerRegion = 'oss-cn-hongkong';
const MiB = 1024 * 1024;
const contentRoot = 'content/';
const catalogKey = contentRoot + 'catalog.json';
const ownerIndexKey = contentRoot + 'owner-packs.json';
const mime = { json: 'application/json', mp4: 'video/mp4', m4a: 'audio/mp4', jpg: 'image/jpeg' };
const limits = { json: 2 * MiB, mp4: 100 * MiB, m4a: 100 * MiB, jpg: 10 * MiB };
const sessionId = value => typeof value === 'string' && /^upl_[A-Za-z0-9_-]{1,80}$/.test(value);
const packId = value => typeof value === 'string' && /^pack_[A-Za-z0-9_-]{1,80}$/.test(value);
const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');
const extension = path => path.split('.').at(-1);
const lowerHeaders = headers => Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
const notFound = error => error?.status === 404 || error?.code === 'NoSuchKey';

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new ApiError(status, message); };

function fileList(files) {
  if (!Array.isArray(files) || !files.length || files.length > 256) reject(400, 'Choose between 1 and 256 pack files.');
  const seen = new Set(); let total = 0, metadata = 0;
  const result = files.map(file => {
    if (!file || !relativeContentPath(file.path, 'json|mp4|m4a|jpg') || seen.has(file.path)) reject(400, 'Pack file paths must be safe and unique.');
    const ext = extension(file.path);
    if (file.type !== mime[ext] || !Number.isSafeInteger(file.size) || file.size <= 0) reject(400, `Invalid file size or type: ${file.path}`);
    if (file.size > limits[ext]) reject(413, `File is too large: ${file.path}`);
    total += file.size; if (ext === 'json') metadata += file.size;
    seen.add(file.path);
    return { path: file.path, size: file.size, type: file.type };
  });
  if (!seen.has('pack.json')) reject(400, 'The selected folder must contain pack.json.');
  if (total > 512 * MiB || metadata > 8 * MiB) reject(413, 'Pack exceeds its total media or JSON size limit.');
  return result;
}

// HTTP bearer verification belongs to the native FC trigger. The function
// has one globally reserved invocation, making it the sole catalog writer.
export function createOwnerApi({ client, bucket = ownerBucket, region = ownerRegion, revision = null,
  displayName = 'Patrick', allowedOrigin = 'https://parrotbook.com', now = Date.now, newId = () => 'upl_' + randomBytes(12).toString('base64url') }) {
  const origin = `https://${bucket}.${region}.aliyuncs.com`;
  const base = origin + '/' + contentRoot;
  let active = 0; const waiting = [];
  async function store(method, ...args) {
    await new Promise(resolve => {
      const enter = () => { active++; resolve(); };
      if (active < 8) enter(); else waiting.push(enter);
    });
    try { return await client[method](...args); }
    finally { active--; waiting.shift()?.(); }
  }
  async function parallel(items, work) {
    const result = new Array(items.length); let cursor = 0, failed = false, failure;
    await Promise.all(Array.from({ length: Math.min(items.length, 8) }, async () => {
      while (!failed && cursor < items.length) {
        const index = cursor++;
        try { result[index] = await work(items[index], index); }
        catch (error) { failed = true; failure = error; }
      }
    }));
    if (failed) throw failure;
    return result;
  }
  async function head(key, maximum, optional = false) {
    let response;
    try { response = await store('head', key); }
    catch (error) {
      if (optional && notFound(error)) return undefined;
      if (notFound(error)) reject(400, `A referenced file is missing: ${key}`);
      throw error;
    }
    const headers = lowerHeaders(response.res?.headers);
    const size = Number(headers['content-length']);
    if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) reject(413, `Referenced file has an invalid size: ${key}`);
    return { size, etag: headers.etag, type: String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() };
  }
  async function readJson(key, maximum = 2 * MiB, optional = false) {
    const info = await head(key, maximum, optional);
    if (!info) return undefined;
    const response = await store('get', key, { headers: { Range: `bytes=0-${maximum}` } });
    const bytes = Buffer.from(response.content);
    if (bytes.length > maximum) reject(413, `JSON file is too large: ${key}`);
    const etag = lowerHeaders(response.res?.headers).etag;
    if (!info.etag || etag !== info.etag || bytes.length !== info.size) reject(409, 'A content file changed while it was being read. Retry the request.');
    try { return { value: JSON.parse(bytes.toString('utf8')), info }; }
    catch { reject(400, `Invalid JSON file: ${key}`); }
  }
  async function putJson(key, value, acl = 'private') {
    await store('put', key, jsonBytes(value), { headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'x-oss-object-acl': acl,
    } });
  }
  async function catalog() {
    const stored = await readJson(catalogKey, 64 * 1024, true);
    return stored ? validateCatalog(stored.value) : { version: 1, packs: [] };
  }
  async function ownerIndex() {
    const stored = await readJson(ownerIndexKey, 64 * 1024, true);
    return stored ? validateCatalog(stored.value) : { version: 1, packs: [] };
  }
  const combine = (index, current) => [...new Map([...index.packs, ...current.packs].map(entry => [entry.id, entry])).values()];
  const entryOf = result => ({ id: result.id, manifest: result.manifest, uploader: result.uploader });
  const uploadRoot = id => `${contentRoot}uploads/${id}/`;
  const rawRoot = id => uploadRoot(id) + 'files/';
  async function session(id) {
    if (!sessionId(id)) reject(404, 'Upload session not found.');
    const stored = await readJson(uploadRoot(id) + 'upload.json', 256 * 1024, true);
    if (!stored || stored.value.id !== id) reject(404, 'Upload session not found.');
    stored.value.files = fileList(stored.value.files);
    const completed = await readJson(uploadRoot(id) + 'result.json', 64 * 1024, true);
    return { ...stored.value, result: completed?.value };
  }
  async function sealPublication(entry) {
    const match = /^releases\/(upl_[A-Za-z0-9_-]{1,80})\/packs\/(pack_[A-Za-z0-9_-]{1,80})\/pack\.json$/.exec(entry.manifest);
    if (!match) return;
    const value = await session(match[1]), expected = value.prepared?.result;
    if (!value.result && expected?.id === entry.id && expected.manifest === entry.manifest) {
      // Finish a possibly lost publication response before withdrawing discovery;
      // its later retry must return a result rather than reactivate the pack.
      await putJson(uploadRoot(value.id) + 'result.json', expected);
    }
  }
  async function plan(value) {
    if (value.result) return { id: value.id, uploads: [], published: value.result };
    const uploads = await parallel(value.files, async file => {
      const headers = { 'Content-Type': file.type, 'x-oss-object-acl': 'private' };
      const url = await client.signatureUrlV4('PUT', 900, { headers }, rawRoot(value.id) + file.path);
      return { path: file.path, url, headers };
    });
    return { id: value.id, uploads };
  }
  function assetKey(path, baseUrl, ext) {
    if (!/^https:\/\//.test(path) && !relativeContentPath(path, ext)) reject(400, 'Unsafe media path.');
    try { return new URL(storageUrl(path, baseUrl, ext)).pathname.slice(1); }
    catch { reject(400, 'Unsafe media path.'); }
  }
  async function draft(value) {
    const files = new Map(value.files.map(file => [file.path, file]));
    const infos = new Map(await parallel(value.files, async file => {
      const info = await head(rawRoot(value.id) + file.path, limits[extension(file.path)]);
      if (info.size !== file.size || info.type !== file.type || !info.etag) reject(400, `Uploaded file does not match its declared size or type: ${file.path}`);
      return [file.path, info];
    }));
    const referenced = new Set(['pack.json']), loaded = new Map();
    async function json(path, maximum = 2 * MiB) {
      if (!files.has(path) || extension(path) !== 'json') reject(400, `Missing referenced JSON file: ${path}`);
      if (infos.get(path).size > maximum) reject(413, `JSON file is too large: ${path}`);
      referenced.add(path);
      if (!loaded.has(path)) loaded.set(path, readJson(rawRoot(value.id) + path, maximum));
      const data = await loaded.get(path);
      if (data.info.etag !== infos.get(path).etag) reject(409, 'An uploaded file changed during validation. Retry the request.');
      return data.value;
    }
    const rawPack = await json('pack.json');
    const pack = validatePack(rawPack, rawPack?.id);
    const prefix = `${contentRoot}releases/${value.id}/packs/${pack.id}/`;
    const packUrl = origin + '/' + prefix + 'pack.json';
    const entities = [], roleIds = new Set();
    const remote = new Map();
    function media(key, ext) {
      if (key.startsWith(prefix)) {
        const path = key.slice(prefix.length);
        if (!files.has(path) || extension(path) !== ext) reject(400, `Missing referenced media file: ${path}`);
        referenced.add(path);
      } else {
        if (!/^(clips|content\/releases)\//.test(key)) reject(400, 'Media references must use public OSS content.');
        remote.set(key, ext);
      }
    }
    await parallel(pack.scenes, async summary => {
      const scenePath = summary.manifest;
      const sceneUrl = new URL(scenePath, packUrl).href;
      const scene = validateScene(await json(scenePath, 512 * 1024), new URL('.', sceneUrl).href);
      if (scene.id !== summary.id) reject(400, 'Scene ID does not match its pack summary.');
      entities.push(scene.id, ...scene.roles.map(role => role.id), ...scene.lines.map(line => line.id));
      scene.roles.forEach(role => roleIds.add(role.id));
      if (scene.waveform) {
        const wave = validateWaveform(await json(posix.join(posix.dirname(scenePath), scene.waveform)));
        if (wave.duration !== scene.duration) reject(400, 'Waveform duration does not match its scene.');
      }
      const mediaBase = scene.mediaBase ?? scene.base;
      if (new URL(mediaBase).origin !== origin) reject(400, 'Media must use the configured OSS origin.');
      for (const [name, ext] of [[scene.video, 'mp4'], [scene.backing, 'm4a'], [scene.poster, 'jpg'], ...scene.roles.map(role => [role.portrait, 'jpg'])]) {
        if (name) media(assetKey(name, mediaBase, ext), ext);
      }
      media(assetKey(summary.poster, packUrl, 'jpg'), 'jpg');
    });
    for (const locale of Object.values(pack.locales ?? {})) {
      if (Object.keys(locale.roles).some(id => !roleIds.has(id))) reject(400, 'Pack translations refer to an absent role.');
    }
    await parallel([...remote], async ([key, ext]) => {
      const info = await head(key, limits[ext]);
      if (info.type !== mime[ext]) reject(400, `Referenced media has an invalid type: ${key}`);
    });
    const copies = [...referenced].sort().map(path => ({ ...files.get(path), etag: infos.get(path).etag }));
    const fingerprint = createHash('sha256').update(JSON.stringify(copies)).digest('hex');
    if (value.prepared && value.prepared.fingerprint !== fingerprint) reject(409, 'This upload changed after publication started. Create a new upload session.');
    return { session: value, pack, entities, copies, fingerprint, prefix,
      result: { id: pack.id, title: pack.title, ...(pack.franchise === undefined ? {} : { franchise: pack.franchise }), uploader: displayName,
        manifest: prefix.slice(contentRoot.length) + 'pack.json', sceneCount: pack.scenes.length } };
  }
  async function published(entry) {
    const key = contentRoot + entry.manifest;
    const pack = validatePack((await readJson(key)).value, entry.id);
    const entities = [];
    await parallel(pack.scenes, async summary => {
      const sceneKey = posix.join(posix.dirname(key), summary.manifest);
      const scene = validateScene((await readJson(sceneKey, 512 * 1024)).value, new URL('.', origin + '/' + sceneKey).href);
      if (scene.id !== summary.id) reject(400, 'A published scene does not match its pack summary.');
      entities.push(scene.id, ...scene.roles.map(role => role.id), ...scene.lines.map(line => line.id));
    });
    return { pack, entities };
  }
  function collisions(items) {
    const ids = new Set(), slugs = new Set(), routes = new Set(), packIds = new Set();
    for (const { pack, entities } of items) {
      if (packIds.has(pack.id)) reject(409, `Duplicate pack ID: ${pack.id}`);
      packIds.add(pack.id);
      for (const id of entities) { if (ids.has(id)) reject(409, `Duplicate content ID: ${id}`); ids.add(id); }
      for (const scene of pack.scenes) {
        const route = scene.routeSlug ?? scene.slug;
        if (slugs.has(scene.slug) || routes.has(route)) reject(409, 'Scene routes must be unique across published packs.');
        slugs.add(scene.slug); routes.add(route);
      }
    }
  }
  async function publish(ids, replaceCatalog = false) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !sessionId(id)) || new Set(ids).size !== ids.length) reject(400, 'Provide unique upload session IDs.');
    const values = await parallel(ids, session);
    const current = await catalog();
    // The catalog write may succeed immediately before the client loses its
    // response or the private result write fails. Recover without recopying.
    for (const value of values) {
      const expected = value.prepared?.result;
      const currentManifest = current.packs.find(pack => pack.id === expected?.id)?.manifest ?? null;
      if (expected && currentManifest !== expected.manifest && currentManifest !== value.prepared.previousManifest) reject(409, 'This pack has changed since this publication started. Create a new upload session.');
      if (!value.result && expected && current.packs.some(pack => pack.id === expected.id && pack.manifest === expected.manifest)) {
        await putJson(uploadRoot(value.id) + 'result.json', expected); value.result = expected;
      }
    }
    if (values.every(value => value.result)) return values.map(value => value.result);
    if (replaceCatalog && values.some(value => value.result && !current.packs.some(entry => entry.manifest === value.result.manifest && entry.id === value.result.id))) reject(409, 'A previously published pack was withdrawn. Create a new upload session before including it in a replacement.');
    const fresh = await parallel(values.filter(value => !value.result), draft);
    const incoming = values.map(value => value.result ?? fresh.find(item => item.session.id === value.id).result);
    if (new Set(incoming.map(result => result.id)).size !== incoming.length) reject(409, 'An atomic publication may contain each pack only once.');
    const replacing = new Set(fresh.map(item => item.pack.id));
    const retained = replaceCatalog ? [] : current.packs.filter(entry => !replacing.has(entry.id));
    const prior = await parallel(retained, published);
    const completed = replaceCatalog ? await parallel(values.filter(value => value.result), value => published(value.result)) : [];
    collisions([...prior, ...completed, ...fresh]);
    const next = validateCatalog({ version: 1, packs: [
      ...retained, ...(replaceCatalog ? incoming : fresh.map(item => item.result)).map(entryOf),
    ] });
    for (const item of fresh) {
      if (!item.session.prepared) {
        item.session.prepared = { fingerprint: item.fingerprint, result: item.result, previousManifest: current.packs.find(entry => entry.id === item.pack.id)?.manifest ?? null };
        const { result, ...state } = item.session;
        await putJson(uploadRoot(item.session.id) + 'upload.json', state);
      }
    }
    await parallel(fresh, async item => {
      await parallel(item.copies, file => store('copy', item.prefix + file.path, rawRoot(item.session.id) + file.path, bucket, { headers: {
        'If-Match': file.etag, 'x-oss-object-acl': 'public-read',
        'Content-Type': file.type, 'Cache-Control': 'public,max-age=31536000,immutable',
      } }));
    });
    await parallel(current.packs.filter(entry => !next.packs.some(pack => pack.id === entry.id)), sealPublication);
    await putJson(catalogKey, next, 'public-read');
    const index = await ownerIndex();
    await putJson(ownerIndexKey, { version: 1, packs: combine(index, next) });
    await parallel(fresh, item => putJson(uploadRoot(item.session.id) + 'result.json', item.result));
    return incoming;
  }
  async function route(method, path, body) {
    if (method === 'GET' && path === '/session') return { authenticated: true, revision };
    if (method === 'POST' && path === '/uploads') {
      const value = { id: newId(), createdAt: now(), files: fileList(body?.files) };
      if (!sessionId(value.id)) throw new Error('Invalid generated upload ID');
      await putJson(uploadRoot(value.id) + 'upload.json', value);
      return plan(value);
    }
    const upload = /^\/uploads\/(upl_[A-Za-z0-9_-]{1,80})(\/publish)?$/.exec(path);
    if (upload && method === 'GET' && !upload[2]) return plan(await session(upload[1]));
    if (upload && method === 'POST' && upload[2]) return (await publish([upload[1]]))[0];
    if (method === 'POST' && path === '/publish') {
      if (body?.replaceCatalog !== undefined && typeof body.replaceCatalog !== 'boolean') reject(400, 'replaceCatalog must be a boolean.');
      return { packs: await publish(body?.uploads, body?.replaceCatalog === true) };
    }
    if (method === 'GET' && path === '/packs') {
      const current = await catalog(), index = await ownerIndex();
      const packs = await parallel(combine(index, current), async entry => {
        const { pack } = await published(entry);
        return { ...entry, title: pack.title, ...(pack.franchise === undefined ? {} : { franchise: pack.franchise }),
          sceneCount: pack.scenes.length, visible: current.packs.some(value => value.id === entry.id) };
      });
      return { packs };
    }
    const managed = /^\/packs\/(pack_[A-Za-z0-9_-]{1,80})$/.exec(path);
    if (managed && packId(managed[1]) && ['PATCH', 'DELETE'].includes(method)) {
      const current = await catalog(), index = await ownerIndex();
      const entries = combine(index, current), entry = entries.find(value => value.id === managed[1]);
      if (!entry) {
        if (method === 'DELETE') return { id: managed[1], deleted: true };
        reject(404, 'Pack not found.');
      }
      if (method === 'PATCH' && typeof body?.visible !== 'boolean') reject(400, 'visible must be a boolean.');
      if (method === 'DELETE' || !body.visible) await sealPublication(entry);
      if (method === 'DELETE') {
        await putJson(catalogKey, { ...current, packs: current.packs.filter(value => value.id !== entry.id) }, 'public-read');
        await putJson(ownerIndexKey, { version: 1, packs: entries.filter(value => value.id !== entry.id) });
        return { id: entry.id, deleted: true };
      }
      if (!body.visible) {
        // Capture the visible entry before removing discovery, so a failed
        // catalog write leaves the same visible pack and a retry is harmless.
        await putJson(ownerIndexKey, { version: 1, packs: entries });
        await putJson(catalogKey, { ...current, packs: current.packs.filter(value => value.id !== entry.id) }, 'public-read');
      } else {
        const next = current.packs.filter(value => value.id !== entry.id);
        collisions(await parallel([...next, entry], published));
        await putJson(catalogKey, validateCatalog({ version: 1, packs: [...next, entry] }), 'public-read');
      }
      return { id: entry.id, visible: body.visible };
    }
    reject(404, 'Owner API route not found.');
  }
  return async eventBuffer => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      let event, body;
      try {
        event = JSON.parse(eventBuffer.toString('utf8'));
        if (typeof event.rawPath !== 'string' || typeof event.requestContext?.http?.method !== 'string') throw new Error('Invalid event');
        if (event.body) {
          if (!String(lowerHeaders(event.headers)['content-type'] ?? '').toLowerCase().startsWith('application/json')) reject(415, 'Use application/json.');
          const bytes = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
          if (bytes.length > 128 * 1024) reject(413, 'Owner API request is too large.');
          body = JSON.parse(bytes.toString('utf8'));
        }
      } catch (error) { if (error instanceof ApiError) throw error; reject(400, 'Malformed owner API request.'); }
      const requestHeaders = lowerHeaders(event.headers);
      if (requestHeaders.origin && requestHeaders.origin !== allowedOrigin) reject(403, 'This origin cannot use the owner API.');
      if (requestHeaders.origin) { headers['Access-Control-Allow-Origin'] = allowedOrigin; headers.Vary = 'Origin'; }
      if (event.requestContext.http.method === 'OPTIONS') {
        const requested = String(requestHeaders['access-control-request-headers'] ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (requestHeaders.origin !== allowedOrigin || !['GET', 'POST', 'PATCH', 'DELETE'].includes(requestHeaders['access-control-request-method']) || requested.some(value => !['authorization', 'content-type'].includes(value))) reject(403, 'Preflight request is not allowed.');
        Object.assign(headers, { 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
        return { statusCode: 204, headers, body: '', isBase64Encoded: false };
      }
      const value = await route(event.requestContext.http.method, event.rawPath, body);
      return { statusCode: 200, headers, body: JSON.stringify(value), isBase64Encoded: false };
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error?.status === 412 ? 409 :
        /^errors\./.test(error?.message ?? '') ? 400 : 503;
      const message = error instanceof ApiError ? error.message : status === 409 ? 'An uploaded file changed before it could be published.' :
        status === 400 ? 'Invalid content pack or scene metadata.' : 'Content storage is unavailable. Retry the request.';
      return { statusCode: status, headers, body: JSON.stringify({ error: message }), isBase64Encoded: false };
    }
  };
}

export async function handler(event, context) {
  const credentials = context?.credentials;
  if (!credentials?.accessKeyId || !credentials?.accessKeySecret || !credentials?.securityToken) return {
    statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ error: 'Owner API storage access is not configured.' }), isBase64Encoded: false,
  };
  const bucket = process.env.OWNER_API_BUCKET ?? ownerBucket;
  const region = process.env.OWNER_API_REGION ?? ownerRegion;
  const { default: OSS } = await import('ali-oss');
  const client = new OSS({ bucket, region, accessKeyId: credentials.accessKeyId, accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken, authorizationV4: true, secure: true });
  return createOwnerApi({ client, bucket, region, displayName: process.env.OWNER_DISPLAY_NAME ?? 'Patrick', allowedOrigin: process.env.OWNER_API_ORIGIN ?? 'https://parrotbook.com', revision: process.env.OWNER_API_REVISION ?? null })(event);
}
