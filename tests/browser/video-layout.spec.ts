import { readScene } from '../content-fixtures';
import { test, expect, documentBoxes } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('the picture follows the source proportions through role choice, practice and replay', async ({ page }) => {
  for (const slug of ['onions', 'wumbo', 'mayonnaise']) {
    await page.goto('/scenes/' + slug);
    await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
    const movie = page.getByRole('region', { name: '电影片段', exact: true });
    const picture = movie.getByLabel(/对话片段$/);
    const aspect = await picture.evaluate((video: HTMLVideoElement) => video.videoWidth / video.videoHeight);
    for (const step of ['choose', 'practice', 'result']) {
      if (step === 'practice') await page.getByRole('button', { name: '开始配音', exact: true }).click();
      if (step === 'result') {
        const scene = readScene(slug);
        const turns = scene.lines.filter((line: { roleId: string }) => line.roleId === scene.roles[0].id);
        for (const _ of turns) await page.getByRole('button', { name: '下一步', exact: true }).click();
      }
      for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }, { width: 1440, height: 1200 }]) {
        await page.setViewportSize(viewport);
        // Mobile viewport and text metrics can settle on the next browser frame.
        await expect(async () => {
          const bounds = (await picture.boundingBox())!;
          const sceneBounds = (await movie.boundingBox())!;
          const frame = await picture.evaluate(el => {
            const bounds = el.parentElement!.parentElement!.getBoundingClientRect();
            return { y: bounds.y, height: bounds.height };
          });
          const groupEnd = step === 'choose'
            ? (await page.getByRole('region', { name: '原片字幕', exact: true }).boundingBox())!
            : { y: frame.y, height: frame.height };
          expect(Math.abs((frame.y + groupEnd.y + groupEnd.height) / 2 - sceneBounds.y - sceneBounds.height / 2), 'video and captions remain vertically centered').toBeLessThan(1);
          if (step === 'choose' && viewport.width >= 900) {
            const roles = (await page.getByRole('region', { name: '选择角色', exact: true }).boundingBox())!;
            expect(Math.abs(roles.y - frame.y), 'role choices share the top of the video').toBeLessThan(1);
          }
          expect(Math.abs(bounds.width - bounds.height * aspect), `${slug} ${step} at ${viewport.width}`).toBeLessThan(1);
          const overlay = (await movie.getByRole('button', { name: step === 'result' ? '播放我的配音' : '播放原片', exact: true }).boundingBox())!;
          expect(overlay.width).toBeGreaterThanOrEqual(bounds.width - 1);
          expect(overlay.height).toBeGreaterThanOrEqual(bounds.height - 1);
          expect(Math.abs(overlay.x + overlay.width / 2 - bounds.x - bounds.width / 2), 'picture is centered within the black viewing area').toBeLessThan(1);
          expect(Math.abs(overlay.y + overlay.height / 2 - bounds.y - bounds.height / 2)).toBeLessThan(1);
          if (step !== 'choose') {
            const graph = (await page.getByRole('region', { name: '声音波形对比', exact: true }).boundingBox())!;
            expect(Math.abs(overlay.x - sceneBounds.x)).toBeLessThan(1);
            expect(Math.abs(overlay.width - sceneBounds.width), 'viewing area fills the dialogue column').toBeLessThan(1);
            expect(graph.x).toBeGreaterThanOrEqual(overlay.x);
            expect(graph.x + graph.width).toBeLessThanOrEqual(overlay.x + overlay.width);
            if (viewport.width >= 900 && step === 'practice') {
              const controls = (await page.getByRole('group', { name: '配音操作', exact: true }).boundingBox())!;
              expect(controls.x - overlay.x - overlay.width, 'controls sit close to the viewing area').toBeCloseTo(24, 0);
              expect(Math.abs(controls.y - overlay.y)).toBeLessThan(1);
            }
          }
          const progress = (await movie.getByRole('progressbar', { name: '片段播放进度', exact: true }).boundingBox())!;
          expect(progress.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(progress.y + progress.height).toBeLessThan(viewport.height);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (step !== 'choose' || viewport.width >= 900) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), `${slug} ${step} at ${viewport.width} × ${viewport.height} fits without scrolling`).toBe(true);
        }).toPass({ timeout: 5000 });
      }
    }
  }
});

test('completion and replay keep the recording waveform and subtitles in place', async ({ page }, info) => {
  await page.goto('/scenes/onions');
  const scene = readScene('onions');
  const lines = scene.lines.filter((line: { roleId: string }) => line.roleId === scene.roles[0].id);
  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    // A reload now resumes the saved dub. Open a fresh attempt for each layout.
    await page.goto('/scenes/onions');
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    const movie = page.getByRole('region', { name: '电影片段', exact: true });
    const graph = page.getByRole('region', { name: '声音波形对比', exact: true });
    const caption = page.getByRole('group', { name: '台词', exact: true });
    const regions = [movie, graph, caption];
    const recording = await documentBoxes(page, regions);
    const type = await caption.getByText(lines[0].text, { exact: true }).evaluate(el => ({ size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight) }));
    expect(type.size).toBeLessThanOrEqual(22);
    expect(type.weight).toBeLessThanOrEqual(500);
    const expectFixed = async () => {
      const positions = await documentBoxes(page, regions);
      for (const [i, box] of positions.entries()) {
        for (const dimension of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(box![dimension] - recording[i]![dimension]), `${viewport.width}px region ${i} ${dimension}`).toBeLessThan(1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const credits = page.getByRole('button', { name: '片段与来源', exact: true });
      await credits.scrollIntoViewIfNeeded();
      await expect(credits).toBeInViewport();
    };
    for (const _ of lines) await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: '你的配音，完成啦！' })).toBeVisible();
    await expectFixed();
    await page.getByRole('region', { name: '配音完成', exact: true }).getByRole('button', { name: '播放我的配音', exact: true }).click();
    await expect(caption.getByText(scene.lines[0].text, { exact: true })).toBeVisible();
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
