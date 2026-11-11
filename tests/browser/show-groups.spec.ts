import { test, expect, setLanguage } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const youngerCount = clips.filter(clip => clip.cohort === 'younger-age-5').length;

test('each category groups scenes by show or film without losing or repeating scenes', async ({ page }) => {
  for (const folder of ['older-audience', 'younger-age-5', 'older-children', 'teens']) {
    await page.goto(`/en/library/${folder}`);
    const scenes = clips.filter(clip => clip.cohort === folder);
    await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
    for (const title of new Set(scenes.map(clip => clip.note))) {
      const group = page.getByRole('region', { name: title, exact: true });
      await expect(group.getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
      await expect(group.getByRole('listitem')).toHaveCount(scenes.filter(clip => clip.note === title).length);
    }
  }
});

test('show filters support search, history, reload, language, playback and small screens', async ({ page }, info) => {
  await page.goto('/en/library/teens');
  const filters = page.getByRole('group', { name: 'Shows & films', exact: true });
  const friends = filters.getByRole('button', { name: 'Friends', exact: true });
  await friends.focus();
  await friends.press('Enter');
  await expect(friends).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem')).toHaveCount(7);
  await expect(page.getByRole('region', { name: 'How I Met Your Mother', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(friends).toHaveAttribute('aria-pressed', 'true');
  const search = page.getByRole('searchbox');
  await search.fill('thesaurus');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await search.fill('no-matching-scene');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(friends).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem')).toHaveCount(7);
  await filters.getByRole('button', { name: 'How I Met Your Mother', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await page.goBack();
  await expect(friends).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await friends.click();
  await setLanguage(page, 'zh-CN');
  const translatedFilters = page.getByRole('group', { name: '剧集与电影', exact: true });
  await expect(translatedFilters.getByRole('button', { name: 'Friends', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = translatedFilters.getByRole('button', { name: 'The Big Bang Theory', exact: true });
    await target.focus();
    await expect(target).toBeInViewport();
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `show-groups-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  await page.getByRole('button', { name: '选择片段：转不过弯的沙发', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(translatedFilters.getByRole('button', { name: 'Friends', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem')).toHaveCount(7);
  await translatedFilters.getByRole('button', { name: '全部剧集与电影', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(14);
  await page.getByRole('group', { name: '片段分类' }).getByRole('button', { name: /^英语启蒙/ }).click();
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await expect(translatedFilters.getByRole('button', { name: 'Friends', exact: true })).toHaveCount(0);
});

test('a show outside the selected category falls back to all shows', async ({ page }) => {
  await page.goto('/en/library/younger-age-5?show=Friends');
  await expect(page.getByRole('group', { name: 'Shows & films', exact: true }).getByRole('button', { pressed: true })).toHaveText('All shows & films');
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
});
