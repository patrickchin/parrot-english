import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';
import type { Page } from '@playwright/test';

type PictureStartup = { pending: boolean; audioAtPlay: number; release: () => Promise<void> };
type StartupWindow = Window & { pictureStartup: PictureStartup; mediaAudit: MediaAudit };

test.use({ sampleScene: true });
test.beforeEach(async ({ page }) => {
  await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.locator('video').evaluate((video: HTMLVideoElement) => {
    const play = video.play.bind(video), pause = video.pause.bind(video);
    const nativePaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused')!.get!;
    const state = window as unknown as StartupWindow;
    let parked = false, generation = 0;
    let release: (() => Promise<void>) | undefined;
    state.pictureStartup = {
      pending: false, audioAtPlay: 0,
      release: async () => { const current = release; release = undefined; await current?.(); },
    };
    Object.defineProperty(video, 'paused', { configurable: true, get: () => parked ? false : nativePaused.call(video) });
    video.play = () => new Promise<void>((resolve, reject) => {
      const attempt = ++generation;
      parked = true; state.pictureStartup.pending = true;
      state.pictureStartup.audioAtPlay = state.mediaAudit.context!.currentTime;
      // Model WebKit reporting playing before its native picture clock advances.
      // The test releases actual playback only after observing the parked state.
      release = async () => {
        if (attempt !== generation) { resolve(); return; }
        parked = false; state.pictureStartup.pending = false;
        await play().then(resolve, reject);
      };
      video.dispatchEvent(new Event('playing'));
    });
    video.pause = () => {
      generation++; parked = false; state.pictureStartup.pending = false;
      pause();
    };
  });
});

async function expectParkedPreparation(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as StartupWindow).pictureStartup.pending)).toBe(true);
  // The real audio clock must outlast the 120 ms sync guard while video is parked.
  await expect.poll(() => page.evaluate(() => {
    const state = window as unknown as StartupWindow;
    return state.mediaAudit.context!.currentTime - state.pictureStartup.audioAtPlay;
  })).toBeGreaterThan(0.25);
  await expect(page.getByRole('status').filter({ hasText: '正在准备…' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

async function releasePicture(page: Page) {
  await page.evaluate(() => (window as unknown as StartupWindow).pictureStartup.release());
}

async function expectMicrophoneReleased(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as unknown as StartupWindow).mediaAudit.tracks;
    return tracks.length > 0 && tracks.every(track => track.readyState === 'ended');
  })).toBe(true);
}

test('early playing waits for the moving picture before recording and recorded replay', async ({ page }) => {
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expectParkedPreparation(page);
  await releasePicture(page);
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expectMicrophoneReleased(page);
  await listen.click();
  await expectParkedPreparation(page);
  expect(await page.evaluate(() => [...(window as unknown as StartupWindow).mediaAudit.sources].filter(source => !source.loop).length)).toBe(0);
  await releasePicture(page);
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('cancelling an early-playing startup releases capture and prevents a late picture start', async ({ page }) => {
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expectParkedPreparation(page);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await expectMicrophoneReleased(page);
  await releasePicture(page);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a playing event without picture progress times out and releases the microphone', async ({ page }) => {
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expectParkedPreparation(page);
  await expect(page.getByRole('alert')).toHaveText('视频暂时无法播放，请重新加载片段。', { timeout: 11000 });
  await expectMicrophoneReleased(page);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeDisabled();
});
