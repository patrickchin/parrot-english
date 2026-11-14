import { contentCatalogUrl } from './catalog';
import { relativeContentPath, storageUrl, validatePack, type Pack } from './content-pack';
import { validateScene } from './scene';

export const uploadLimits = { files: 256, total: 512 * 1024 * 1024, media: 100 * 1024 * 1024, image: 10 * 1024 * 1024, json: 2 * 1024 * 1024, metadata: 8 * 1024 * 1024 };
export type PreparedPack = { pack: Pack; files: { path: string; file: File; type: string }[]; bytes: number };
type UploadPlan = { id: string; uploads: { path: string; url: string; headers: Record<string, string> }[] };
export type UploadJob = UploadPlan & { completed: Set<string> };
export type PublishedUpload = { id: string; title: string; franchise?: string; manifest: string; sceneCount: number };
export type ManagedPack = PublishedUpload & { uploader: string; visible: boolean };
type ErrorCode = 'configuration' | 'unauthorized' | 'request' | 'empty' | 'path' | 'type' | 'size' | 'pack' | 'scene' | 'missing' | 'extra' | 'upload' | 'publish';
export class OwnerUploadError extends Error {
  constructor(public code: ErrorCode, public detail = '') { super(code); }
}

const types: Record<string, string> = { json: 'application/json', mp4: 'video/mp4', m4a: 'audio/mp4', jpg: 'image/jpeg' };
const contentBase = new URL('.', contentCatalogUrl).href;

export async function preparePack(selected: File[]): Promise<PreparedPack> {
  const files = selected.filter(file => file.name !== '.DS_Store');
  if (!files.length) throw new OwnerUploadError('empty');
  if (files.length > uploadLimits.files) throw new OwnerUploadError('size');
  const rooted = files.some(file => file.webkitRelativePath.includes('/'));
  const root = files[0].webkitRelativePath.split('/')[0];
  const paths = new Map<string, File>();
  let bytes = 0, metadata = 0;
  const entries = files.map(file => {
    const raw = file.webkitRelativePath || file.name;
    if (rooted && !raw.startsWith(root + '/')) throw new OwnerUploadError('path', raw);
    const path = rooted ? raw.slice(root.length + 1) : raw;
    if (!relativeContentPath(path, 'json|mp4|m4a|jpg') || paths.has(path)) throw new OwnerUploadError('path', path);
    const extension = path.split('.').at(-1)!;
    const limit = extension === 'json' ? uploadLimits.json : extension === 'jpg' ? uploadLimits.image : uploadLimits.media;
    if (file.size > limit) throw new OwnerUploadError('size', path);
    bytes += file.size;
    if (extension === 'json') metadata += file.size;
    paths.set(path, file);
    return { path, file, type: types[extension] };
  });
  if (bytes > uploadLimits.total || metadata > uploadLimits.metadata) throw new OwnerUploadError('size');
  const manifest = paths.get('pack.json');
  if (!manifest) throw new OwnerUploadError('missing', 'pack.json');
  let pack: Pack;
  try {
    const data = JSON.parse(await manifest.text());
    pack = validatePack(data, data.id);
  } catch { throw new OwnerUploadError('pack'); }
  const referenced = new Set(['pack.json']);
  const requireFile = (path: string) => {
    if (!paths.has(path)) throw new OwnerUploadError('missing', path);
    referenced.add(path);
  };
  for (const summary of pack.scenes) {
    requireFile(summary.manifest);
    if (paths.get(summary.manifest)!.size > 512 * 1024) throw new OwnerUploadError('size', summary.manifest);
    const folder = summary.manifest.slice(0, summary.manifest.lastIndexOf('/') + 1);
    let scene;
    try { scene = validateScene(JSON.parse(await paths.get(summary.manifest)!.text()), new URL(folder, contentBase).href); }
    catch { throw new OwnerUploadError('scene', summary.manifest); }
    if (scene.id !== summary.id) throw new OwnerUploadError('scene', summary.manifest);
    if (scene.waveform) requireFile(folder + scene.waveform);
    const media = [scene.video, scene.backing, scene.poster, ...scene.roles.map(role => role.portrait)].filter((name): name is string => !!name);
    if (scene.mediaBase) {
      try { for (const name of media) storageUrl(new URL(name, scene.mediaBase).href, contentBase, 'mp4|m4a|jpg'); }
      catch { throw new OwnerUploadError('scene', summary.manifest); }
    } else for (const name of media) requireFile(folder + name);
    if (summary.poster.startsWith('https:')) {
      try { storageUrl(summary.poster, contentBase, 'jpg'); }
      catch { throw new OwnerUploadError('scene', summary.manifest); }
    } else requireFile(summary.poster);
  }
  for (const path of paths.keys()) if (!referenced.has(path)) throw new OwnerUploadError('extra', path);
  return { pack, files: entries, bytes };
}

async function jsonRequest<T>(url: string, key: string, signal: AbortSignal, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new OwnerUploadError('request');
  }
  if (response.status === 401 || response.status === 403) throw new OwnerUploadError('unauthorized');
  if (response.status === 204 && response.ok) return undefined as T;
  let value: unknown;
  try { value = await response.json(); } catch { throw new OwnerUploadError('request'); }
  if (!response.ok) throw new OwnerUploadError('request', typeof (value as { message?: unknown })?.message === 'string' ? (value as { message: string }).message : '');
  return value as T;
}

export async function ownerApiConfiguration(signal: AbortSignal): Promise<string> {
  let response: Response;
  try { response = await fetch('/api/owner-config', { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
  catch (error) { if (signal.aborted) throw error; throw new OwnerUploadError('configuration'); }
  if (!response.ok) throw new OwnerUploadError('configuration');
  try {
    const value = await response.json() as { apiBase: string };
    if (typeof value.apiBase !== 'string' || !value.apiBase.trim()) throw new Error();
    const url = new URL(value.apiBase, location.origin);
    const local = url.origin === location.origin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/$/, '');
  } catch { throw new OwnerUploadError('configuration'); }
}

export async function unlockOwner(apiBase: string, key: string, signal: AbortSignal) {
  await jsonRequest(apiBase + '/session', key, signal);
}

export async function listOwnerPacks(apiBase: string, key: string, signal: AbortSignal): Promise<ManagedPack[]> {
  const value = await jsonRequest<{ packs: ManagedPack[] }>(apiBase + '/packs', key, signal);
  if (!Array.isArray(value.packs) || value.packs.some(pack => !/^pack_[A-Za-z0-9_-]{1,80}$/.test(pack.id) || typeof pack.title !== 'string' || typeof pack.uploader !== 'string' || typeof pack.visible !== 'boolean' || !Number.isInteger(pack.sceneCount) || pack.sceneCount < 0)) throw new OwnerUploadError('request');
  return value.packs;
}

export async function manageOwnerPack(apiBase: string, key: string, id: string, visible: boolean | undefined, signal: AbortSignal) {
  await jsonRequest(apiBase + '/packs/' + encodeURIComponent(id), key, signal, visible === undefined ? undefined : { visible }, visible === undefined ? 'DELETE' : 'PATCH');
}

function putFile(file: File, url: string, headers: Record<string, string>, signal: AbortSignal, progress: (bytes: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const finish = (error?: unknown) => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    request.open('PUT', url);
    request.withCredentials = false;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => progress(event.loaded);
    request.onload = () => finish(request.status >= 200 && request.status < 300 ? undefined : new OwnerUploadError('upload'));
    request.onerror = () => finish(new OwnerUploadError('upload'));
    request.onabort = () => finish(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return finish(new DOMException('Cancelled', 'AbortError'));
    request.send(file);
  });
}

export async function uploadPack(apiBase: string, key: string, prepared: PreparedPack, previous: UploadJob | undefined, signal: AbortSignal,
  onJob: (job: UploadJob) => void, onProgress: (value: { bytes: number; path: string }) => void, onPublish: () => void): Promise<PublishedUpload> {
  let job = previous;
  if (!job || job.completed.size < prepared.files.length) {
    const plan = await (job ? jsonRequest<UploadPlan>(apiBase + '/uploads/' + encodeURIComponent(job.id), key, signal)
      : jsonRequest<UploadPlan>(apiBase + '/uploads', key, signal, { files: prepared.files.map(({ path, file, type }) => ({ path, size: file.size, type })) }));
    if (!/^upl_[A-Za-z0-9_-]{1,80}$/.test(plan.id) || (job && plan.id !== job.id) || !Array.isArray(plan.uploads) || plan.uploads.length !== prepared.files.length) throw new OwnerUploadError('request');
    const seen = new Set<string>();
    for (const upload of plan.uploads) {
      const url = new URL(upload.url);
      if (seen.has(upload.path) || !prepared.files.some(file => file.path === upload.path) || url.origin !== new URL(contentBase).origin || url.username || url.password || url.hash ||
          url.pathname !== `/content/uploads/${plan.id}/files/${upload.path}` || !upload.headers || Object.entries(upload.headers).some(([name, value]) => /^(authorization|cookie)$/i.test(name) || typeof value !== 'string')) throw new OwnerUploadError('request');
      seen.add(upload.path);
    }
    job = { ...plan, completed: job?.completed ?? new Set() };
    onJob(job);
  }
  let completedBytes = prepared.files.filter(file => job!.completed.has(file.path)).reduce((bytes, item) => bytes + item.file.size, 0);
  for (const item of prepared.files) {
    signal.throwIfAborted();
    if (job.completed.has(item.path)) continue;
    const target = job.uploads.find(upload => upload.path === item.path)!;
    onProgress({ bytes: completedBytes, path: item.path });
    try { await putFile(item.file, target.url, target.headers, signal, bytes => onProgress({ bytes: completedBytes + bytes, path: item.path })); }
    catch (error) { if (signal.aborted) throw error; throw new OwnerUploadError('upload', item.path); }
    job.completed.add(item.path);
    completedBytes += item.file.size;
    onProgress({ bytes: completedBytes, path: item.path });
  }
  signal.throwIfAborted(); onPublish();
  try {
    const result = await jsonRequest<PublishedUpload>(apiBase + '/uploads/' + encodeURIComponent(job.id) + '/publish', key, signal, {});
    if (result.id !== prepared.pack.id || typeof result.title !== 'string' || !result.title.trim() || result.franchise !== prepared.pack.franchise || result.sceneCount !== prepared.pack.scenes.length) throw new OwnerUploadError('publish');
    storageUrl(result.manifest, contentBase, 'json');
    return result;
  }
  catch (error) {
    if (signal.aborted || error instanceof OwnerUploadError && error.code === 'unauthorized') throw error;
    throw new OwnerUploadError('publish', error instanceof OwnerUploadError ? error.detail : '');
  }
}
