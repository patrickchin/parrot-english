import { scenePath } from '../../src/app/routes';
import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { clips } from '../../src/catalog';

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
    scene.mode = 'local'; delete scene.mediaBase;
    await route.fulfill({ json: scene });
  });
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeDisabled();
  await page.getByLabel('选择本地片段', { exact: true }).setInputFiles(resolve('content/media/sintel/search-v1.mp4'));
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

for (const path of ['/en/', '/zh/', '/en/library/teens', '/zh/library/younger-age-5', '/en/scenes/toy-story-infinity', '/en/dubs', '/zh/dubs/']) test(`localized production path ${path} opens in its requested language`, async ({ page }) => {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  const english = path.startsWith('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', english ? 'en' : 'zh-CN');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (path.includes('/scenes/')) await expect(page.getByRole('button', { name: english ? 'Start dubbing' : '开始配音', exact: true })).toBeEnabled();
  else if (path.includes('/dubs')) await expect(page.getByRole('heading', { level: 1 })).toHaveText(english ? 'My dubs' : '我的配音');
  else await expect(page.getByRole('searchbox', { name: english ? 'Find a scene' : '查找片段', exact: true })).toBeVisible();
});
