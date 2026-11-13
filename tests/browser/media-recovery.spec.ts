import { waveformImage } from './waveform-pixels';
import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';

test.use({ sampleScene: true });
test.beforeEach(async ({ page }) => { await prepareMediaTest(page); });

test('a slow native video start does not reject a healthy recorded replay or cut its opening', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  await page.evaluate(() => {
    const video = document.querySelector('video')!;
    const play = video.play.bind(video);
    video.play = () => new Promise<void>((resolve, reject) => {
      setTimeout(() => { void play().then(resolve, reject); }, 250);
    });
    const NativeContext = AudioContext.prototype.createBufferSource;
    const audit = { duration: 0, offset: -1, pictureAtStart: -1, picturePaused: true };
    (window as unknown as { replayStart: typeof audit }).replayStart = audit;
    AudioContext.prototype.createBufferSource = function () {
      const source = NativeContext.call(this), start = source.start.bind(source);
      source.start = (when = 0, offset = 0, duration?: number) => {
        if (!source.loop) Object.assign(audit, { duration: duration ?? source.buffer!.duration, offset, pictureAtStart: video.currentTime, picturePaused: video.paused });
        start(when, offset, duration);
      };
      return source;
    };
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await listen.click();
    await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
    await expect(listen).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  const start = await page.evaluate(() => (window as unknown as { replayStart: { duration: number; offset: number; pictureAtStart: number; picturePaused: boolean } }).replayStart);
  // Captured PCM may include preroll before video time zero. Its offset varies
  // with native startup, but the entire visible 0–1.05 s voice window survives.
  expect(start.duration).toBeGreaterThan(1);
  expect(start.pictureAtStart).toBeLessThan(0.1);
  expect(start.picturePaused).toBe(false);
});

test('microphone loss and a failed replacement preserve the accepted take and release capture resources', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  const wave = page.getByRole('img', { name: '你的声音波形', exact: true });
  const accepted = await waveformImage(wave);
  await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const audit = (window as unknown as { mediaAudit: MediaAudit }).mediaAudit;
    audit.tracks.at(-1)!.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByRole('alert')).toContainText('麦克风');
  await expect(listen).toBeEnabled();
  await expect.poll(() => waveformImage(wave)).toBe(accepted);
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const interruption of ['pause', 'rate', 'audio-suspend'] as const) test(`recorded replay recovers from ${interruption} without losing its saved take`, async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const wave = page.getByRole('img', { name: '你的声音波形', exact: true });
  const accepted = await waveformImage(wave);
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.evaluate(async interruption => {
    const video = document.querySelector('video')!;
    if (interruption === 'pause') video.pause();
    else if (interruption === 'rate') video.playbackRate = 1.5;
    else await (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.context!.suspend();
  }, interruption);
  await expect(page.getByRole('alert')).toContainText('播放或录音暂时中断');
  await expect(listen).toBeEnabled();
  await expect.poll(() => waveformImage(wave)).toBe(accepted);
  expect(await page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.sources.size)).toBe(0);
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.playbackRate = 1; });
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect.poll(() => waveformImage(wave)).toBe(accepted);
  await expect(listen).toBeEnabled();
});

test('a Stop gesture cannot turn into a re-record when playback ends between pointer down and up', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  const count = await page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks.length);
  await listen.click();
  const stop = page.getByRole('button', { name: '停止播放', exact: true });
  await expect(stop).toBeVisible();
  await stop.hover();
  await page.mouse.down();
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
  await expect(page.getByRole('alert')).toContainText('播放或录音暂时中断');
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '重新录这一句', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { mediaAudit: MediaAudit }).mediaAudit.tracks.length)).toBe(count);
});

test('keyboard focus follows the recording control through startup and completion', async ({ page }) => {
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const record = page.getByRole('button', { name: '开始录音', exact: true });
  await record.focus(); await record.press('Enter');
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '重新录这一句', exact: true })).toBeFocused();
});
