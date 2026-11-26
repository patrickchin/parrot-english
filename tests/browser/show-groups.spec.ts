import { test, expect, setLanguage, homeShelves, homeShows, collectionShelves, escapeRegExp, homeLink, levelText, sceneItems, shelfShown, shelfTitle, showCard, showsShelf } from './fixtures';
import { clips, packs } from '../content-fixtures';
import { packPath } from '../../src/app/routes';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const memeScenes = clips.filter(clip => clip.tags.includes('meme') && clip.tags.includes('internet'));
const creators = [...new Set(memeScenes.map(clip => clip.note))];
const memesPack = packs.find(pack => pack.data.title === 'Memes')!;
const memesShelf = collectionShelves.find(shelf => shelf.pack.id === memesPack.entry.id)!;

test('home lists every show in one grid, then collections with complete rows and a See all link', async ({ page }, info) => {
  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1, name: 'Pick a scene to dub', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Shows', 'Memes']);
  expect(homeShelves.map(shelf => shelfTitle(shelf, 'en'))).toEqual(['Shows', 'Memes']);
  expect(homeShows.length + collectionShelves.length).toBe(packs.length);
  const shows = showsShelf(page);
  await expect(shows.getByRole('link')).toHaveCount(homeShows.length);
  for (const [index, show] of homeShows.entries()) {
    await expect(showCard(shows, show.title)).toHaveAttribute('href', packPath(show.id, 'en'));
    await expect(shows.getByRole('link').nth(index)).toHaveAttribute('href', packPath(show.id, 'en'));
  }
  await expect(shows.getByRole('link', { name: /^See all/ })).toHaveCount(0);
  await expect(shows.getByRole('button')).toHaveCount(0);
  const memes = page.getByRole('region', { name: 'Memes', exact: true });
  await expect(memes.getByRole('link', { name: `See all ${memeScenes.length} in Memes`, exact: true })).toHaveAttribute('href', packPath(memesPack.entry.id, 'en'));
  for (const region of await page.getByRole('region').all()) await expect(region.getByRole('link', { name: 'All scenes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'All scenes', exact: true })).toBeVisible();
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Collections show only complete rows at the current column count.
    await expect(memes.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(shelfShown(memesShelf, page));
    await expect(shows.getByRole('link')).toHaveCount(homeShows.length);
    const target = showCard(shows, 'Friends');
    await target.focus(); await expect(target).toBeInViewport();
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      // Full-page screenshots do not trigger lazy loading for offscreen rows.
      for (const card of await page.getByRole('main').getByRole('listitem').all()) {
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

for (const folder of ['teens', 'first-english', 'cartoons-and-films']) test(`the retired ${folder} section path shows a missing-page error`, async ({ page }) => {
  await page.goto(`/en/library/${folder}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test('home search finds shows by title and scenes by content, without uploader matches, and recovers from no results', async ({ page }) => {
  await page.goto('/en/');
  const search = page.getByRole('searchbox', { name: 'Find a show or scene', exact: true });
  const shows = page.getByRole('region', { name: 'Shows', exact: true });
  const scenes = page.getByRole('region', { name: 'Scenes', exact: true });
  const status = page.getByRole('status');
  await search.fill('  FRIENDS  ');
  await expect(page).toHaveURL(/\?q=/);
  await expect(shows.getByRole('link')).toHaveCount(1);
  await expect(showCard(shows, 'Friends')).toBeVisible();
  const total = await shows.getByRole('link').count() + await scenes.getByRole('button').count();
  await expect(status).toHaveText(`${total} result${total === 1 ? '' : 's'}`);
  await search.fill('Patrick');
  await expect(shows).toHaveCount(0);
  await expect(scenes.getByRole('button', { name: 'Choose scene: No, this is Patrick!', exact: true })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue('Patrick');
  await expect(scenes.getByRole('button', { name: 'Choose scene: No, this is Patrick!', exact: true })).toBeVisible();
  await search.fill('zxqvunfindable');
  await expect(status).toHaveText('0 results');
  await expect(shows).toHaveCount(0);
  await expect(scenes).toHaveCount(0);
  await expect(page.getByText('Try a title, character, tag, or a line you remember.', { exact: true })).toBeVisible();
  const clear = page.getByRole('button', { name: 'Clear search', exact: true });
  await clear.last().click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(homeShelves.length);
  await search.fill('Shrek');
  await clear.first().click();
  await expect(search).toHaveValue('');
  await showCard(showsShelf(page), 'Shrek').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Shrek', exact: true })).toBeVisible();
  await expect(sceneItems(page)).toHaveCount(clips.filter(clip => clip.note === 'Shrek').length);
});

test('a scene found from home search opens with its pack and returns there', async ({ page }) => {
  const clip = clips.find(clip => clip.slug === 'patrick')!;
  await page.goto('/en/?q=Patrick');
  await page.getByRole('region', { name: 'Scenes', exact: true }).getByRole('button', { name: 'Choose scene: No, this is Patrick!', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('pack')).toBe(clip.packId);
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await expect(page).toHaveURL(new URL(packPath(clip.packId, 'en'), page.url()).href);
  await expect(page.getByRole('heading', { level: 1, name: 'SpongeBob SquarePants', exact: true })).toBeVisible();
});

test('pack and all-scene pages support history, reload, language, scene search and playback', async ({ page }) => {
  await page.goto('/en/');
  const franchise = 'Peppa Pig', pack = packs.find(pack => pack.data.title === franchise)!;
  const scenes = pack.data.scenes;
  const card = showCard(showsShelf(page), franchise);
  await card.focus(); await card.press('Enter');
  await expect(page).toHaveURL(new URL(packPath(pack.entry.id, 'en'), page.url()).href);
  await page.reload(); await expect(sceneItems(page)).toHaveCount(scenes.length);
  await page.getByRole('searchbox').fill('not-a-scene');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(sceneItems(page)).toHaveCount(scenes.length);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: franchise, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^选择片段：/ }).first().click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(sceneItems(page)).toHaveCount(scenes.length);
  await homeLink(page, 'zh-CN').click();
  await page.getByRole('link', { name: '全部片段', exact: true }).click();
  await expect(sceneItems(page)).toHaveCount(clips.length);
  await page.goBack(); await expect(page.getByRole('heading', { level: 1, name: '选一个片段来配音', exact: true })).toBeVisible();
  await expect(showsShelf(page, 'zh-CN').getByRole('link')).toHaveCount(homeShows.length);
  await expect(page.getByRole('button', { name: /^选择片段：/ })).toHaveCount(shelfShown(memesShelf, page));
  await page.goForward(); await expect(sceneItems(page)).toHaveCount(clips.length);
});

test('the Memes collection retains original source names and searches its own scenes', async ({ page }) => {
  await page.goto('/en/');
  const shelf = page.getByRole('region', { name: 'Memes', exact: true });
  for (const clip of memeScenes.slice(0, shelfShown(memesShelf, page))) await expect(shelf.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true })).toContainText(`${clip.note} · ${levelText(clip)}`);
  for (const creator of creators) await expect(page.getByRole('link', { name: new RegExp(`^${escapeRegExp(creator)}`) })).toHaveCount(0);
  await shelf.getByRole('link', { name: `See all ${memeScenes.length} in Memes`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memes', exact: true })).toBeVisible();
  await expect(homeLink(page)).toHaveAttribute('href', '/en/');
  await expect(page.getByText(memesPack.data.description, { exact: true })).toBeVisible();
  await expect(page.getByText(`${memeScenes.length} scenes`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
  await expect(sceneItems(page)).toHaveCount(memeScenes.length);
  for (const clip of memeScenes) await expect(page.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true }).getByText(`${clip.note} · ${levelText(clip)}`, { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('Steven');
  await expect(page.getByRole('button', { name: 'Choose scene: Emotional damage!', exact: true })).toBeVisible();
  await page.reload(); await expect(sceneItems(page)).toHaveCount(memeScenes.length);
});

test('show back links, headings and scene search remain usable across viewport sizes', async ({ page }) => {
  const pack = packs.find(pack => pack.data.title === 'Shrek')!;
  await page.goto(packPath(pack.entry.id, 'en'));
  const home = homeLink(page);
  const heading = page.getByRole('heading', { name: 'Shrek', level: 1, exact: true });
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
  await expect(page.getByText(`${pack.data.scenes.length} scenes`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const control of [home, heading, search]) await expect(control).toBeVisible();
    const box = (await home.boundingBox())!;
    expect(Math.min(box.width, box.height), 'The Home link is a comfortable touch target').toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await search.fill('zxqvunfindable');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await expect(page.getByText('0 scenes', { exact: true })).toBeVisible();
  await home.focus(); await home.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Pick a scene to dub', exact: true })).toBeVisible();
  await page.goBack();
  await expect(heading).toBeVisible();
});
