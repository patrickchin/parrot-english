import { scenePath } from './scene-path';
import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { clips, packs } from '../content-fixtures';

test('the production build browses published packs and reloads the selected pack', async ({ page }) => {
  const response = await page.goto('/en/packs');
  expect(response?.status()).toBe(200);
  const gallery = page.getByRole('navigation', { name: 'Packs', exact: true });
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  const pack = packs[0];
  await gallery.getByRole('link', { name: pack.data.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(pack.data.scenes.length);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(pack.data.scenes.length);
});

test('production loads player and owner JavaScript only when those screens are opened', async ({ page }) => {
  const scripts = new Set<string>();
  let catalogs = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/assets/') && path.endsWith('.js')) scripts.add(path);
    if (path === '/content/catalog.json') catalogs++;
  });
  const requested = (prefix: string) => [...scripts].some(path => new RegExp(`/assets/${prefix}-[^/]+\\.js$`).test(path));
  const codecsRequested = () => [...scripts].some(path => /\/assets\/(?:src|mediabunny[^/]*|export-dub)-[^/]+\.js$/.test(path));
  await page.route('**/api/owner-config', route => route.fulfill({ json: { apiBase: 'https://owner.example.test' } }));
  await page.goto('/en/');
  const gallery = page.getByRole('navigation', { name: 'Packs', exact: true });
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  // This verifies request presence, not HTTP-cache behavior; routing fixtures
  // deliberately disable the browser cache in this test suite.
  for (const prefix of ['Player', 'OwnerPacks', 'SavedDubs', 'SharedDub', 'share-client', 'dialog']) {
    expect(requested(prefix), `${prefix} stays out of the initial Packs request graph`).toBe(false);
  }
  expect(codecsRequested()).toBe(false);

  const clip = clips.find(clip => clip.slug === 'patrick')!;
  const pack = packs.find(pack => pack.entry.id === clip.packId)!;
  await gallery.getByRole('link', { name: pack.data.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  const title = pack.data.locales.en.scenes[clip.id].title;
  await page.getByRole('button', { name: `Choose scene: ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  expect(requested('Player')).toBe(true);
  expect(requested('OwnerPacks')).toBe(false);
  expect(codecsRequested()).toBe(false);

  // Owner uploads intentionally have no public navigation entry.
  catalogs = 0;
  await page.goto('/en/owner/packs');
  await expect(page.getByRole('heading', { level: 1, name: 'Manage packs', exact: true })).toBeVisible();
  await expect(page.getByLabel('Owner access key', { exact: true })).toBeVisible();
  expect(requested('OwnerPacks')).toBe(true);
  expect(codecsRequested()).toBe(false);
  expect(catalogs).toBe(0);
});

test('a failed route chunk keeps a localized error and recovers with Reload', async ({ page }) => {
  await page.route('**/assets/OwnerPacks-*.js', route => route.abort());
  await page.goto('/en/owner/packs');
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parrotbook');
  await page.unroute('**/assets/OwnerPacks-*.js');
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manage packs', exact: true })).toBeVisible();
});

for (const clip of clips) test(`hosted ${clip.slug} opens and plays without a device file`, async ({ page }) => {
  await page.goto(scenePath(clip.slug));
  await expect(page.getByLabel('选择本地片段', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
});

test('the public build reads a selected device file without uploading it or requesting private server media', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET' || req.url().includes('/content/local-dubbing/')) requests.push(req.method() + ' ' + req.url()); });
  // Keep device-local scene support covered independently of the hosted scenes.
  await page.route('**/scenes/patrick/scene.json', async route => {
    const scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
    scene.id = clips.find(clip => clip.slug === 'patrick')!.id;
    scene.mode = 'local'; delete scene.mediaBase;
    await route.fulfill({ json: scene });
  });
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeDisabled();
  await page.getByLabel('选择本地片段', { exact: true }).setInputFiles(resolve('content/media/sintel/search-v1.mp4'));
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dubs\/dub_[a-f0-9]{30}$/);
  await page.reload();
  await expect(page.getByLabel('选择本地片段', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

for (const path of ['/en/', '/zh/', '/en/packs', '/zh/packs', '/en/library/all', '/zh/library/all', '/en/scenes/toy-story-infinity', '/en/dubs', '/zh/dubs/']) test(`localized production path ${path} opens in its requested language`, async ({ page }) => {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  const english = path.startsWith('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', english ? 'en' : 'zh-CN');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (path.includes('/scenes/')) await expect(page.getByRole('button', { name: english ? 'Start dubbing' : '开始配音', exact: true })).toBeEnabled();
  else if (path.includes('/dubs')) await expect(page.getByRole('heading', { level: 1 })).toHaveText(english ? 'My dubs' : '我的配音');
  else await expect(page.getByRole('searchbox', { name: path.includes('/library/') ? english ? 'Find a scene' : '查找片段' : english ? 'Find a pack' : '查找内容包', exact: true })).toBeVisible();
});

for (const [language, heading, search, start] of [
  ['es', 'Mis doblajes', 'Buscar una escena', 'Empezar a doblar'],
  ['ja', '自分の吹き替え', 'シーンを探す', '吹き替えを始める'],
  ['ko', '내 더빙', '장면 찾기', '더빙 시작'],
]) for (const route of ['/', '/library/all', '/dubs', '/scenes/patrick']) test(`production ${language}${route} opens in its requested language`, async ({ page }) => {
  const response = await page.goto('/' + language + route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (route.includes('/scenes/')) await expect(page.getByRole('button', { name: start, exact: true })).toBeEnabled();
  else if (route === '/dubs') await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  else if (route === '/') await expect(page.getByRole('searchbox')).toBeVisible();
  else await expect(page.getByRole('searchbox', { name: search, exact: true })).toBeVisible();
});
