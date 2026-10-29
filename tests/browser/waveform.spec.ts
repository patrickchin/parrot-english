import { test, expect } from './fixtures';
import type { Line } from '../../src/pack';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('reference, live take, and saved take share a moving timeline; cancelling keeps the previous trace', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.goto('/#patrick');
  const pack = await (await page.request.get('/packs/patrick/pack.json')).json();
  const turn: Line = pack.lines.find((l: Line) => l.roleId === pack.roles[0].id);
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
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible({ timeout: 1500 });
  await expect(page.locator('video')).toHaveJSProperty('paused', false);
  await expect(page.locator('video')).toHaveJSProperty('muted', true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
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
  await expect(page.locator('video')).toHaveJSProperty('paused', false);
  await expect(page.locator('video')).toHaveJSProperty('muted', true);
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.15);
  // The role starts later in the scene; picture and cursor must share that offset.
  await expect.poll(async () => Math.abs(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime) - turn.start - Number(await cursor.getAttribute('aria-valuenow')))).toBeLessThan(0.15);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  const stoppedAt = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(stoppedAt).toBeGreaterThanOrEqual(turn.end);
  expect(stoppedAt).toBeLessThan(turn.end + 0.2);
  await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '清空录音，重新开始', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toHaveCount(0);
});

test('missing waveform metadata leaves recording and reference playback available', async ({ page }) => {
  await page.route('**/waveform-v2.json', route => route.fulfill({ json: { version: 1, peaks: ['invalid'] } }));
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
      const waveform = await page.getByRole('img', { name: '原声波形', exact: true }).boundingBox();
      const words = await page.getByRole('list', { name: '逐词台词' }).boundingBox();
      expect(words!.y).toBeGreaterThanOrEqual(waveform!.y + waveform!.height);
      expect(words!.y - waveform!.y - waveform!.height).toBeLessThanOrEqual(2);
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


test('words share the waveform time scale, stay readable, and follow playback without scrolling the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/#onions');
  const pack = await (await page.request.get('/packs/onions/pack.json')).json();
  const line: Line = pack.lines[0];
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const list = page.getByRole('list', { name: '逐词台词' });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(line.words!.length);
  for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const wave = await page.getByRole('img', { name: '原声波形', exact: true }).boundingBox();
    const boxes = await items.evaluateAll(nodes => nodes.map(n => {
      const position = n.getBoundingClientRect();
      const text = n.firstElementChild!.getBoundingClientRect();
      return { x: position.x, text: { x: text.x, y: text.y, right: text.right, bottom: text.bottom } };
    }));
    for (const [i, box] of boxes.entries()) {
      const expected = wave!.x + (line.words![i].start - line.start) / (line.end - line.start) * wave!.width;
      expect(Math.abs(box.x - expected)).toBeLessThan(2);
      for (const other of boxes.slice(i + 1)) {
        const overlap = box.text.x < other.text.right && box.text.right > other.text.x && box.text.y < other.text.bottom && box.text.bottom > other.text.y;
        expect(overlap).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 667 });
  const timeline = page.getByRole('group', { name: '声音与台词时间轴' });
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  const onions = items.filter({ hasText: /^Onions$/ }).first();
  await expect(onions).toHaveAttribute('aria-current', 'true', { timeout: 6000 });
  const word = await onions.boundingBox(), visible = await timeline.boundingBox();
  expect(word!.x).toBeGreaterThanOrEqual(visible!.x);
  expect(word!.x + word!.width).toBeLessThanOrEqual(visible!.x + visible!.width);
  expect(await timeline.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
});
