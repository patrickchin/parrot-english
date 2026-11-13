import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const creators = ['Apparently Kid', 'Steven He', 'Recess Therapy'];
const franchises = [...new Set(clips.map(clip => clip.note))].filter(title => !creators.includes(title));
const collections = ['All scenes', 'Memes', ...franchises];

test('the first page puts tags and every franchise on one level without individual scene results', async ({ page }, info) => {
  await page.goto('/en/');
  const tags = page.getByRole('navigation', { name: 'Browse tags', exact: true });
  await expect(tags.getByRole('link')).toHaveCount(collections.length);
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Scene categories' })).toHaveCount(0);
  for (const title of collections) {
    await expect(tags.getByRole('link', { name: title, exact: true })).toBeVisible();
  }
  for (const removed of ['Films & animation', 'First English', 'Ages 10–12', 'Teenagers']) await expect(tags.getByRole('link', { name: removed, exact: true })).toHaveCount(0);
  await expect(tags.getByRole('link', { name: 'All scenes', exact: true }).getByAltText('', { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = tags.getByRole('link', { name: 'Friends', exact: true });
    await target.focus();
    await expect(target).toBeInViewport();
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `tag-directory-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
});

test('directory search filters cards and has a recoverable empty state', async ({ page }) => {
  await page.goto('/en/');
  const search = page.getByRole('searchbox', { name: 'Find a franchise or tag' });
  const tags = page.getByRole('navigation', { name: 'Browse tags', exact: true });
  await search.fill('  FRIENDS  ');
  await expect(tags.getByRole('link')).toHaveCount(1);
  await expect(tags.getByRole('link', { name: 'Friends', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await search.fill('not-a-tag');
  await expect(page.getByRole('status')).toHaveText('No matching tags.');
  await page.getByRole('button', { name: 'Clear search', exact: true }).last().click();
  await expect(search).toBeFocused();
  await expect(tags.getByRole('link')).toHaveCount(collections.length);
  await search.fill('Shrek');
  await tags.getByRole('link', { name: 'Shrek', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Shrek', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Shrek').length);
});

test('franchise, tag and all-scene pages support history, reload, language, search and playback', async ({ page }) => {
  await page.goto('/en/');
  const tags = page.getByRole('navigation', { name: 'Browse tags', exact: true });
  const franchise = 'Peppa Pig';
  const scenes = clips.filter(clip => clip.note === franchise);
  await tags.getByRole('link', { name: franchise, exact: true }).focus();
  await tags.getByRole('link', { name: franchise, exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/library\/all\?show=Peppa\+Pig$/);
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await expect(tags).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await page.getByRole('searchbox').fill('not-a-scene');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 2, name: franchise, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^选择片段：/ }).first().click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(scenes.length);
  await page.getByRole('link', { name: '浏览标签', exact: true }).click();
  await page.getByRole('navigation', { name: '浏览标签', exact: true }).getByRole('link', { name: '全部片段', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(clips.length);
  await page.goBack();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('listitem')).toHaveCount(clips.length);
});

test('the featured pick stays fixed through directory, franchise, tag and search changes', async ({ page }) => {
  await page.goto('/en/');
  const hero = page.getByRole('region').filter({ has: page.getByRole('heading', { level: 1 }) });
  const title = await hero.getByRole('heading', { level: 2 }).innerText();
  const artwork = await hero.getByAltText('', { exact: true }).getAttribute('src');
  for (const name of ['Friends', 'Shrek', 'All scenes']) {
    await page.getByRole('navigation', { name: 'Browse tags', exact: true }).getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    await expect(hero.getByRole('heading', { level: 2 })).toHaveText(title);
    await expect(hero.getByAltText('', { exact: true })).toHaveAttribute('src', artwork!);
    await page.getByRole('searchbox').fill('zxqvunfindable');
    await expect(page.getByRole('status')).toHaveText('No scenes found.');
    await expect(hero.getByRole('heading', { level: 2 })).toHaveText(title);
    await page.getByRole('link', { name: 'Browse tags', exact: true }).click();
  }
  await page.reload();
  await expect(hero.getByAltText('', { exact: true })).toHaveAttribute('src', artwork!);
  await hero.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(clips[0].routeSlug ?? clips[0].slug));
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
});


test('creator franchises share a searchable Memes collection and keep their source names', async ({ page }) => {
  await page.goto('/en/');
  const tags = page.getByRole('navigation', { name: 'Browse tags', exact: true });
  await expect(tags.getByRole('link', { name: 'Memes', exact: true })).toHaveAccessibleDescription('3 scenes');
  for (const creator of creators) await expect(tags.getByRole('link', { name: creator, exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('steven');
  await expect(tags.getByRole('link')).toHaveCount(1);
  await tags.getByRole('link', { name: 'Memes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Memes', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  for (const creator of creators) await expect(page.getByRole('list').getByText(creator, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('collection controls share one row and short collections leave room to scroll', async ({ page }) => {
  await page.goto('/en/library/all?show=Shrek');
  const back = page.getByRole('link', { name: 'Browse tags', exact: true });
  const heading = page.getByRole('heading', { name: 'Shrek', level: 2, exact: true });
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  await expect(page.getByRole('link', { name: 'All scenes', exact: true })).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await Promise.all([back, heading, search].map(locator => locator.boundingBox()));
    const center = (box: NonNullable<typeof boxes[number]>) => box.y + box.height / 2;
    expect(Math.abs(center(boxes[0]!) - center(boxes[2]!))).toBeLessThan(2);
    expect(Math.abs(center(boxes[1]!) - center(boxes[2]!))).toBeLessThan(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);
  }
  await search.fill('zxqvunfindable');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await back.focus();
  await back.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Browse tags', exact: true })).toBeVisible();
});
