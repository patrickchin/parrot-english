import { test, expect } from './fixtures';

test.use({ sampleScene: true });

test('a video already at its target time must finish a pending seek before playback starts', async ({ page }) => {
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.locator('video').evaluate((video: HTMLVideoElement) => {
    const original = video.play.bind(video);
    const state = window as Window & { playCalls?: number; finishPendingSeek?: () => void };
    state.playCalls = 0;
    Object.defineProperty(video, 'seeking', { configurable: true, value: true });
    video.play = () => { state.playCalls!++; return original(); };
    state.finishPendingSeek = () => {
      Object.defineProperty(video, 'seeking', { configurable: true, value: false });
      video.dispatchEvent(new Event('seeked'));
    };
  });
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '正在准备…' })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { playCalls?: number }).playCalls)).toBe(0);
  await page.evaluate(() => (window as Window & { finishPendingSeek?: () => void }).finishPendingSeek!());
  await expect(page.getByRole('button', { name: '停止播放或录音', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { playCalls?: number }).playCalls)).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
});
