import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the public build reads a selected device file without uploading it or requesting private server media', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET' || req.url().includes('/content/local-dubbing/')) requests.push(req.method() + ' ' + req.url()); });
  // Use the redistributable sample as the file-picker fixture; private memes
  // are deliberately not required to run this production-path test in CI.
  await page.route('**/packs/sintel/pack.json', async route => {
    const pack = JSON.parse(await readFile('public/packs/sintel/pack.json', 'utf8'));
    pack.mode = 'local';
    await route.fulfill({ json: pack });
  });
  await page.goto('/#sintel');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeDisabled();
  await page.getByLabel('选择本地片段', { exact: true }).setInputFiles(resolve('public/packs/sintel/search-v1.mp4'));
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
