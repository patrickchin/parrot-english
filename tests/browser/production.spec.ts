import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { memeClips } from '../../src/catalog';

for (const clip of memeClips) test(`hosted ${clip.slug} opens and plays without a device file`, async ({ page }) => {
  await page.goto('/#' + clip.slug);
  await expect(page.getByLabel('选择本地片段', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
});

test('the public build reads a selected device file without uploading it or requesting private server media', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET' || req.url().includes('/content/local-dubbing/')) requests.push(req.method() + ' ' + req.url()); });
  // Keep device-local pack support covered independently of the hosted scenes.
  await page.route('**/packs/sintel/pack.json', async route => {
    const pack = JSON.parse(await readFile('public/packs/sintel/pack.json', 'utf8'));
    pack.mode = 'local'; delete pack.mediaBase;
    await route.fulfill({ json: pack });
  });
  await page.goto('/#sintel');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeDisabled();
  await page.getByLabel('选择本地片段', { exact: true }).setInputFiles(resolve('content/media/sintel/search-v1.mp4'));
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
