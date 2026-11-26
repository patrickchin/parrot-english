import { languages, pathLanguage, type Language } from '../../src/locale';
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { clips, contentRoot, packs, publishedCatalog } from '../content-fixtures';
import type { Clip, Pack } from '../../src/content-pack';
import { browseShelves, shelfCount, type Shelf } from '../../src/browse';

export const catalogUrl = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/catalog.json';
export async function routeContent(page: Page, sampleScene = false) {
  await page.route('https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice('/content/'.length);
    if (!/^[A-Za-z0-9_/-]+\.json$/.test(relative)) return route.abort();
    const data = relative === 'catalog.json' ? structuredClone(publishedCatalog) : JSON.parse(await readFile(new URL(relative, contentRoot), 'utf8'));
    for (const pack of sampleScene && relative === 'catalog.json' ? Object.values(data.packData) as Pack[] : []) {
      const clip = pack.scenes.find((clip: { slug: string }) => clip.slug === 'patrick');
      if (clip) {
        const sample = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
        const previousId = clip.id; clip.id = sample.id;
        const titles: Record<string, string> = { en: 'Who are you looking for?', 'zh-CN': sample.title, es: '¿A quién buscas?', ja: '誰を探しているの？', ko: '누구를 찾고 있나요?' };
        for (const [language, locale] of Object.entries(pack.locales!) as [string, { scenes: Record<string, unknown>; roles: Record<string, unknown> }][]) {
          delete locale.scenes[previousId];
          locale.scenes[sample.id] = { title: titles[language], licence: sample.credit.licence, changes: sample.credit.changes };
          for (const role of sample.roles) locale.roles[role.id] = { name: role.name, hint: role.hint };
        }
      }
    }
    await route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
  });
}

// Browser-flow tests use local authoring fixtures for the OSS media origin.
// Actual OSS headers, hashes, and playback are verified after provisioning.
export const test = base.extend<{ sampleScene: boolean }>({
  sampleScene: [false, { option: true }],
  page: async ({ page, sampleScene }, use) => {
    await page.addInitScript(() => {
      const create = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (video) {
        const source = create.call(this, video), connect = source.connect.bind(source);
        source.connect = ((destination: AudioNode) => {
          if (destination instanceof GainNode && video === document.querySelector('video')) {
            (window as unknown as { originalOutputGain: GainNode }).originalOutputGain = destination;
          }
          return connect(destination);
        }) as typeof source.connect;
        return source;
      };
    });
    // A source edit in another local tool must not reset an in-flight lesson.
    await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:\d+\//, socket => socket.close());
    await routeContent(page, sampleScene);
    // Licensed internal fixture exercises multi-line capture without publishing it in the app.
    if (sampleScene) await page.route('**/scenes/patrick/*.json', async route => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({ body: await readFile(`tests/fixtures/sintel/${file}`), contentType: 'application/json' });
    });
    if (!process.env.PARROTBOOK_LIVE_MEDIA) await page.route('https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/clips/**', async route => {
      const match = /^\/clips\/([a-z0-9-]+)\/([a-zA-Z0-9_-]+\.(mp4|m4a|jpg))$/.exec(new URL(route.request().url()).pathname);
      if (!match) return route.abort();
      const folder = match[1] === 'sintel' ? 'content/media/sintel' : 'content/local-dubbing';
      if (!existsSync(`${folder}/${match[2]}`)) return route.continue();
      const types: Record<string, string> = { '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg' };
      const body = await readFile(`${folder}/${match[2]}`);
      const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '');
      if (range) {
        const start = Number(range[1]), end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
        await route.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType: types[extname(match[2])], headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}` } });
      } else await route.fulfill({ body, contentType: types[extname(match[2])], headers });
    });
    await use(page);
  },
});
export { expect };

// Inspect the native output control, regardless of whether a browser uses a
// Web Audio gain or its media element's native mute control.
export function originalAudioLevel(page: Page) {
  return page.evaluate(() => (window as unknown as { originalOutputGain?: GainNode }).originalOutputGain?.gain.value ?? (document.querySelector('video')!.muted ? 0 : 1));
}

export async function setLanguage(page: Page, language: Language) {
  // Loading shells replace their header when the destination mounts.
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('banner').getByRole('combobox').click();
  await page.getByRole('option', { name: languages.find(item => item.value === language)!.label, exact: true }).click();
}


export async function headerDestination(page: Page, name: string) {
  await expect(page.getByRole('navigation', { name: /^(主导航|Main navigation)$/ })).toBeVisible();
  const menu = page.getByRole('button', { name: /^(主导航|Main navigation)$/ });
  if (await menu.isVisible()) {
    if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
    return page.getByRole('menuitem', { name, exact: true });
  }
  return page.getByRole('link', { name, exact: true });
}

type Translation = { categories: Record<string, string>; browse: Record<string, string>; library: Record<string, string> };
const translations = Object.fromEntries(languages.map(({ value }) => [value, JSON.parse(readFileSync(`src/locales/${value}/translation.json`, 'utf8'))])) as Record<Language, Translation>;
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fixturePacks = packs.map(pack => ({ ...pack.data, id: pack.entry.id, uploader: pack.entry.uploader, sceneCount: pack.data.scenes.length }));
/** Home shelves derived from the same authored catalog the browser receives. */
export const homeShelves = browseShelves(fixturePacks, clips as unknown as Clip[]);
/** Columns of the home grids at the page's viewport width (see styles.css breakpoints). */
export const viewportColumns = (page: Page) => { const width = page.viewportSize()!.width; return width >= 1024 ? 4 : width >= 640 ? 3 : 2; };
/** Cards a home shelf previews: complete rows only. */
export const shelfShown = (shelf: Shelf, page: Page) => shelfCount(shelf.kind === 'section' ? shelf.shows.length : shelf.scenes.length, viewportColumns(page));
export const pageLanguage = (page: Page) => pathLanguage(new URL(page.url()).pathname) ?? 'zh-CN';
export const browseText = (language: Language) => translations[language];
export const shelfTitle = (shelf: Shelf, language: Language) => shelf.kind === 'section' ? browseText(language).categories[shelf.section.title.split('.')[1]] : shelf.pack.title;
export function sceneCountText(count: number, language: Language) {
  const library = browseText(language).library;
  return (library[count === 1 ? 'sceneCount_one' : 'sceneCount_other'] ?? library.sceneCount).replace('{{count}}', String(count));
}

/** A show card is a link named by its visible title and scene count. */
export function showCard(scope: Page | Locator, title: string, language: Language = 'en', sceneCount = packs.find(pack => pack.data.title === title)!.data.scenes.length) {
  return scope.getByRole('link', { name: new RegExp(`^${escapeRegExp(title)}\\s*${escapeRegExp(sceneCountText(sceneCount, language))}$`) });
}

/** Scene cards in the current page's scene list, excluding breadcrumb items. */
export const sceneItems = (page: Page) => page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('button') });

/** Opens a show from home through its shelf, or the shelf's section page when the show is beyond the preview. */
export async function openShow(page: Page, title: string, { keyboard = false } = {}) {
  const language = pageLanguage(page);
  const text = browseText(language);
  const shelf = homeShelves.find(shelf => shelf.kind === 'section' && shelf.shows.some(show => show.title === title));
  if (!shelf || shelf.kind !== 'section') throw new Error(`${title} is not on a home shelf`);
  const name = shelfTitle(shelf, language);
  const region = page.getByRole('region', { name, exact: true });
  const activate = async (link: Locator) => { if (keyboard) { await link.focus(); await link.press('Enter'); } else await link.click(); };
  if (shelf.shows.findIndex(show => show.title === title) < shelfShown(shelf, page)) return activate(showCard(region, title, language));
  await activate(region.getByRole('link', { name: text.browse.seeAllLabel.replace('{{count}}', String(shelf.shows.length)).replace('{{title}}', name), exact: true }));
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await activate(showCard(page.getByRole('list', { name: text.browse.shows, exact: true }), title, language));
}

// Scrolling to reach controls must not look like a layout shift.
export async function documentBoxes(page: Page, locators: Locator[]) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const offset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  return Promise.all(locators.map(async locator => {
    const box = await locator.boundingBox();
    return box && { ...box, x: box.x + offset.x, y: box.y + offset.y };
  }));
}
