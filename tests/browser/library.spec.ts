import { test, expect } from '@playwright/test';
import { clips } from '../../src/catalog';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('the starter shelf includes all four selected memes and their YouTube links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '今天，给谁配音？' })).toBeVisible();
  for (const clip of clips.filter(c => c.local)) {
    await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'YouTube 原片 ↗' }).and(page.locator(`a[href="${clip.source}"]`))).toHaveCount(1);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '试玩 Sintel', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '今天，给谁配音？' })).toBeVisible();
});

for (const clip of clips.filter(c => c.local)) test(`prepared private clip ${clip.slug} can play and record a turn`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium' || !existsSync(resolve(`content/local-dubbing/${clip.slug}-v1.mp4`)), 'Private footage is optional and is not distributed in Git.');
  await page.goto('/#' + clip.slug);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.getByRole('button', { name: '同意并开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});
