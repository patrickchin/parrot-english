import { languages, type Language } from '../../src/locale';
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { existsSync } from 'node:fs';
import { contentRoot } from '../content-fixtures';

export const catalogUrl = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/catalog.json';
export async function routeContent(page: Page, sampleScene = false) {
  await page.route('https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice('/content/'.length);
    if (!/^[A-Za-z0-9_/-]+\.json$/.test(relative)) return route.abort();
    const data = JSON.parse(await readFile(new URL(relative, contentRoot), 'utf8'));
    if (sampleScene && relative.endsWith('/pack.json')) {
      const clip = data.scenes.find((clip: { slug: string }) => clip.slug === 'patrick');
      if (clip) {
        const sample = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
        const previousId = clip.id; clip.id = sample.id;
        const titles: Record<string, string> = { en: 'Who are you looking for?', 'zh-CN': sample.title, es: '¿A quién buscas?', ja: '誰を探しているの？', ko: '누구를 찾고 있나요?' };
        for (const [language, locale] of Object.entries(data.locales) as [string, { scenes: Record<string, unknown>; roles: Record<string, unknown> }][]) {
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

export async function setLanguage(page: Page, language: Language) {
  await page.getByRole('combobox').click();
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

// Scrolling to reach controls must not look like a layout shift.
export async function documentBoxes(page: Page, locators: Locator[]) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const offset = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  return Promise.all(locators.map(async locator => {
    const box = await locator.boundingBox();
    return box && { ...box, x: box.x + offset.x, y: box.y + offset.y };
  }));
}
