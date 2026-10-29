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
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const desktopRecord = await page.getByRole('button', { name: '重新录这一句', exact: true }).boundingBox();
    expect(desktopRecord!.y + desktopRecord!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: join(folder, 'warm-waveform-recorded.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    for (const name of ['听我的录音', '下一句']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(56);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(667);
    }
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


test('scene, caption, waveforms and every main action fit one screen across the starter packs', async ({ page }, info) => {
  for (const slug of ['onions', 'patrick', 'wumbo', 'chocolate', 'sintel']) {
    await page.goto('/#' + slug);
    await page.getByRole('button', { name: '片段与来源', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: '观看原片' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `${slug} role picker at ${viewport.width}×${viewport.height}`).toBe(true);
    }
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `${slug} player at ${viewport.width}×${viewport.height}`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ['听这一句原声', '开始录音', '听我的录音', '下一句']) {
        const action = page.getByRole('group', { name: '配音操作' }).getByRole('button', { name: name === '下一句' ? /下一句|继续配音/ : name, exact: true });
        const bounds = await action.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(56);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      }
      const scene = await page.getByRole('region', { name: '电影片段' }).boundingBox();
      const footer = await page.getByRole('contentinfo').boundingBox();
      const actions = await page.getByRole('group', { name: '配音操作' }).boundingBox();
      expect(scene!.height).toBeGreaterThanOrEqual(140);
      expect(footer!.y).toBeGreaterThanOrEqual(actions!.y + actions!.height);
      if (slug === 'onions' && info.project.name === 'chromium' && [375, 1280].includes(viewport.width)) {
        const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
        await mkdir(folder, { recursive: true });
        await page.screenshot({ path: join(folder, `compact-player-${viewport.width}.png`) });
      }
    }
  }
});
