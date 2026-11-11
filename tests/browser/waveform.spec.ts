import { scenePath } from '../../src/app/routes';
import { test, expect, documentBoxes } from './fixtures';
import type { Line } from '../../src/scene';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('reference, live take, and saved take share a moving timeline; cancelling keeps the previous trace', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Synthetic microphone capture is configured for Chromium.');
  await page.goto('/scenes/patrick');
  const scene = await (await page.request.get('/scenes/patrick/scene.json')).json();
  const turn: Line = scene.lines.find((l: Line) => l.roleId === scene.roles[0].id);
  const nextTurn: Line | undefined = scene.lines[scene.lines.findIndex((l: Line) => l.id === turn.id) + 1];
  const windowEnd = Math.min(scene.duration, turn.end + 0.5, nextTurn?.start ?? scene.duration);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const graph = page.getByRole('region', { name: '声音波形对比' });
  const cursor = graph.getByRole('progressbar', { name: '配音时间指针' });
  await expect(graph.getByRole('img', { name: '原声波形', exact: true })).toBeVisible();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.15);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
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
    for (const name of ['听我的录音', '下一步']) {
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
  await expect.poll(async () => Math.abs(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime) - Math.max(0, turn.start - 0.5) - Number(await cursor.getAttribute('aria-valuenow')))).toBeLessThan(0.15);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  const stoppedAt = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(stoppedAt).toBeGreaterThanOrEqual(windowEnd);
  expect(stoppedAt).toBeLessThan(windowEnd + 0.2);
  await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '开始新的配音', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(graph.getByRole('img', { name: '你的声音波形', exact: true })).toHaveCount(0);
});

test('missing waveform metadata leaves recording and reference playback available', async ({ page }) => {
  await page.route('**/waveform-v2.json', route => route.fulfill({ json: { version: 1, peaks: ['invalid'] } }));
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('原声波形暂时无法显示，仍可听原声并录音。')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '听这一句原声', exact: true })).toBeEnabled();
});


test('scene, caption, waveforms and every main action remain reachable across the starter scenes', async ({ page }, info) => {
  for (const slug of ['onions', 'patrick', 'wumbo', 'chocolate', 'infinity']) {
    await page.goto(scenePath(slug));
    await page.getByRole('button', { name: '片段与来源', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: '观看原片' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug} role picker at ${viewport.width}×${viewport.height}`).toBe(true);
      const start = page.getByRole('button', { name: '开始配音', exact: true });
      await start.scrollIntoViewIfNeeded();
      await expect(start).toBeInViewport();
    }
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ['听这一句原声', '开始录音', '听我的录音', '下一步']) {
        const action = page.getByRole('group', { name: '配音操作' }).getByRole('button', { name, exact: true });
        const bounds = await action.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(56);
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
      }
      const waveform = await page.getByRole('img', { name: '原声波形', exact: true }).boundingBox();
      const words = await page.getByRole('group', { name: '台词', exact: true }).boundingBox();
      expect(words!.y).toBeGreaterThanOrEqual(waveform!.y + waveform!.height);
      expect(words!.y - waveform!.y - waveform!.height).toBeLessThanOrEqual(10);
      const entry = await page.getByRole('region', { name: '电影片段' }).boundingBox();
      expect(entry!.height).toBeGreaterThanOrEqual(140);
      if (slug === 'onions' && info.project.name === 'chromium' && [375, 1280].includes(viewport.width)) {
        const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
        await mkdir(folder, { recursive: true });
        await page.screenshot({ path: join(folder, `compact-player-${viewport.width}.png`) });
      }
    }
  }
});


test('plain dialogue and controls stay fixed when switching lines and skipping to the result', async ({ page }, info) => {
  for (const slug of ['onions', 'patrick', 'wumbo', 'infinity']) {
    await page.goto(scenePath(slug));
    const scene = await (await page.request.get(`/scenes/${slug}/scene.json`)).json();
    const lines: Line[] = scene.lines.filter((line: Line) => line.roleId === scene.roles[0].id);
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      const entry = page.getByRole('region', { name: '电影片段' });
      const graph = page.getByRole('region', { name: '声音波形对比' });
      const caption = page.getByRole('group', { name: '台词', exact: true });
      const actions = page.getByRole('group', { name: '配音操作' });
      const before = await documentBoxes(page, [entry, graph, caption, actions]);
      for (const [i, line] of lines.entries()) {
        await page.getByRole('button', { name: `第 ${i + 1} 句：${line.text}`, exact: true }).click();
        await expect(caption.getByText(line.text, { exact: true })).toBeVisible();
        await expect(caption.getByText(line.hint, { exact: true })).toBeVisible();
        const after = await documentBoxes(page, [entry, graph, caption, actions]);
        for (const [index, box] of after.entries()) {
          for (const dimension of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(box![dimension] - before[index]![dimension]), `${slug} line ${i + 1}, ${viewport.width}px ${dimension}`).toBeLessThan(1);
          }
        }
        const restart = await page.getByRole('button', { name: '重新开始', exact: true }).boundingBox();
        expect(restart!.height).toBeGreaterThanOrEqual(44);
        const reset = page.getByRole('button', { name: '重新开始', exact: true });
        await reset.scrollIntoViewIfNeeded();
        await expect(reset).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (slug === 'onions' && info.project.name === 'chromium') {
        const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
        await mkdir(folder, { recursive: true });
        await page.screenshot({ path: join(folder, `stable-dubbing-${viewport.width}.png`) });
      }
    }
    await page.getByRole('button', { name: `第 1 句：${lines[0].text}`, exact: true }).click();
    for (const [i] of lines.entries()) {
      await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '下一步', exact: true }).click();
      if (i < lines.length - 1) await expect(page.getByText(`已完成 ${i + 1} / ${lines.length} 句`, { exact: true })).toHaveCount(1);
    }
    await expect(page.getByRole('heading', { name: '你的配音，完成啦！' })).toBeVisible();
    await expect(page.getByText('录了 0 句台词。', { exact: false })).toBeVisible();
  }
});

// Sample what was actually painted, rather than relying on an occasional poll.
test('playhead advances on animation frames and stays on the video clock', async ({ page }) => {
  await page.goto('/scenes/onions');
  const scene = await (await page.request.get('/scenes/onions/scene.json')).json();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const cursor = page.getByRole('progressbar', { name: '配音时间指针' });
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.1);
  const samples = await cursor.evaluate(async (node, start) => {
    const video = document.querySelector('video')!;
    const samples: { time: number; media: number; cursor: number; x: number }[] = [];
    const until = performance.now() + 1000;
    await new Promise<void>(resolve => {
      const sample = () => {
        samples.push({ time: performance.now(), media: video.currentTime - start, cursor: Number(node.getAttribute('aria-valuenow')), x: node.getBoundingClientRect().x });
        if (performance.now() < until) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    return samples;
  }, scene.lines[0].start);
  const changes = samples.filter((s, i) => i > 0 && s.x !== samples[i - 1].x);
  // The old 80 ms throttle produces at most 13 changes in this window.
  expect(changes.length).toBeGreaterThan(samples.length * 0.65);
  expect(changes.length).toBeGreaterThan(25);
  expect(Math.max(...samples.map(s => Math.abs(s.media - s.cursor)))).toBeLessThan(0.06);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  const stopped = Number(await cursor.getAttribute('aria-valuenow'));
  expect(Math.abs(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime) - scene.lines[0].start - stopped)).toBeLessThan(0.02);
});
