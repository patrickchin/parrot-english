// Local authoring paths only. Runtime content is fetched from the published OSS catalog.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const index = JSON.parse(await readFile('content/catalog.json', 'utf8'));
export const packs = await Promise.all(index.packs.map(async entry => ({
  file: join('content', entry.manifest),
  value: JSON.parse(await readFile(join('content', entry.manifest), 'utf8')),
})));
export const catalog = packs.flatMap(pack => pack.value.scenes);

export function sceneFolder(slug, cohort = 'older-audience') {
  const pack = packs.find(pack => pack.value.scenes.some(scene => scene.slug === slug))
    ?? packs.find(pack => pack.value.scenes.some(scene => scene.cohort === cohort));
  if (!pack) throw new Error(`No content pack for ${slug} (${cohort}). Create a pack before authoring its scenes.`);
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
  for (const entry of entries) {
    const pack = packs.find(pack => pack.value.scenes.some(scene => scene.cohort === entry.cohort));
    if (!pack) throw new Error(`No content pack for category ${entry.cohort}`);
    const folder = sceneFolder(entry.slug, entry.cohort);
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
