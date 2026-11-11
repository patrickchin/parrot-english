import { test, expect } from './fixtures';

test('Holly practises her own lines including the complete closing response', async ({ page }) => {
  await page.goto('/scenes/ben-blue-hat');
  await page.getByRole('button', { name: /^霍莉/ }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('Oh no! The magic hat has turned Ben blue!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByText('Me too.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByText("And it's nice to have you back, wand. I will never lose you again.", { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '听这一句原声', exact: true })).toBeEnabled({ timeout: 12000 });
  expect(await page.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(24.8);
});

test('brief supporting speakers remain in the scene and are omitted from role selection', async ({ page }) => {
  await page.goto('/scenes/mayonnaise');
  await expect(page.getByRole('button', { name: /^章鱼哥/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^派大星/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^痞老板/ })).toHaveCount(0);
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(4);
  await expect(page.locator('video')).toHaveJSProperty('muted', false);
});
