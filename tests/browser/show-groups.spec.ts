import { test, expect, setLanguage } from './fixtures';
import { clips, packs } from '../content-fixtures';
import { packPath } from '../../src/app/routes';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const memeScenes = clips.filter(clip => clip.tags.includes('meme') && clip.tags.includes('internet'));
const creators = [...new Set(memeScenes.map(clip => clip.note))];

test('home presents actual packs on one level with an all-scenes link outside the gallery', async ({ page }, info) => {
  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1, name: 'Packs', exact: true })).toBeVisible();
  const gallery = page.getByRole('navigation', { name: 'Packs', exact: true });
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await expect(gallery.getByRole('link', { name: 'All scenes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All scenes', exact: true })).toBeVisible();
  for (const pack of packs) await expect(gallery.getByRole('link', { name: pack.data.title, exact: true })).toContainText('Uploaded by Patrick');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = gallery.getByRole('link', { name: 'Friends', exact: true });
    await target.focus(); await expect(target).toBeInViewport();
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      // Full-page screenshots do not trigger lazy loading for offscreen rows.
      for (const card of await gallery.getByRole('link').all()) {
        await card.scrollIntoViewIfNeeded();
        const cover = card.locator('img');
        await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        await cover.evaluate((image: HTMLImageElement) => image.decode());
      }
      await target.scrollIntoViewIfNeeded(); await target.focus();
      const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `pack-directory-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
});

test('pack search finds titles and uploaders and has a recoverable empty state', async ({ page }) => {
  await page.goto('/en/');
  const search = page.getByRole('searchbox', { name: 'Find a pack' });
  const gallery = page.getByRole('navigation', { name: 'Packs', exact: true });
  await search.fill('  FRIENDS  ');
  await expect(gallery.getByRole('link')).toHaveCount(1);
  await expect(gallery.getByRole('link', { name: 'Friends', exact: true })).toBeVisible();
  await search.fill('Patrick');
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  await search.fill('not-a-pack');
  await expect(page.getByRole('status')).toHaveText('No packs found.');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  await gallery.getByRole('link', { name: 'Shrek', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shrek', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Shrek').length);
});

test('pack and all-scene pages support history, reload, language, scene search and playback', async ({ page }) => {
  await page.goto('/en/');
  const franchise = 'Peppa Pig', pack = packs.find(pack => pack.data.title === franchise)!;
  const scenes = pack.data.scenes;
  const target = page.getByRole('navigation', { name: 'Packs', exact: true }).getByRole('link', { name: franchise, exact: true });
  await target.focus(); await target.press('Enter');
  await expect(page).toHaveURL(new URL(packPath(pack.entry.id, 'en'), page.url()).href);
  await page.reload(); await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await page.getByRole('searchbox').fill('not-a-scene');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: franchise, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^选择片段：/ }).first().click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await page.getByRole('link', { name: '全部内容包', exact: true }).click();
  await page.getByRole('link', { name: '全部片段', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(clips.length);
  await page.goBack(); await expect(page.getByRole('listitem')).toHaveCount(0);
  await page.goForward(); await expect(page.getByRole('listitem')).toHaveCount(clips.length);
});

test('the Memes pack retains original source names and searches its own scenes', async ({ page }) => {
  await page.goto('/en/');
  const gallery = page.getByRole('navigation', { name: 'Packs', exact: true });
  await expect(gallery.getByRole('link', { name: 'Memes', exact: true })).toContainText(`${memeScenes.length} scenes`);
  for (const creator of creators) await expect(gallery.getByRole('link', { name: creator, exact: true })).toHaveCount(0);
  await gallery.getByRole('link', { name: 'Memes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memes', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(memeScenes.length);
  for (const clip of memeScenes) await expect(page.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true }).getByText(clip.note, { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('Steven');
  await expect(page.getByRole('button', { name: 'Choose scene: Emotional damage!', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('listitem')).toHaveCount(memeScenes.length);
});

test('pack back links, headings and scene search remain usable across viewport sizes', async ({ page }) => {
  const pack = packs.find(pack => pack.data.title === 'Shrek')!;
  await page.goto(packPath(pack.entry.id, 'en'));
  const back = page.getByRole('link', { name: 'All packs', exact: true });
  const heading = page.getByRole('heading', { name: 'Shrek', level: 1, exact: true });
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const control of [back, heading, search]) await expect(control).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await search.fill('zxqvunfindable');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await back.focus(); await back.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Packs', exact: true })).toBeVisible();
});
