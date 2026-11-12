import { readFile, writeFile, mkdir, mkdtemp, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateCatalog, validatePack, relativeContentPath, storageUrl } from '../src/content-pack.ts';
import { validateScene } from '../src/scene.ts';
import { validateWaveform } from '../src/waveform.ts';

export const bucket = 'parrotbook-media-f6e09412';
export const contentBase = `https://${bucket}.oss-cn-hongkong.aliyuncs.com/content/`;
const remoteRoot = `oss://${bucket}/content/`;
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
  return { ...validated, revision, folder, catalog };
}

function oss(...args) {
  try { return execFileSync('aliyun', ['ossutil', ...args, '--region', 'cn-hongkong'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(`Alibaba CLI failed. Install/configure aliyun with ossutil 2.0. ${error.stderr?.toString() ?? error.message}`); }
}
function uploadCatalog(path) {
  oss('cp', path, remoteRoot + 'catalog.json', '--force', '--cache-control', 'no-store', '--content-type', 'application/json');
}
export async function publishDirectory(root = 'content') {
  const release = await stageDirectory(root);
  // Verify existing external media before making a release discoverable.
  for (let i = 0; i < release.remote.length; i += 8) {
    await Promise.all(release.remote.slice(i, i + 8).map(async url => {
      const response = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Referenced media is unavailable (${response.status}): ${url}`);
    }));
  }
  oss('cp', join(release.folder, 'objects') + '/', remoteRoot, '--recursive', '--force', '--cache-control', 'public,max-age=31536000,immutable');
  uploadCatalog(join(release.folder, 'catalog.json'));
  return release;
}
export async function removePack(packId) {
  const catalog = validateCatalog(JSON.parse(oss('cat', remoteRoot + 'catalog.json')));
  if (!catalog.packs.some(pack => pack.id === packId)) throw new Error(`Published pack not found: ${packId}`);
  const folder = await mkdtemp(join(tmpdir(), 'parrotbook-catalog-'));
  try {
    const path = join(folder, 'catalog.json');
    await writeFile(path, json({ ...catalog, packs: catalog.packs.filter(pack => pack.id !== packId) }));
    uploadCatalog(path);
  } finally { await rm(folder, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, argument] = process.argv.slice(2);
  if (command === 'validate') {
    const result = await validateDirectory(argument);
    console.log(`Validated ${result.catalog.packs.length} packs, ${result.sceneCount} scenes, ${result.files.size} files; ${result.remote.length} existing OSS media references.`);
  } else if (command === 'stage' || command === 'publish') {
    const result = await (command === 'stage' ? stageDirectory(argument) : publishDirectory(argument));
    console.log(`${command === 'stage' ? 'Staged' : 'Published'} ${result.catalog.packs.length} packs / ${result.sceneCount} scenes, release ${result.revision}. ${relative(process.cwd(), result.folder)}`);
  } else if (command === 'remove' && argument) {
    await removePack(argument);
    console.log(`Withdrew ${argument}. Pack files and media remain stored; remove the entry from the source catalog before the next full publish.`);
  } else throw new Error('Usage: node scripts/content.mjs validate|stage|publish [content-root] | remove pack_ID');
}
