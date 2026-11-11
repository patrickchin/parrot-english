import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('the picture follows the source proportions through role choice, practice and replay', async ({ page }) => {
  for (const slug of ['onions', 'wumbo']) {
    await page.goto('/#' + slug);
    await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
    const scene = page.getByRole('region', { name: '电影片段', exact: true });
    const picture = scene.getByLabel(/对话片段$/);
    const aspect = await picture.evaluate((video: HTMLVideoElement) => video.videoWidth / video.videoHeight);
    for (const step of ['choose', 'practice', 'result']) {
      if (step === 'practice') await page.getByRole('button', { name: '开始配音', exact: true }).click();
      if (step === 'result') {
        const pack = await (await page.request.get(`/packs/${slug}/pack.json`)).json();
        const turns = pack.lines.filter((line: { roleId: string }) => line.roleId === pack.roles[0].id);
        for (const _ of turns) await page.getByRole('button', { name: '下一步', exact: true }).click();
      }
      for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        // Mobile viewport and text metrics can settle on the next browser frame.
        await expect(async () => {
          const bounds = (await picture.boundingBox())!;
          expect(Math.abs(bounds.width - bounds.height * aspect), `${slug} ${step} at ${viewport.width}`).toBeLessThan(1);
          const overlay = (await scene.getByRole('button', { name: step === 'result' ? '播放我的配音' : '播放原片', exact: true }).boundingBox())!;
          expect(Math.abs(overlay.height - bounds.height)).toBeLessThan(1);
          const progress = (await scene.getByRole('progressbar', { name: '片段播放进度', exact: true }).boundingBox())!;
          expect(progress.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(progress.y + progress.height).toBeLessThan(viewport.height);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
        }).toPass({ timeout: 5000 });
      }
    }
  }
});

test('completion and replay keep the recording waveform and subtitles in place', async ({ page }, info) => {
  await page.goto('/#onions');
  const pack = await (await page.request.get('/packs/onions/pack.json')).json();
  const lines = pack.lines.filter((line: { roleId: string }) => line.roleId === pack.roles[0].id);
  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    const scene = page.getByRole('region', { name: '电影片段', exact: true });
    const graph = page.getByRole('region', { name: '声音波形对比', exact: true });
    const caption = page.getByRole('group', { name: '台词', exact: true });
    const regions = [scene, graph, caption];
    const recording = await Promise.all(regions.map(region => region.boundingBox()));
    const type = await caption.getByText(lines[0].text, { exact: true }).evaluate(el => ({ size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight) }));
    expect(type.size).toBeLessThanOrEqual(22);
    expect(type.weight).toBeLessThanOrEqual(500);
    const expectFixed = async () => {
      const positions = await Promise.all(regions.map(region => region.boundingBox()));
      for (const [i, box] of positions.entries()) {
        for (const dimension of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(box![dimension] - recording[i]![dimension]), `${viewport.width}px region ${i} ${dimension}`).toBeLessThan(1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    };
    for (const _ of lines) await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: '你的配音，完成啦！' })).toBeVisible();
    await expectFixed();
    await page.getByRole('region', { name: '配音完成', exact: true }).getByRole('button', { name: '播放我的配音', exact: true }).click();
    await expect(caption.getByText(pack.lines[0].text, { exact: true })).toBeVisible();
    await expectFixed();
    if (info.project.name === 'chromium' && [375, 1440].includes(viewport.width)) {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `dub-ready-fixed-${viewport.width}.png`) });
    }
    await page.getByRole('button', { name: '停止播放', exact: true }).click();
    await expectFixed();
    await page.getByRole('button', { name: '再改一句', exact: true }).click();
    await expectFixed();
  }
});
