import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('reference, live take, and saved take share a moving timeline; cancelling keeps the previous trace', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.goto('/#patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const graph = page.getByRole('region', { name: '声音波形对比' });
  const cursor = graph.getByRole('progressbar', { name: '配音时间指针' });
  await expect(graph.getByRole('img', { name: '原声波形', exact: true })).toBeVisible();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.15);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.getByRole('button', { name: '同意并开始录音', exact: true }).click();
  await expect(cursor).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.2);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 12000 });
  await expect.poll(() => graph.getByRole('img', { name: '你的声音波形', exact: true }).locator('path').evaluate((path: SVGPathElement) => path.getBBox().height)).toBeGreaterThan(1);
  if (info.project.name === 'chromium') {
    const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(folder, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopRecord = await page.getByRole('button', { name: '重新录这一句', exact: true }).boundingBox();
    expect(desktopRecord!.y + desktopRecord!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: join(folder, 'warm-waveform-recorded.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const mobileRecord = await page.getByRole('button', { name: '重新录这一句', exact: true }).boundingBox();
    expect(mobileRecord!.y + mobileRecord!.height).toBeLessThanOrEqual(812);
    await page.screenshot({ path: join(folder, 'warm-waveform-mobile.png'), fullPage: true });
  }
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.15);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '清空录音，重新开始', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toHaveCount(0);
});

test('missing waveform metadata leaves recording and reference playback available', async ({ page }) => {
  await page.route('**/waveform-v1.json', route => route.fulfill({ json: { version: 1, peaks: ['invalid'] } }));
  await page.goto('/#patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('原声波形暂时无法显示，仍可听原声并录音。')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '听这一句原声', exact: true })).toBeEnabled();
});
