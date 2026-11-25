import { scenePath } from './scene-path';
import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('new TV scenes open from Collections and keep a season selected through playback', async ({ page }, info) => {
  await page.goto('/en/packs');
  await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Teenagers', exact: true })).toHaveCount(0);
  for (const [collection, title] of [
    ['How I Met Your Mother', 'Can you give me a ride?'],
    ['The Big Bang Theory', "Who's Mike Drop?"],
  ]) {
    await page.getByRole('link', { name: collection, exact: true }).click();
    await expect(page.getByRole('button', { name: `Choose scene: ${title}`, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'All collections', exact: true }).click();
  }
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose scene: Choose a category', exact: true })).toBeVisible();
  const season = page.getByRole('combobox', { name: 'Filter by season', exact: true });
  await season.selectOption({ label: 'Season 5' });
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Friends' && clip.season === 5).length);
  await page.reload();
  await expect(season).toHaveValue('5');
  await page.getByRole('button', { name: 'Choose scene: The delivery charge', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await expect(season).toHaveValue('5');
  if (info.project.name === 'chromium') {
    const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(directory, { recursive: true });
    for (const item of await page.getByRole('listitem').all()) {
      await item.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    }
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(season).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: join(directory, `collections-friends-season-${width}.png`), animations: 'disabled' });
    }
  }
  await page.getByRole('searchbox', { name: 'Find a scene' }).fill('zxqvunfindable');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(season).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Friends').length);
});

test('TV franchise collections open from the directory with complete scenes', async ({ page }) => {
  await page.goto('/en/');
  await page.getByRole('link', { name: 'Young Sheldon', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Young Sheldon').length);
  await page.getByRole('link', { name: 'All collections', exact: true }).click();
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Choose scene: A sofa that will not turn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await setLanguage(page, 'zh-CN');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Friends', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Friends').length);
});

for (const slug of ['young-sheldon-library', 'himym-driving-lesson', 'harry-potter-new-friend', 'big-bang-notebook', 'bluey-real-coins', 'young-sheldon-good-guest', 'big-bang-long-lesson']) test(`${slug} plays and records a TV conversation line`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto(scenePath(slug));
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声 (听原声)', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 20000 });
});

for (const folder of ['unknown', 'teens']) test(`the ${folder} folder shows a missing-page error`, async ({ page }) => {
  await page.goto(`/en/library/${folder}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});
