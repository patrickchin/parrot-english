import { test, expect } from './fixtures';
import { prepareMediaTest } from './media-fixture';

test.use({ sampleScene: true });

test('completing after the last recording keeps the paused picture, caption and playhead together', async ({ page }) => {
  const lines = await prepareMediaTest(page);
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  for (const _ of lines.slice(0, -1)) await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 12000 });
  const video = page.getByRole('region', { name: '电影片段', exact: true }).getByLabel(/对话片段$/);
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(1);
  await page.getByRole('button', { name: '看我的配音', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的配音，完成啦！', exact: true })).toBeVisible();
  await expect(video).toHaveJSProperty('paused', true);
  await expect(video).toHaveJSProperty('seeking', false);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(0.05);
  const firstText = lines[0].slice(lines[0].indexOf('：') + 1);
  await expect(page.getByRole('group', { name: '台词', exact: true }).getByText(firstText, { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '配音时间指针', exact: true })).toHaveAttribute('aria-valuenow', '0.000');
});
