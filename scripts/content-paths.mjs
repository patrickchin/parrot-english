// Local authoring paths only. Runtime content is fetched from the published OSS catalog.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { franchiseGroup } from '../src/franchises.ts';

const index = JSON.parse(await readFile('content/catalog.json', 'utf8'));
export const packs = await Promise.all(index.packs.map(async entry => ({
  file: join('content', entry.manifest),
  value: JSON.parse(await readFile(join('content', entry.manifest), 'utf8')),
})));
export const catalog = packs.flatMap(pack => pack.value.scenes);

function destinationPack(slug, source, tags = []) {
  const franchise = source === undefined ? undefined : franchiseGroup({ note: source, tags });
  const owner = packs.find(pack => pack.value.scenes.some(scene => scene.slug === slug));
  if (owner && (!franchise || owner.value.franchise === franchise)) return owner;
  const candidates = packs.filter(pack => pack.value.franchise === franchise);
  if (candidates.length !== 1) throw new Error(`${candidates.length ? 'Ambiguous' : 'No'} content pack for ${slug} (${franchise ?? 'franchise required'}). Create or select a pack before authoring its scenes.`);
  return candidates[0];
}

export function sceneFolder(slug, franchise, tags) {
  const pack = packs.find(pack => pack.value.scenes.some(scene => scene.slug === slug)) ?? destinationPack(slug, franchise, tags);
  const scene = pack.value.scenes.find(scene => scene.slug === slug);
  return dirname(join(dirname(pack.file), scene?.manifest ?? `scenes/${slug}/scene.json`));
}

export async function writeCatalog(entries = catalog) {
  const translations = {};
  for (const { value } of packs) for (const [language, resource] of Object.entries(value.locales)) {
    translations[language] ??= { scenes: {}, roles: {} };
    Object.assign(translations[language].scenes, resource.scenes);
    Object.assign(translations[language].roles, resource.roles);
  }
  const contents = new Map(packs.map(pack => [pack, []]));
  const roleIds = new Map(packs.map(pack => [pack, new Set()]));
  const assignments = entries.map(entry => ({ entry, pack: destinationPack(entry.slug, entry.note, entry.tags) }));
  for (const { entry, pack } of assignments) {
    const folder = sceneFolder(entry.slug, entry.note, entry.tags);
    const manifest = `scenes/${entry.slug}/scene.json`;
    const target = dirname(join(dirname(pack.file), manifest));
    if (folder !== target) {
      await mkdir(dirname(target), { recursive: true });
      await rename(folder, target);
    }
    const scene = JSON.parse(await readFile(join(target, 'scene.json'), 'utf8'));
    contents.get(pack).push({ ...entry, id: scene.id, title: scene.title, source: scene.credit.source,
      poster: scene.poster ? (scene.mediaBase ?? `scenes/${entry.slug}/`) + scene.poster : entry.poster,
      tags: scene.tags ?? [], quotes: scene.lines.flatMap(line => [line.text, line.hint]), manifest });
    scene.roles.forEach(role => roleIds.get(pack).add(role.id));
  }
  for (const pack of packs) {
    pack.value.scenes = contents.get(pack);
    const ids = new Set(pack.value.scenes.map(scene => scene.id));
    pack.value.locales = Object.fromEntries(Object.entries(translations).map(([language, resource]) => [language, {
      scenes: Object.fromEntries(Object.entries(resource.scenes).filter(([id]) => ids.has(id))),
      roles: Object.fromEntries(Object.entries(resource.roles).filter(([id]) => roleIds.get(pack).has(id))),
      ...(pack.value.locales[language]?.notices ? { notices: pack.value.locales[language].notices } : {}),
    }]));
    await writeFile(pack.file, JSON.stringify(pack.value, null, 2) + '\n');
  }
}
