import { test, expect, setLanguage } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.route('**/scenes/onions/scene.json', async route => {
    const scene = await (await route.fetch()).json();
    scene.lines = [
      { id: 'line_preview_a', roleId: scene.roles[0].id, start: 0, end: 0.8, text: 'Onions have layers.', hint: '洋葱有层次。' },
      { id: 'line_preview_b', roleId: scene.roles[1].id, start: 1.2, end: 3.2, text: 'Ogres have layers.', hint: '怪物也有层次。' },
      { id: 'line_preview_c', roleId: scene.roles[0].id, start: 3.6, end: 4.5, text: 'You get it?', hint: '你明白了吗？' },
      { id: 'line_preview_d', roleId: scene.roles[1].id, start: 4.8, end: 5.5, text: 'Oh, you both have layers.', hint: '哦，你们都有层次。' },
    ];
    await route.fulfill({ json: scene });
  });
});

test('each speaker keeps a distinct readable color in light and dark themes', async ({ page }, info) => {
  await page.goto('/scenes/onions');
  const subtitles = page.getByRole('region', { name: '原片字幕', exact: true });
  const rows = subtitles.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/\d+/g)!.slice(0, 3).map(value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
    const colors = await rows.evaluateAll(elements => elements.map(el => getComputedStyle(el).color));
    expect(colors[0]).toBe(colors[2]);
    expect(colors[1]).toBe(colors[3]);
    expect(colors[0]).not.toBe(colors[1]);
    const background = luminance(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    for (const [index, color] of colors.entries()) {
      const foreground = luminance(color);
      expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
      const row = rows.nth(index);
      const speaker = index % 2 === 0 ? '史莱克' : '驴子';
      expect(await row.getByText(speaker, { exact: true }).evaluate(el => getComputedStyle(el).color)).toBe(color);
    }
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `speaker-colors-${theme}.png`) });
    }
  }
});

test('subtitles and role choices stay in place before playback, while playing and after stopping', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 1200 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/scenes/onions');
    const subtitles = page.getByRole('region', { name: '原片字幕', exact: true });
    const current = subtitles.getByRole('listitem').and(page.locator('[aria-current="true"]'));
    const roles = page.getByRole('region', { name: '选择角色', exact: true });
    const picture = page.getByLabel('Shrek 对话片段', { exact: true });
    await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
    await expect(current).toContainText('Onions have layers.');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const regions = [picture, subtitles, roles];
    const before = await Promise.all(regions.map(region => region.boundingBox()));
    const scroll = await page.evaluate(() => scrollY);
    const expectFixed = async () => {
      await expect(async () => {
        const after = await Promise.all(regions.map(region => region.boundingBox()));
        for (const [i, bounds] of after.entries()) {
          for (const dimension of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(bounds![dimension] - before[i]![dimension]), `${viewport.width}px region ${i} ${dimension}`).toBeLessThan(1);
          }
        }
        expect(await page.evaluate(() => scrollY)).toBe(scroll);
        await expect(roles.getByRole('button', { name: /^史莱克/ })).toBeVisible();
        await expect(subtitles).toBeVisible();
      }).toPass({ timeout: 2000 });
    };
    await page.getByRole('button', { name: '播放原片', exact: true }).click();
    await expectFixed();
    await expect(current).toContainText('Ogres have layers.');
    await expectFixed();
    await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
    await expectFixed();
    await page.getByRole('button', { name: '播放原片', exact: true }).click();
    await expectFixed();
    await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
    await expectFixed();
  }
  expect(errors).toEqual([]);
});

test('preview scrolls every speaker into focus with faded context and resets on replay', async ({ page }, info) => {
  await page.goto('/scenes/onions');
  const subtitles = page.getByRole('region', { name: '原片字幕', exact: true });
  await expect(subtitles).toBeVisible();
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  const current = subtitles.getByRole('listitem').and(page.locator('[aria-current="true"]'));
  await expect(current).toContainText('Onions have layers.');
  await expect(current.getByText('史莱克', { exact: true })).toBeVisible();
  await expect(current).toContainText('Ogres have layers.');
  await expect(current.getByText('驴子', { exact: true })).toBeVisible();
  const previous = subtitles.getByRole('listitem').filter({ hasText: 'Onions have layers.' });
  const next = subtitles.getByRole('listitem').filter({ hasText: 'You get it?' });
  await expect(async () => {
    const [view, now, before, after] = await Promise.all([subtitles, current, previous, next].map(el => el.boundingBox()));
    expect(Math.abs(now!.y + now!.height / 2 - view!.y - view!.height / 2)).toBeLessThan(1);
    expect(before!.y).toBeLessThan(now!.y);
    expect(after!.y).toBeGreaterThan(now!.y);
    const oldText = (await previous.getByText('Onions have layers.', { exact: true }).boundingBox())!;
    expect(oldText.y).toBeGreaterThanOrEqual(view!.y);
    for (const faded of [previous, next]) {
      expect(await faded.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.6);
    }
    expect(await current.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  }).toPass({ timeout: 1500 });
  if (info.project.name === 'chromium' || info.project.name === 'mobile') {
    const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: join(folder, `preview-subtitles-${info.project.name}.png`) });
  }
  await expect(current).toContainText('You get it?');
  await expect(current).toContainText('Oh, you both have layers.');
  await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
  await expect(subtitles).toBeVisible();
  await expect(current).toContainText('Oh, you both have layers.');
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect(current).toContainText('Onions have layers.');
  await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('group', { name: '台词', exact: true })).toContainText('Onions have layers.');
  await expect(subtitles).toHaveCount(0);
});

test('speaker names follow the UI language and longer subtitles wrap over two balanced lines', async ({ page }, info) => {
  await page.unroute('**/scenes/onions/scene.json');
  await page.goto('/scenes/onions');
  await setLanguage(page, 'en');
  for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Play original scene', exact: true }).click();
    const subtitles = page.getByRole('region', { name: 'Preview subtitles', exact: true });
    const current = subtitles.getByRole('listitem').and(page.locator('[aria-current="true"]'));
    const name = current.getByText('Shrek', { exact: true });
    await expect(name).toBeVisible();
    const dialogue = current.getByText('No! Layers! Onions have layers. Ogres have layers. Onions have layers.', { exact: true });
    await expect(async () => {
      const bounds = (await dialogue.boundingBox())!;
      const lineHeight = await dialogue.evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
      expect(Math.round(bounds.height / lineHeight)).toBe(2);
      const speaker = (await name.boundingBox())!;
      expect(speaker.y + speaker.height).toBeLessThanOrEqual(bounds.y);
    }).toPass({ timeout: 2000 });
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `subtitle-speaker-${viewport.width}.png`) });
    }
    await setLanguage(page, 'zh-CN');
    const chineseCurrent = page.getByRole('region', { name: '原片字幕', exact: true }).getByRole('listitem').and(page.locator('[aria-current="true"]'));
    await expect(chineseCurrent.getByText('史莱克', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '停止播放或录音', exact: true }).click();
    await setLanguage(page, 'en');
  }
});

test('long subtitles remain readable and a finished preview returns to role choice', async ({ page }) => {
  const longText = 'Onions have layers. Ogres have layers. '.repeat(7).trim();
  await page.unroute('**/scenes/onions/scene.json');
  await page.route('**/scenes/onions/scene.json', async route => {
    const scene = await (await route.fetch()).json();
    scene.lines[0].text = longText;
    delete scene.lines[0].words;
    await route.fulfill({ json: scene });
  });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/scenes/onions');
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  const subtitles = page.getByRole('region', { name: '原片字幕', exact: true });
  const current = subtitles.getByRole('listitem').and(page.locator('[aria-current="true"]'));
  await expect(current).toContainText(longText);
  await expect(async () => {
    const view = (await subtitles.boundingBox())!;
    const text = (await current.getByText(longText, { exact: true }).boundingBox())!;
    expect(text.y).toBeGreaterThan(view.y + 64);
    expect(text.y + text.height).toBeLessThan(view.y + view.height - 64);
    const picture = (await page.getByLabel('Shrek 对话片段', { exact: true }).boundingBox())!;
    expect(picture.width).toBeGreaterThan(100);
    expect(picture.y + picture.height).toBeLessThan(view.y);
  }).toPass({ timeout: 2000 });
  await expect(page.getByRole('button', { name: '播放原片', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(subtitles).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^史莱克/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
});

test('preview stays below the picture, fits responsive screens and supports reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/scenes/onions');
  await setLanguage(page, 'en');
  for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1440, height: 900 }, { width: 1440, height: 1200 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Play original scene', exact: true }).click();
    const subtitles = page.getByRole('region', { name: 'Preview subtitles', exact: true });
    const current = subtitles.getByRole('listitem').and(page.locator('[aria-current="true"]'));
    await expect(current).toContainText('Onions have layers.');
    await expect(async () => {
      const picture = (await page.getByLabel('Shrek dialogue scene', { exact: true }).boundingBox())!;
      const movie = (await page.getByRole('region', { name: 'Movie scene', exact: true }).boundingBox())!;
      const view = (await subtitles.boundingBox())!;
      expect(Math.abs((picture.y + view.y + view.height) / 2 - movie.y - movie.height / 2), 'video and subtitles remain vertically centered').toBeLessThan(2);
      if (viewport.width >= 900) {
        const roles = (await page.getByRole('region', { name: 'Choose a role', exact: true }).boundingBox())!;
        expect(Math.abs(roles.y - picture.y), 'side panel follows the top of the video').toBeLessThan(2);
      }
      const text = (await current.getByText('Onions have layers.', { exact: true }).boundingBox())!;
      expect(picture.width).toBeGreaterThan(100);
      expect(view.y).toBeGreaterThan(picture.y + picture.height);
      expect(text.y).toBeGreaterThanOrEqual(view.y);
      expect(text.y + text.height).toBeLessThanOrEqual(view.y + view.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width >= 900) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    }).toPass({ timeout: 2000 });
    await page.getByRole('button', { name: 'Stop playback or recording', exact: true }).click();
  }
});
