import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test.use({ sampleScene: true });

test('previous line sits beside Next and the labelled numbers select lines at every width', async ({ page }, info) => {
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  const previous = page.getByRole('button', { name: 'Previous line', exact: true });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  const lines = page.getByRole('navigation', { name: 'Your lines', exact: true });
  await expect(lines.getByText('Choose a line', { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(lines.getByRole('button', { name: /^Line 2:/ })).toHaveAttribute('aria-current', 'step');
  await previous.click();
  await expect(page.getByText('Thank you.', { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await lines.getByRole('button', { name: /^Line 3:/ }).click();
    await expect(page.getByText('A dragon.', { exact: true })).toBeVisible();
    await expect(previous).toBeEnabled();
    const backBox = (await previous.boundingBox())!;
    const nextBox = (await next.boundingBox())!;
    expect(backBox.height).toBe(nextBox.height);
    expect(backBox.y).toBe(nextBox.y);
    expect(backBox.x + backBox.width).toBeLessThan(nextBox.x);
    expect(backBox.width).toBeGreaterThanOrEqual(44);
    expect(backBox.width).toBeLessThan(nextBox.width / 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'chromium') {
      const screenshots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `practice-navigation-${width}.png`), fullPage: true });
    }
    await previous.click();
    await expect(page.getByText("I'm searching for someone.", { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Listen to the original line', exact: true }).click();
  await expect(previous).toBeDisabled();
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(previous).toBeEnabled();
});

test('shows the real clip, switches roles, and works at phone and tablet widths', async ({ page }, info) => {
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('heading', { name: '你在找谁？', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^旅人/ }).click();
  await expect(page.getByRole('button', { name: /^旅人/ })).toHaveAttribute('aria-pressed', 'true');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (info.project.name === 'chromium' && width !== 768) {
      const screenshots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `dubbing-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('旅人', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的配音，完成啦！' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByText('这一次先听原声，下次试着录一句。')).toBeVisible();
  await page.getByRole('region', { name: '配音完成' }).getByRole('button', { name: '播放我的配音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
});

test('records three real fake-microphone takes, retries, replays, and clears the session', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'A synthetic capture device is configured for Chromium only.');
  const uploads: string[] = [];
  page.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) uploads.push(req.url()); });
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 12000 });
    if (i === 0) {
      await expect(page.getByRole('navigation', { name: '你的台词' }).getByRole('button', { name: /^第 1 句/ })).toContainText('1');
      await page.getByRole('button', { name: '听我的录音', exact: true }).click();
      await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '停止播放', exact: true }).click();
      await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
      await expect(page.getByRole('button', { name: '取消', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
    }
    await page.getByRole('button', { name: i < 2 ? '下一步' : '看我的配音', exact: true }).click();
    if (i === 0) {
      await page.getByRole('button', { name: '上一句', exact: true }).click();
      await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '下一步', exact: true }).click();
    }
  }
  await expect(page.getByText('录了 3 句台词。', { exact: false })).toBeVisible();
  await page.getByRole('region', { name: '配音完成', exact: true }).getByRole('button', { name: '播放我的配音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1);
  await expect(page.locator('video')).toHaveJSProperty('muted', true);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  expect(uploads).toEqual([]);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '保留录音，继续玩', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的配音，完成啦！' })).toBeVisible();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '开始新的配音', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeDisabled();
  await expect(page.getByText('已完成 0 / 3 句', { exact: true })).toHaveCount(1);
});

test('denied microphone permission has a retry path without losing the selected line', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('Denied for test', 'NotAllowedError'); } } }); });
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('麦克风还没开启');
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await expect(page.getByText('Thank you.', { exact: true })).toBeVisible();
});

test('invalid scenes are rejected and a failed video offers reload', async ({ page }) => {
  await page.route('**/scene.json', route => route.fulfill({ json: { version: 999 } }));
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeEnabled();
  await page.unroute('**/scene.json');
  await page.route('**/search-v1.mp4', route => route.abort());
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('视频没能加载成功');
  await expect(page.getByRole('button', { name: '重新加载视频', exact: true })).toBeVisible();
});

test('silent input is rejected instead of marking the line complete', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic Web Audio capture is exercised in Chromium.');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
    const context = new AudioContext(); await context.resume();
    const stream = context.createMediaStreamDestination().stream;
    setTimeout(() => { void context.close(); }, 15000);
    return stream;
  } } }); });
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('没听到清楚的声音', { timeout: 12000 });
  await expect(page.getByText('已完成 0 / 3 句', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeEnabled();
});

test('cancelling a pending microphone request stops a late stream', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic Web Audio capture is exercised in Chromium.');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(resolve => {
    (window as unknown as { resolveTestMic: (stream: MediaStream) => void }).resolveTestMic = resolve;
  }) } }); });
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const stopped = await page.evaluate(async () => {
    const context = new AudioContext();
    const stream = context.createMediaStreamDestination().stream;
    (window as unknown as { resolveTestMic: (stream: MediaStream) => void }).resolveTestMic(stream);
    await new Promise(resolve => setTimeout(resolve, 50));
    const ended = stream.getTracks().every(track => track.readyState === 'ended');
    await context.close(); return ended;
  });
  expect(stopped).toBe(true);
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
});
