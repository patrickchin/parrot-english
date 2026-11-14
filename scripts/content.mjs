import { readFile, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateCatalog, validatePack, relativeContentPath, storageUrl } from '../src/content-pack.ts';
import { validateScene } from '../src/scene.ts';
import { validateWaveform } from '../src/waveform.ts';

export const bucket = 'parrotbook-media-f6e09412';
export const contentBase = `https://${bucket}.oss-cn-hongkong.aliyuncs.com/content/`;
const json = body => JSON.stringify(body, null, 2) + '\n';

export async function validateDirectory(root = 'content') {
  root = resolve(root);
  const files = new Map(), packFiles = new Map(), remote = new Set(), ids = new Set(), slugs = new Set(), routes = new Set();
  let referencedFiles;
  async function file(path, max = 2 * 1024 * 1024) {
    if (!relativeContentPath(path, 'json|mp4|m4a|jpg')) throw new Error(`Unsafe content path: ${path}`);
    let current = root;
    for (const part of path.split('/')) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlinks are not content files: ${path}`);
    }
    if ((await lstat(current)).size > max) throw new Error(`Content file too large: ${path}`);
    const body = await readFile(current);
    files.set(path, body);
    referencedFiles?.set(path, body);
    return body;
  }
  async function readJson(path, max) { return JSON.parse((await file(path, max)).toString()); }
  const catalog = validateCatalog(await readJson('catalog.json', 64 * 1024));
  files.delete('catalog.json');
  const claim = id => { if (ids.has(id)) throw new Error(`Duplicate content ID: ${id}`); ids.add(id); };
  for (const entry of catalog.packs) {
    referencedFiles = new Map();
    packFiles.set(entry.id, referencedFiles);
    const pack = validatePack(await readJson(entry.manifest), entry.id);
    const packFolder = dirname(entry.manifest);
    const roleIds = new Set();
    for (const summary of pack.scenes) {
      if (slugs.has(summary.slug) || routes.has(summary.routeSlug ?? summary.slug)) throw new Error(`Duplicate scene route: ${summary.slug}`);
      slugs.add(summary.slug); routes.add(summary.routeSlug ?? summary.slug);
      const path = join(packFolder, summary.manifest);
      const scene = validateScene(await readJson(path, 512 * 1024), new URL(dirname(path) + '/', contentBase).href);
      if (scene.id !== summary.id) throw new Error(`Scene ID does not match its pack: ${path}`);
      for (const entity of [scene, ...scene.roles, ...scene.lines]) claim(entity.id);
      scene.roles.forEach(role => roleIds.add(role.id));
      const sceneFolder = dirname(path);
      if (scene.waveform) {
        const wave = validateWaveform(await readJson(join(sceneFolder, scene.waveform)));
        if (wave.duration !== scene.duration) throw new Error(`Waveform duration does not match: ${path}`);
      }
      const media = [scene.video, scene.backing, scene.poster, ...scene.roles.map(role => role.portrait)].filter(Boolean);
      if (scene.mediaBase) {
        if (new URL(scene.mediaBase).origin !== new URL(contentBase).origin) throw new Error(`Media must use the content storage origin: ${path}`);
        media.forEach(name => remote.add(storageUrl(name, scene.mediaBase, 'mp4|m4a|jpg')));
      } else {
        for (const name of media) await file(join(sceneFolder, name), 100 * 1024 * 1024);
      }
      if (/^https:/.test(summary.poster)) remote.add(storageUrl(summary.poster, contentBase, 'jpg'));
      else await file(join(packFolder, summary.poster), 10 * 1024 * 1024);
    }
    for (const resource of Object.values(pack.locales ?? {})) {
      if (Object.keys(resource.roles).some(id => !roleIds.has(id))) throw new Error(`Pack translations refer to an absent role: ${entry.id}`);
    }
  }
  return { catalog, files, packFiles, remote: [...remote], sceneCount: slugs.size };
}

function contentRevision(value, files) {
  const hash = createHash('sha256').update(json(value));
  for (const [path, body] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(path).update('\0').update(body).update('\0');
  return hash.digest('hex').slice(0, 24);
}

export async function stageDirectory(root = 'content', destination) {
  const validated = await validateDirectory(root);
  const revision = contentRevision(validated.catalog, validated.files);
  const folder = resolve(destination ?? join('content/local-packs', revision));
  await rm(join(folder, 'objects'), { recursive: true, force: true });
  await mkdir(join(folder, 'objects'), { recursive: true });
  const packs = [];
  for (const pack of validated.catalog.packs) {
    const files = validated.packFiles.get(pack.id);
    const prefix = `releases/${contentRevision(pack, files)}/`;
    for (const [path, body] of files) {
      const target = join(folder, 'objects', prefix, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
    }
    packs.push({ ...pack, manifest: prefix + pack.manifest });
  }
  const catalog = { version: 1, packs };
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'catalog.json'), json(catalog));
  return { ...validated, revision, folder, catalog, sourceCatalog: validated.catalog };
}

function ownerRequest() {
  const token = process.env.OWNER_API_TOKEN, configured = process.env.OWNER_API_URL;
  if (!configured || !token) throw new Error('Set OWNER_API_URL and OWNER_API_TOKEN for the owner upload API.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('OWNER_API_URL must be an HTTPS URL without credentials, query, or fragment.');
  const base = url.href.replace(/\/$/, '');
  return async (method, path, body) => {
    const response = await fetch(base + path, { method, headers: {
      Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(300000) });
    let value;
    try { value = await response.json(); }
    catch { throw new Error(`Owner API returned an invalid response (${response.status}).`); }
    if (!response.ok) throw new Error(`Owner API request failed (${response.status}): ${value.error ?? 'Request rejected.'}`);
    return value;
  };
}
const mime = { json: 'application/json', mp4: 'video/mp4', m4a: 'audio/mp4', jpg: 'image/jpeg' };
export async function publishDirectory(root = 'content', { replaceCatalog = false } = {}) {
  const request = ownerRequest();
  const release = await stageDirectory(root), uploads = [], transfers = [];
  for (const pack of release.catalog.packs) {
    const source = release.packFiles.get(pack.id);
    const sourceEntry = release.sourceCatalog.packs.find(entry => entry.id === pack.id);
    const packRoot = dirname(sourceEntry.manifest);
    const files = new Map([...source].map(([path, bytes]) => [path === sourceEntry.manifest ? 'pack.json' : relative(packRoot, path).split('\\').join('/'), bytes]));
    if (files.size !== source.size || [...files.keys()].some(path => !relativeContentPath(path, 'json|mp4|m4a|jpg'))) throw new Error(`Pack ${pack.id} references files outside its folder.`);
    const types = new Map([...files.keys()].map(path => [path, mime[path.split('.').at(-1)]]));
    const plan = await request('POST', '/uploads', { files: [...files].map(([path, bytes]) => ({ path, size: bytes.length, type: types.get(path) })) });
    if (!/^upl_[A-Za-z0-9_-]{1,80}$/.test(plan.id) || !Array.isArray(plan.uploads) || plan.uploads.length !== files.size) throw new Error('Owner API returned an invalid upload plan.');
    const seen = new Set();
    for (const item of plan.uploads) {
      const url = new URL(item.url);
      if (!files.has(item.path) || seen.has(item.path) || url.origin !== new URL(contentBase).origin || url.username || url.password || url.hash || url.pathname !== `/content/uploads/${plan.id}/files/${item.path}` ||
          item.headers?.['Content-Type'] !== types.get(item.path) || item.headers?.['x-oss-object-acl'] !== 'private' || Object.keys(item.headers).some(key => key.toLowerCase() === 'authorization')) throw new Error('Owner API returned an unsafe upload plan.');
      seen.add(item.path); transfers.push({ ...item, bytes: files.get(item.path) });
    }
    uploads.push(plan.id);
  }
  for (let index = 0; index < transfers.length; index += 8) {
    const results = await Promise.allSettled(transfers.slice(index, index + 8).map(async item => {
      // OSS receives only the signed upload headers, never the owner bearer.
      const response = await fetch(item.url, { method: 'PUT', headers: item.headers, body: item.bytes,
        redirect: 'error', signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Pack file upload failed (${response.status}): ${item.path}`);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  const result = await request('POST', '/publish', { uploads, ...(replaceCatalog ? { replaceCatalog: true } : {}) });
  if (!Array.isArray(result.packs) || result.packs.length !== uploads.length) throw new Error('Owner API returned an invalid publication result.');
  return { ...release, catalog: validateCatalog({ version: 1, packs: result.packs.map(({ id, manifest, uploader }) => ({ id, manifest, uploader })) }) };
}
export async function removePack(packId) {
  if (!/^pack_[A-Za-z0-9_-]{1,80}$/.test(packId)) throw new Error('Provide a valid pack ID.');
  return ownerRequest()('DELETE', '/packs/' + packId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  const replaceCatalog = args.includes('--replace-catalog');
  if (args.some(arg => arg.startsWith('--') && arg !== '--replace-catalog') || (replaceCatalog && command !== 'publish')) throw new Error('Only publish supports --replace-catalog.');
  const positional = args.filter(arg => arg !== '--replace-catalog');
  if (positional.length > 1) throw new Error('Provide at most one content root or pack ID.');
  const [argument] = positional;
  if (command === 'validate') {
    const result = await validateDirectory(argument);
    console.log(`Validated ${result.catalog.packs.length} packs, ${result.sceneCount} scenes, ${result.files.size} files; ${result.remote.length} existing OSS media references.`);
  } else if (command === 'stage' || command === 'publish') {
    const result = await (command === 'stage' ? stageDirectory(argument) : publishDirectory(argument, { replaceCatalog }));
    console.log(`${command === 'stage' ? 'Staged' : 'Published'} ${result.catalog.packs.length} packs / ${result.sceneCount} scenes, release ${result.revision}. ${relative(process.cwd(), result.folder)}`);
  } else if (command === 'remove' && argument) {
    await removePack(argument);
    console.log(`Deleted ${argument} from discovery and owner management. Pack files and media remain stored; remove the entry from the source catalog to keep a later publish from adding it again.`);
  } else throw new Error('Usage: node scripts/content.mjs validate|stage [content-root] | publish [content-root] [--replace-catalog] | remove pack_ID');
}
