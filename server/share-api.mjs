import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const root = 'guest-shares/';
const lifetime = 7 * 24 * 60 * 60 * 1000;
const maximumBytes = 25 * 1024 * 1024;
const idPattern = /^shr_[A-Za-z0-9_-]{24}$/;
const tokenPattern = /^cap_[A-Za-z0-9_-]{24}$/;
const lower = headers => Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
const missing = error => error?.status === 404 || error?.code === 'NoSuchKey';
const digest = value => createHash('sha256').update(value).digest();
const keys = id => ({ record: `${root}records/${id}.json`, raw: `${root}uploads/${id}/video.mp4`, video: `${root}published/${id}/video.mp4` });
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new ApiError(status, message); };

function text(value, maximum, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) reject(400, `Invalid ${label}.`);
  return value.trim();
}
function metadata(body, maxBytes) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'Provide video details.');
  const title = text(body.title, 200, 'title');
  if (!Number.isSafeInteger(body.size) || body.size < 16) reject(400, 'Invalid video size.');
  if (body.size > maxBytes) reject(413, 'The video exceeds the sharing size limit.');
  let credits;
  if (body.credits !== undefined) {
    if (!body.credits || typeof body.credits !== 'object' || Array.isArray(body.credits)) reject(400, 'Invalid source credits.');
    credits = {
      title: text(body.credits.title, 200, 'source title'),
      source: text(body.credits.source, 2048, 'source link'),
      attribution: text(body.credits.attribution, 2000, 'source attribution'),
    };
    try { if (new URL(credits.source).protocol !== 'https:') throw new Error(); }
    catch { reject(400, 'Source credits require an HTTPS link.'); }
  }
  return { title, size: body.size, ...(credits ? { credits } : {}) };
}

// ponytail: one globally serialized FC function enforces the daily quota;
// introduce transactional counters before increasing publisher concurrency.
export function createShareApi({ client, bucket = 'parrotbook-media-f6e09412', region = 'oss-cn-hongkong',
  now = Date.now, newId = prefix => `${prefix}_${randomBytes(18).toString('base64url')}`, config = {} }) {
  const maxBytes = config.maxBytes ?? maximumBytes;
  const dailyLimit = config.dailyLimit ?? 100;
  const allowedOrigins = config.allowedOrigins ?? ['https://parrotbook.com'];
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 16 || maxBytes > maximumBytes ||
      !Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100 ||
      !Array.isArray(allowedOrigins) || !allowedOrigins.length || allowedOrigins.some(origin => {
        try { return new URL(origin).origin !== origin || !/^https?:$/.test(new URL(origin).protocol); }
        catch { return true; }
      })) throw new TypeError('Invalid guest sharing configuration.');

  async function read(id) {
    let result;
    try { result = await client.get(keys(id).record, { headers: { Range: 'bytes=0-16383' } }); }
    catch (error) { if (missing(error)) reject(404, 'Shared video not found.'); throw error; }
    const bytes = Buffer.from(result.content);
    if (bytes.length > 16383) throw new Error('Invalid share record');
    const value = JSON.parse(bytes.toString('utf8'));
    if (value.id !== id || !/^[a-f0-9]{64}$/.test(value.creatorTokenHash) ||
        !Number.isFinite(Date.parse(value.expiresAt)) || !['uploading', 'published', 'revoked'].includes(value.status)) throw new Error('Invalid share record');
    return value;
  }
  async function write(key, value, create = false) {
    await client.put(key, Buffer.from(JSON.stringify(value)), { headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'x-oss-object-acl': 'private',
      ...(create ? { 'x-oss-forbid-overwrite': 'true' } : {}),
    } });
  }
  function authenticate(value, headers) {
    const token = /^Bearer (cap_[A-Za-z0-9_-]{24})$/.exec(headers.authorization ?? '')?.[1];
    if (!token || !timingSafeEqual(digest(token), Buffer.from(value.creatorTokenHash, 'hex'))) reject(401, 'A valid creator token is required.');
  }
  function available(value) {
    if (value.status === 'revoked' || Date.parse(value.expiresAt) <= now()) reject(410, 'This shared video has expired or was removed.');
  }
  const summary = value => ({ id: value.id, title: value.title, ...(value.credits ? { credits: value.credits } : {}), expiresAt: value.expiresAt });

  async function create(body) {
    const details = metadata(body, maxBytes);
    const timestamp = now(), day = new Date(timestamp).toISOString().slice(0, 10);
    const prefix = `${root}tickets/${day}/`;
    // One list is sufficient: the global function cap is 1 and tickets are
    // written before issuing upload authority. Failed creations consume a slot.
    const tickets = await client.listV2({ prefix, 'max-keys': 101 });
    if (tickets.isTruncated || (tickets.objects?.length ?? 0) >= dailyLimit) reject(429, 'Today’s sharing limit has been reached. Try again tomorrow.');
    const id = newId('shr'), creatorToken = newId('cap');
    if (!idPattern.test(id) || !tokenPattern.test(creatorToken)) throw new Error('Invalid generated share identifier');
    const value = { ...details, id, createdAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + lifetime).toISOString(),
      creatorTokenHash: digest(creatorToken).toString('hex'), status: 'uploading' };
    await write(prefix + id + '.json', { id, createdAt: value.createdAt }, true);
    await write(keys(id).record, value, true);
    const headers = { 'Content-Type': 'video/mp4', 'x-oss-object-acl': 'private' };
    // Content-Length is an OSS V4 additional signed header. Fetch supplies it
    // for a Blob body; JavaScript must not try to set this forbidden header.
    const url = await client.signatureUrlV4('PUT', 900,
      { headers: { ...headers, 'Content-Length': String(value.size) } }, keys(id).raw, ['content-length']);
    return { ...summary(value), creatorToken, upload: { url, headers, size: value.size } };
  }
  async function publish(id, headers) {
    const value = await read(id);
    authenticate(value, headers); available(value);
    if (value.status === 'published') return summary(value);
    let info;
    try { info = lower((await client.head(keys(id).raw)).res?.headers); }
    catch (error) { if (missing(error)) reject(409, 'Upload the video before publishing.'); throw error; }
    const size = Number(info['content-length']);
    if (!Number.isSafeInteger(size) || size > maxBytes) reject(413, 'The uploaded video exceeds the sharing size limit.');
    if (size !== value.size || String(info['content-type']).split(';')[0].trim().toLowerCase() !== 'video/mp4' || !info.etag) reject(400, 'The uploaded file does not match the declared MP4 video.');
    if (value.sourceEtag && value.sourceEtag !== info.etag) reject(409, 'The upload changed after publishing started. Create a new share.');
    const result = await client.get(keys(id).raw, { headers: { Range: 'bytes=0-63', 'If-Match': info.etag } });
    const prefix = Buffer.from(result.content);
    if (lower(result.res?.headers).etag !== info.etag) reject(409, 'The upload changed during validation.');
    if (prefix.length !== Math.min(size, 64) || prefix.toString('ascii', 4, 8) !== 'ftyp' || prefix.readUInt32BE(0) < 16 || prefix.readUInt32BE(0) > size) reject(400, 'The uploaded file is not an MP4 video.');
    if (!value.sourceEtag) {
      value.sourceEtag = info.etag;
      await write(keys(id).record, value);
    }
    await client.copy(keys(id).video, keys(id).raw, bucket, { headers: {
      'If-Match': info.etag, 'Content-Type': 'video/mp4', 'Cache-Control': 'private,no-store', 'x-oss-object-acl': 'private',
    } });
    value.status = 'published';
    await write(keys(id).record, value);
    return summary(value);
  }
  async function remove(id, headers) {
    const value = await read(id);
    authenticate(value, headers);
    if (value.status !== 'revoked') {
      value.status = 'revoked';
      await write(keys(id).record, value);
    }
    for (const key of [keys(id).raw, keys(id).video]) {
      try { await client.delete(key); }
      catch (error) { if (!missing(error)) throw error; }
    }
  }
  async function route(method, path, body, headers) {
    if (method === 'POST' && path === '/shares') return { status: 201, value: await create(body) };
    const match = /^\/shares\/(shr_[A-Za-z0-9_-]{24})(\/publish)?$/.exec(path);
    if (!match) reject(404, 'Sharing API route not found.');
    const id = match[1];
    if (method === 'POST' && match[2]) return { status: 200, value: await publish(id, headers) };
    if (method === 'DELETE' && !match[2]) { await remove(id, headers); return { status: 204 }; }
    if (method === 'GET' && !match[2]) {
      const value = await read(id);
      available(value);
      if (value.status !== 'published') reject(404, 'Shared video not found.');
      const seconds = Math.max(1, Math.min(120, Math.floor((Date.parse(value.expiresAt) - now()) / 1000)));
      const url = await client.signatureUrlV4('GET', seconds, {}, keys(id).video);
      return { status: 200, value: { ...summary(value), url } };
    }
    reject(404, 'Sharing API route not found.');
  }
  return async eventBuffer => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    try {
      let event, body, requestHeaders;
      try {
        event = JSON.parse(eventBuffer.toString('utf8'));
        requestHeaders = lower(event.headers);
        if (typeof event.rawPath !== 'string' || typeof event.requestContext?.http?.method !== 'string') throw new Error();
        if (event.body) {
          if (String(requestHeaders['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') reject(415, 'Use application/json.');
          const bytes = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
          if (bytes.length > 8 * 1024) reject(413, 'Sharing request is too large.');
          body = JSON.parse(bytes.toString('utf8'));
        }
      } catch (error) { if (error instanceof ApiError) throw error; reject(400, 'Malformed sharing request.'); }
      const origin = requestHeaders.origin;
      if (origin && !allowedOrigins.includes(origin)) reject(403, 'This origin cannot use the sharing API.');
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      const method = event.requestContext.http.method;
      if (method === 'OPTIONS') {
        const requestedMethod = requestHeaders['access-control-request-method'];
        const requestedHeaders = String(requestHeaders['access-control-request-headers'] ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!origin || !['GET', 'POST', 'DELETE'].includes(requestedMethod) || requestedHeaders.some(value => !['authorization', 'content-type'].includes(value))) reject(403, 'Preflight request is not allowed.');
        Object.assign(headers, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
        return { statusCode: 204, headers, body: '', isBase64Encoded: false };
      }
      const result = await route(method, event.rawPath, body, requestHeaders);
      return { statusCode: result.status, headers, body: result.value === undefined ? '' : JSON.stringify(result.value), isBase64Encoded: false };
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error?.status === 412 ? 409 : 503;
      const message = error instanceof ApiError ? error.message : status === 409 ? 'The upload changed before publication. Retry the request.' : 'Sharing storage is unavailable. Retry the request.';
      return { statusCode: status, headers, body: JSON.stringify({ error: message }), isBase64Encoded: false };
    }
  };
}

export async function handler(event, context) {
  const credentials = context?.credentials;
  if (!credentials?.accessKeyId || !credentials?.accessKeySecret || !credentials?.securityToken) return {
    statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    body: JSON.stringify({ error: 'Sharing storage access is not configured.' }), isBase64Encoded: false,
  };
  const bucket = process.env.SHARE_API_BUCKET ?? 'parrotbook-media-f6e09412';
  const region = process.env.SHARE_API_REGION ?? 'oss-cn-hongkong';
  const { default: OSS } = await import('ali-oss');
  const client = new OSS({ bucket, region, accessKeyId: credentials.accessKeyId, accessKeySecret: credentials.accessKeySecret,
    stsToken: credentials.securityToken, authorizationV4: true, secure: true });
  return createShareApi({ client, bucket, region, config: {
    allowedOrigins: [process.env.SHARE_API_ORIGIN ?? 'https://parrotbook.com'],
    dailyLimit: process.env.SHARE_API_DAILY_LIMIT ? Number(process.env.SHARE_API_DAILY_LIMIT) : 100,
  } })(event);
}
