import { test, expect } from './fixtures';

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
