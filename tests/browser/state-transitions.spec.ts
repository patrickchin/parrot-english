import { test, expect, headerDestination } from './fixtures';

test.use({ sampleScene: true });

test('completed recording releases its operation so late capture errors cannot change its outcome', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.addInitScript(() => {
    const NativeNode = AudioWorkletNode;
    window.AudioWorkletNode = class extends NativeNode {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        if (name === 'capture-waveform') (window as Window & { captureNode?: AudioWorkletNode }).captureNode = this;
      }
    };
  });
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled({ timeout: 12000 });
  await page.evaluate(() => (window as Window & { captureNode?: AudioWorkletNode }).captureNode!.dispatchEvent(new Event('processorerror')));
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(listen).toBeEnabled();
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
});

test('browser Back keeps saved takes and Forward restores the same session', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.goto('/');
  await page.getByRole('button', { name: '选择片段：你在找谁？', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled({ timeout: 12000 });
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const waveform = page.getByRole('img', { name: '你的声音波形', exact: true });
  const saved = await waveform.locator('path').getAttribute('d');
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: '查找片段', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  await expect(listen).toBeEnabled();
  await expect(waveform.locator('path')).toHaveAttribute('d', saved!);
});

test('changing the scene path leaves the saved attempt available in My dubs', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 12000 });
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.goto('/scenes/chocolate');
  await expect(page.getByRole('heading', { name: '巧克力？！', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await (await headerDestination(page, '我的配音')).click();
  await page.getByRole('button', { name: '继续配音：你在找谁？，Sintel', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
});

test('stalled original playback leaves loading with a retryable error', async ({ page }) => {
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    (window as Window & { restorePlay?: () => void }).restorePlay = () => { HTMLMediaElement.prototype.play = original; };
    HTMLMediaElement.prototype.play = () => new Promise<void>(() => {});
  });
  const original = page.getByRole('button', { name: '听这一句原声', exact: true });
  await original.click();
  await expect(page.getByRole('alert')).toContainText('视频定位较慢', { timeout: 12000 });
  await expect(original).toBeEnabled();
  await page.evaluate(() => (window as Window & { restorePlay?: () => void }).restorePlay!());
  await original.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
});

test('interrupted original playback returns to idle with the selected line intact', async ({ page }) => {
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
  await expect(page.getByRole('alert')).toContainText('播放或录音暂时中断');
  await expect(page.getByRole('button', { name: '听这一句原声', exact: true })).toBeEnabled();
  await expect(page.getByText('Thank you.', { exact: true })).toBeVisible();
});
