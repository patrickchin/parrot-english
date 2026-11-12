import { validateScene, type Scene } from './scene.ts';

export type Clip = {
  id: string; slug: string; routeSlug?: string; title: string; english: string;
  note: string; source: string; cohort: string; poster: string;
  tags: string[]; quotes: string[]; manifest: string; packId: string;
  notices?: Record<string, { library: string; scene: string }>;
};
type SceneText = { title: string; licence: string; changes: string };
type RoleText = { name: string; hint: string };
export type PackLocales = Record<string, {
  scenes: Record<string, SceneText>; roles: Record<string, RoleText>;
  notices?: { library: string; scene: string };
}>;
export type ContentCatalog = { clips: Clip[]; locales: PackLocales };
export type Catalog = { version: 1; packs: { id: string; manifest: string }[] };
export type Pack = { version: 1; id: string; title: string; description: string; author: string; scenes: Omit<Clip, 'packId' | 'notices'>[]; locales?: PackLocales };

const invalid = () => new Error('errors.contentLoad');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max;
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,80}$`).test(v);
const slug = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 120;
const list = (v: unknown, max: number, size: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(s => text(s, size));
export function relativeContentPath(path: unknown, extension = 'json'): path is string {
  return typeof path === 'string' && path.length <= 300 && new RegExp(`^(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.(${extension})$`).test(path);
}
export function validateCatalog(value: unknown): Catalog {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.packs) || value.packs.length > 100) throw invalid();
  const ids = new Set();
  for (const pack of value.packs) {
    if (!record(pack) || !id(pack.id, 'pack') || ids.has(pack.id) || !relativeContentPath(pack.manifest)) throw invalid();
    ids.add(pack.id);
  }
  return value as Catalog;
}
function validateLocales(value: unknown, sceneIds: Set<string>): asserts value is PackLocales {
  if (!record(value) || Object.keys(value).length > 5) throw invalid();
  for (const [language, resource] of Object.entries(value)) {
    if (!['en', 'zh-CN', 'es', 'ja', 'ko'].includes(language) || !record(resource) || !record(resource.scenes) || !record(resource.roles) || Object.keys(resource.roles).length > 4000) throw invalid();
    for (const [key, fields] of Object.entries(resource.scenes)) {
      if (!sceneIds.has(key) || !record(fields) || !['title', 'licence', 'changes'].every(field => text(fields[field]))) throw invalid();
      if (Object.keys(fields).some(field => !['title', 'licence', 'changes'].includes(field))) throw invalid();
    }
    for (const [key, fields] of Object.entries(resource.roles)) {
      if (!id(key, 'role') || !record(fields) || !text(fields.name, 120) || !text(fields.hint, 120)) throw invalid();
      if (Object.keys(fields).some(field => !['name', 'hint'].includes(field))) throw invalid();
    }
    const notices = resource.notices;
    if (notices !== undefined && (!record(notices) ||
        !['library', 'scene'].every(key => text(notices[key], 2000)) ||
        Object.keys(notices).some(key => !['library', 'scene'].includes(key)))) throw invalid();
    if (Object.keys(resource).some(key => !['scenes', 'roles', 'notices'].includes(key))) throw invalid();
  }
}
export function validatePack(value: unknown, expectedId: string): Pack {
  if (!record(value) || value.version !== 1 || value.id !== expectedId || !id(value.id, 'pack') ||
      !text(value.title, 200) || !value.title || !text(value.description) || !text(value.author, 200) ||
      !Array.isArray(value.scenes) || value.scenes.length > 500) throw invalid();
  const ids = new Set<string>(), routes = new Set<string>();
  for (const scene of value.scenes) {
    if (!record(scene) || !id(scene.id, 'scene') || ids.has(scene.id) || !slug(scene.slug) ||
        (scene.routeSlug !== undefined && !slug(scene.routeSlug)) || routes.has(scene.routeSlug ?? scene.slug) ||
        !['title', 'english', 'note', 'source'].every(key => text(scene[key])) ||
        !['older-audience', 'younger-age-5', 'older-children', 'teens'].includes(String(scene.cohort)) ||
        !relativeContentPath(scene.manifest) || !text(scene.poster, 1000) ||
        !list(scene.tags, 32, 80) || !list(scene.quotes, 120, 300) ||
        typeof scene.source !== 'string' || !/^https:\/\//.test(scene.source)) throw invalid();
    ids.add(scene.id); routes.add(scene.routeSlug ?? scene.slug);
  }
  if (value.locales !== undefined) validateLocales(value.locales, ids);
  return value as Pack;
}
// Pack assets share the catalog's storage origin; remote trackers and executable URLs cannot be imported.
export function storageUrl(path: string, base: string, extension: string): string {
  const url = new URL(path, base);
  if (url.protocol !== 'https:' || url.origin !== new URL(base).origin || url.search || url.hash || url.username || url.password ||
      !relativeContentPath(url.pathname.slice(1), extension)) throw invalid();
  return url.href;
}
async function readJson(url: string, signal?: AbortSignal, max = 2 * 1024 * 1024): Promise<unknown> {
  const response = await fetch(url, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > max) throw invalid();
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const decoder = new TextDecoder(); let body = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > max) { await reader.cancel(); throw invalid(); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}
export async function loadContent(url: string, signal?: AbortSignal): Promise<ContentCatalog> {
  const catalogUrl = storageUrl(url, url, 'json');
  const catalog = validateCatalog(await readJson(catalogUrl, signal, 64 * 1024));
  const packs = await Promise.all(catalog.packs.map(async entry => {
    const manifest = storageUrl(entry.manifest, catalogUrl, 'json');
    return { pack: validatePack(await readJson(manifest, signal), entry.id), manifest };
  }));
  const clips: Clip[] = [], locales: PackLocales = {};
  const ids = new Set(), slugs = new Set(), routes = new Set();
  for (const { pack, manifest } of packs) {
    const notices: Clip['notices'] = {};
    for (const [language, resource] of Object.entries(pack.locales ?? {})) {
      if (resource.notices) notices[language] = resource.notices;
    }
    for (const scene of pack.scenes) {
      if (ids.has(scene.id) || slugs.has(scene.slug) || routes.has(scene.routeSlug ?? scene.slug)) throw invalid();
      ids.add(scene.id); slugs.add(scene.slug); routes.add(scene.routeSlug ?? scene.slug);
      clips.push({ ...scene, packId: pack.id, notices, manifest: storageUrl(scene.manifest, manifest, 'json'), poster: storageUrl(scene.poster, manifest, 'jpg') });
    }
    for (const [language, resource] of Object.entries(pack.locales ?? {})) {
      const target = locales[language] ??= { scenes: {}, roles: {} };
      for (const field of ['scenes', 'roles'] as const) {
        if (Object.keys(resource[field]).some(key => Object.hasOwn(target[field], key))) throw invalid();
        Object.assign(target[field], resource[field]);
      }
    }
  }
  return { clips, locales };
}

export async function loadScene(clip: Clip, signal?: AbortSignal): Promise<Scene> {
  let data: unknown;
  try { data = await readJson(clip.manifest, signal, 512 * 1024); }
  catch (error) { if (signal?.aborted) throw error; throw new Error('errors.sceneLoad'); }
  const scene = validateScene(data, new URL('.', clip.manifest).href);
  if (scene.id !== clip.id || scene.mediaBase && new URL(scene.mediaBase).origin !== new URL(clip.manifest).origin) throw new Error('errors.sceneInvalid');
  return scene;
}
