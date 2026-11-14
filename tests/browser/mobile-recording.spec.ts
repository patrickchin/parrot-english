import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';
import type { Page } from '@playwright/test';

test.use({ sampleScene: true });
test.beforeEach(async ({ page }) => {
  await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
});

async function expectReleasedMicrophone(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks;
    return tracks.length > 0 && tracks.every(track => track.readyState === 'ended');
  }), { timeout: 1500 }).toBe(true);
}

test('a blocked video start reports playback failure after microphone permission and can retry recording', async ({ page }) => {
  await page.locator('video').evaluate((video: HTMLVideoElement) => {
    const play = video.play.bind(video);
    let blocked = true;
    video.play = () => {
      if (!blocked) return play();
      blocked = false;
      return Promise.reject(new DOMException('Playback requires a user gesture', 'NotAllowedError'));
    };
  });
  const record = page.getByRole('button', { name: '开始录音', exact: true });
  await record.click();
  await expect(page.getByRole('alert')).toHaveText('视频暂时无法播放，请重新加载片段。');
  await expectReleasedMicrophone(page);
  await expect(record).toBeEnabled();
  await record.click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expectReleasedMicrophone(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

type StartupAudit = { contexts: AudioContext[]; resumes: number };

async function blockFirstAudioContext(page: Page) {
  await page.evaluate(() => {
    const NativeContext = AudioContext;
    const audit: StartupAudit = { contexts: [], resumes: 0 };
    (window as unknown as { startupAudit: StartupAudit }).startupAudit = audit;
    // The fixture retains its own constructor for the synthetic microphone.
    // Only the first application context models a stuck mobile audio session.
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); audit.contexts.push(this); }
      resume() {
        if (audit.contexts[0] === this) { audit.resumes++; return new Promise<void>(() => {}); }
        return super.resume();
      }
    };
  });
}

async function expectFreshRecording(page: Page) {
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { startupAudit: StartupAudit }).startupAudit.contexts.length)).toBe(2);
  await expectReleasedMicrophone(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('a pending audio resume times out, releases the microphone and retries with a fresh context', async ({ page }) => {
  await blockFirstAudioContext(page);
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { startupAudit: StartupAudit }).startupAudit.resumes)).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toHaveText('播放或录音暂时中断了，请再试一次。', { timeout: 11000 });
  await expectReleasedMicrophone(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { startupAudit: StartupAudit }).startupAudit.contexts[0].state)).toBe('closed');
  await expectFreshRecording(page);
});

test('cancelling a pending audio resume immediately releases capture and leaves a fresh retry usable', async ({ page }) => {
  await blockFirstAudioContext(page);
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  // Wait past permission and worklet setup so Cancel interrupts audio resume.
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.captures.length)).toBe(1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled({ timeout: 1500 });
  await expectReleasedMicrophone(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { startupAudit: StartupAudit }).startupAudit.contexts[0].state), { timeout: 1500 }).toBe('closed');
  await expectFreshRecording(page);
});
