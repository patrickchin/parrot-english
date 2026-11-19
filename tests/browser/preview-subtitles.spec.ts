import { readScene } from '../content-fixtures';
import { test, expect, setLanguage, documentBoxes } from './fixtures';
import { expectPictureSubtitles } from './picture-subtitles';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.route('**/scenes/onions/scene.json', async route => {
    const scene = readScene('onions');
    scene.lines = [
      { id: 'line_preview_a', roleId: scene.roles[0].id, start: 0, end: 0.8, text: 'Onions have layers.', hint: '洋葱有层次。' },
      { id: 'line_preview_b', roleId: scene.roles[1].id, start: 1.8, end: 4.5, text: 'Ogres have layers.', hint: '怪物也有层次。' },
      { id: 'line_preview_c', roleId: scene.roles[0].id, start: 5, end: 6.5, text: 'You get it?', hint: '你明白了吗？' },
      { id: 'line_preview_d', roleId: scene.roles[1].id, start: 7, end: 8.5, text: 'Oh, you both have layers.', hint: '哦，你们都有层次。' },
    ];
    await route.fulfill({ json: scene });
  });
});

test('one bilingual subtitle group stays on the picture through role choice, line selection and completion', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/scenes/onions');
  const subtitles = page.getByRole('group', { name: '台词', exact: true });
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toBeVisible();
  await expect(subtitles.getByText('洋葱有层次。', { exact: true })).toHaveAttribute('lang', 'zh-CN');
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('region', { name: '原片字幕', exact: true })).toHaveCount(0);
  await expectPictureSubtitles(page, '电影片段', '台词');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '第 2 句：You get it?', exact: true }).click();
  await expect(subtitles.getByText('You get it?', { exact: true })).toBeVisible();
  await expect(subtitles.getByText('你明白了吗？', { exact: true })).toBeVisible();
  for (const viewport of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(async () => {
      await expectPictureSubtitles(page, '电影片段', '台词');
      const waveform = (await page.getByRole('region', { name: '声音波形对比', exact: true }).boundingBox())!;
      const actions = (await page.getByRole('group', { name: '配音操作', exact: true }).boundingBox())!;
      expect(waveform.y).toBeGreaterThanOrEqual(0);
      expect(waveform.y + waveform.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(actions.y).toBeGreaterThanOrEqual(0);
      expect(actions.y + actions.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1);
    }).toPass({ timeout: 3000 });
    if (info.project.name === 'chromium' && [375, 1440].includes(viewport.width)) {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `picture-subtitles-practice-${viewport.width}.png`) });
    }
  }
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '看我的配音 (播放)', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的配音，完成啦！', exact: true })).toBeAttached();
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toBeVisible();
  await expectPictureSubtitles(page, '电影片段', '台词');
});

test('preview follows actual dialogue timing, holds the previous cue through gaps and resets on replay', async ({ page }) => {
  await page.goto('/scenes/onions');
  const subtitles = page.getByRole('group', { name: '台词', exact: true });
  const picture = page.getByRole('region', { name: '电影片段', exact: true }).getByLabel(/对话片段$/);
  // Subtitles must not intercept the existing picture playback action.
  await expect(subtitles).toBeVisible();
  await expect(page.getByRole('button', { name: '播放原片', exact: true })).toBeEnabled();
  const caption = (await subtitles.boundingBox())!;
  await page.mouse.click(caption.x + caption.width / 2, caption.y + caption.height / 2);
  await expect(picture).toHaveJSProperty('paused', false);
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toBeVisible();
  const gap = await picture.evaluate((video: HTMLVideoElement) => new Promise<{ time: number; text?: string | null }>(resolve => {
    const check = () => {
      if (video.currentTime > 0.9) resolve({ time: video.currentTime, text: video.parentElement!.querySelector('[lang="en"]')?.textContent });
      else requestAnimationFrame(check);
    };
    check();
  }));
  expect(gap.time).toBeLessThan(1.8);
  expect(gap.text).toBe('Onions have layers.');
  for (const cue of [
    { text: 'Ogres have layers.', hint: '怪物也有层次。' },
    { text: 'You get it?', hint: '你明白了吗？' },
    { text: 'Oh, you both have layers.', hint: '哦，你们都有层次。' },
  ]) {
    await expect(subtitles.getByText(cue.text, { exact: true })).toBeVisible();
    await expect(subtitles.getByText(cue.hint, { exact: true })).toBeVisible();
    await expect(subtitles.getByRole('listitem')).toHaveCount(0);
    await expectPictureSubtitles(page, '电影片段', '台词');
  }
  await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect(subtitles.getByText('Onions have layers.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('region', { name: '配音完成', exact: true }).getByRole('button', { name: '播放我的配音', exact: true }).click();
  await expect(subtitles.getByText('Ogres have layers.', { exact: true })).toBeVisible();
  await expectPictureSubtitles(page, '电影片段', '台词');
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await setLanguage(page, 'en');
  const english = page.getByRole('group', { name: 'Dialogue', exact: true });
  await expect(english.getByText('Ogres have layers.', { exact: true })).toBeVisible();
  await expect(english.getByText('怪物也有层次。', { exact: true })).toBeVisible();
  await expectPictureSubtitles(page, 'Movie scene', 'Dialogue');
});

test('subtitles do not move the picture, role choices or transport during playback in either theme', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/scenes/onions');
  await setLanguage(page, 'en');
  const picture = page.getByRole('region', { name: 'Movie scene', exact: true }).getByLabel(/dialogue scene$/);
  const roles = page.getByRole('region', { name: 'Choose a role', exact: true });
  const transport = page.getByRole('progressbar', { name: 'Scene playback progress', exact: true });
  for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(page.getByRole('button', { name: 'Play original scene', exact: true })).toBeEnabled();
    await expect.poll(() => picture.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
    await expect(async () => {
      const box = (await picture.boundingBox())!;
      const aspect = await picture.evaluate((video: HTMLVideoElement) => video.videoWidth / video.videoHeight);
      const viewing = (await page.getByRole('button', { name: 'Play original scene', exact: true }).boundingBox())!;
      // Nested container queries can settle after the native source ratio does.
      expect(Math.abs(box.width - Math.min(viewing.width, viewing.height * aspect))).toBeLessThan(1);
      expect(Math.abs(box.height - Math.min(viewing.height, viewing.width / aspect))).toBeLessThan(1);
    }).toPass({ timeout: 3000 });
    const before = await documentBoxes(page, [picture, roles, transport]);
    await page.getByRole('button', { name: 'Play original scene', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Dialogue', exact: true }).getByText('Ogres have layers.', { exact: true })).toBeVisible();
    await expectPictureSubtitles(page, 'Movie scene', 'Dialogue');
    const after = await documentBoxes(page, [picture, roles, transport]);
    for (const [index, box] of after.entries()) for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(box![dimension] - before[index]![dimension]), `${viewport.width}px region ${index} ${dimension}`).toBeLessThan(1);
    }
    await page.getByRole('button', { name: 'Stop playback or recording', exact: true }).click();
    if (info.project.name === 'chromium' && viewport.width === 375) {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
        await page.screenshot({ path: join(folder, `picture-subtitles-${theme}.png`) });
      }
      await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    }
  }
});

test('the longest authored bilingual cue fits the viewing area on a small phone and in landscape', async ({ page }) => {
  const scene = readScene('madagascar-little-situation');
  const cue = scene.lines.reduce((longest: typeof scene.lines[number], line: typeof scene.lines[number]) => line.text.length + line.hint.length > longest.text.length + longest.hint.length ? line : longest);
  expect(cue.text).toHaveLength(255);
  expect(cue.hint).toHaveLength(65);
  await page.goto('/en/scenes/madagascar-little-situation');
  await page.getByRole('region', { name: 'Choose a role', exact: true }).getByRole('button', { name: 'Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await page.getByRole('button', { name: `Line 2: ${cue.text}`, exact: true }).click();
  const subtitles = page.getByRole('group', { name: 'Dialogue', exact: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(subtitles.getByText(cue.text, { exact: true })).toBeVisible();
    await expect(subtitles.getByText(cue.hint, { exact: true })).toBeVisible();
    await expect(async () => {
      await expectPictureSubtitles(page, 'Movie scene', 'Dialogue');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    }).toPass({ timeout: 3000 });
  }
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('group', { name: '台词', exact: true }).getByText(cue.text, { exact: true })).toBeVisible();
  await expectPictureSubtitles(page, '电影片段', '台词');
  await expect(page.getByRole('region', { name: '原片字幕', exact: true })).toHaveCount(0);
});
