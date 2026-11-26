import { test, expect, setLanguage, homeTags, homeShows, homeLink, levelText, sceneCountText, showCard, showsShelf, tagChip, tagGroup, tagLabel, taggedClips } from './fixtures';
import { clips, packs } from '../content-fixtures';
import { packPath } from '../../src/app/routes';
import type { BrowseTag } from '../../src/browse';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

type FixtureClip = typeof clips[number];
const sceneTitle = (clip: FixtureClip, language = 'en') => packs.find(pack => pack.entry.id === clip.packId)!.data.locales[language].scenes[clip.id].title as string;
const chooseScene = /^Choose scene: /;

test('level and topic chips filter home scenes by hasTag and toggle back to the shelves', async ({ page }) => {
  await page.goto('/en/');
  const group = tagGroup(page);
  await expect(group.getByRole('button')).toHaveText(homeTags.map(tag => tagLabel(tag)));
  expect(homeTags.slice(0, 3)).toEqual(['starter', 'beginner', 'intermediate']);
  for (const tag of homeTags) {
    await expect(tagChip(page, tag)).toHaveAttribute('aria-pressed', 'false');
    expect(taggedClips(tag).length, `${tag} has scenes`).toBeGreaterThan(0);
  }
  await expect(showsShelf(page)).toBeVisible();
  for (const tag of homeTags) {
    await tagChip(page, tag).click();
    await expect(page).toHaveURL(new RegExp(`/en/\\?tag=${tag}$`));
    for (const other of homeTags) await expect(tagChip(page, other)).toHaveAttribute('aria-pressed', String(other === tag));
    const expected = taggedClips(tag);
    await expect(page.getByRole('status')).toHaveText(sceneCountText(expected.length, 'en'));
    const results = page.getByRole('region', { name: tagLabel(tag), exact: true }).getByRole('button', { name: chooseScene });
    await expect(results).toHaveCount(expected.length);
    await expect(showsShelf(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(0);
  }
  const food = taggedClips('food');
  await tagChip(page, 'food').click();
  const results = page.getByRole('main').getByRole('button', { name: chooseScene });
  for (const [index, clip] of food.entries()) {
    const card = results.nth(index);
    await expect(card).toHaveAccessibleName(`Choose scene: ${sceneTitle(clip)}`);
    await expect(card).toContainText(`${clip.note} · ${levelText(clip)}`);
  }
  // Pressing the active chip again clears the filter.
  await tagChip(page, 'food').click();
  await expect(tagChip(page, 'food')).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(showsShelf(page).getByRole('link')).toHaveCount(homeShows.length);
});

test('a chip filter survives reload, Back, Forward and language changes, and opens a tagged scene', async ({ page }) => {
  const beginner = taggedClips('beginner'), funny = taggedClips('funny');
  await page.goto('/en/?tag=beginner');
  await expect(tagChip(page, 'beginner')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: chooseScene })).toHaveCount(beginner.length);
  await page.reload();
  await expect(tagChip(page, 'beginner')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText(sceneCountText(beginner.length, 'en'));
  await tagChip(page, 'funny').click();
  await expect(page).toHaveURL(/\?tag=funny$/);
  await expect(page.getByRole('button', { name: chooseScene })).toHaveCount(funny.length);
  await page.goBack();
  await expect(tagChip(page, 'beginner')).toHaveAttribute('aria-pressed', 'true');
  await expect(tagChip(page, 'funny')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: chooseScene })).toHaveCount(beginner.length);
  await page.goForward();
  await expect(tagChip(page, 'funny')).toHaveAttribute('aria-pressed', 'true');
  await setLanguage(page, 'zh-CN');
  await expect(page).toHaveURL(/\/zh\/\?tag=funny$/);
  await expect(tagChip(page, 'funny', 'zh-CN')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText(sceneCountText(funny.length, 'zh-CN'));
  const zhResults = page.getByRole('main').getByRole('button', { name: /^选择片段：/ });
  await expect(zhResults).toHaveCount(funny.length);
  await expect(zhResults.first()).toContainText(`${funny[0].note} · ${levelText(funny[0], 'zh-CN')}`);
  await zhResults.first().click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('pack')).toBe(funny[0].packId);
  await page.goBack();
  await expect(tagChip(page, 'funny', 'zh-CN')).toHaveAttribute('aria-pressed', 'true');
  await expect(zhResults).toHaveCount(funny.length);
  // An unknown tag is ignored rather than showing an empty filter.
  await page.goto('/en/?tag=not-a-tag');
  await expect(showsShelf(page).getByRole('link')).toHaveCount(homeShows.length);
  for (const tag of homeTags) await expect(tagChip(page, tag)).toHaveAttribute('aria-pressed', 'false');
});

test('home search keeps show results and limits scene results to the active chip', async ({ page }) => {
  const spongeBob = clips.filter(clip => clip.note === 'SpongeBob SquarePants');
  const tag = homeTags.find(tag => { const count = spongeBob.filter(clip => taggedClips(tag).includes(clip)).length; return count > 0 && count < spongeBob.length; })! as BrowseTag;
  const expected = spongeBob.filter(clip => taggedClips(tag).includes(clip));
  await page.goto('/en/');
  const search = page.getByRole('searchbox', { name: 'Find a show or scene', exact: true });
  const shows = page.getByRole('region', { name: 'Shows', exact: true });
  const scenes = page.getByRole('region', { name: 'Scenes', exact: true }).getByRole('button', { name: chooseScene });
  await search.fill('SpongeBob');
  await expect(scenes).toHaveCount(spongeBob.length);
  await tagChip(page, tag).click();
  await expect(page).toHaveURL(new RegExp(`\\?q=SpongeBob&tag=${tag}$`));
  await expect(showCard(shows, 'SpongeBob SquarePants')).toBeVisible();
  await expect(scenes).toHaveCount(expected.length);
  for (const clip of expected) await expect(page.getByRole('button', { name: `Choose scene: ${sceneTitle(clip)}`, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(`${1 + expected.length} results`);
  await page.reload();
  await expect(search).toHaveValue('SpongeBob');
  await expect(tagChip(page, tag)).toHaveAttribute('aria-pressed', 'true');
  await expect(scenes).toHaveCount(expected.length);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText(sceneCountText(taggedClips(tag).length, 'en'));
  await tagChip(page, tag).click();
  await expect(showsShelf(page).getByRole('link')).toHaveCount(homeShows.length);
});

test('chips are toggle buttons that work from the keyboard', async ({ page }) => {
  await page.goto('/en/');
  const starter = tagChip(page, 'starter'), beginner = tagChip(page, 'beginner');
  await starter.focus();
  await page.keyboard.press('Enter');
  await expect(starter).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\?tag=starter$/);
  await expect(starter).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(beginner).toBeFocused();
  await page.keyboard.press('Space');
  await expect(beginner).toHaveAttribute('aria-pressed', 'true');
  await expect(starter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: chooseScene })).toHaveCount(taggedClips('beginner').length);
  await page.keyboard.press('Space');
  await expect(beginner).toHaveAttribute('aria-pressed', 'false');
  await expect(showsShelf(page)).toBeVisible();
});

test('on phones the chip row scrolls sideways without widening the page and keeps the pressed chip in view', async ({ page }, info) => {
  const last = homeTags.at(-1)!;
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/en/');
    const group = tagGroup(page);
    await expect(group).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const first = (await tagChip(page, homeTags[0]).boundingBox())!;
    for (const tag of homeTags) {
      const box = (await tagChip(page, tag).boundingBox())!;
      expect(box.height, `${tag} chip is a comfortable touch target`).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.y - first.y), `${tag} chip shares one row`).toBeLessThan(1);
    }
    // The row is wider than a phone, so later chips start out of view.
    await expect(tagChip(page, last)).not.toBeInViewport();
    await page.goto(`/en/?tag=${last}`);
    await expect(tagChip(page, last)).toHaveAttribute('aria-pressed', 'true');
    await expect(tagChip(page, last)).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await tagChip(page, homeTags[0]).scrollIntoViewIfNeeded();
    await tagChip(page, homeTags[0]).click();
    await expect(tagChip(page, homeTags[0])).toHaveAttribute('aria-pressed', 'true');
    await expect(tagChip(page, homeTags[0])).toBeInViewport({ ratio: 1 });
    await page.goBack();
    await expect(tagChip(page, last)).toBeInViewport({ ratio: 1 });
    if (info.project.name === 'chromium') {
      const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `browse-tags-${width}.png`), animations: 'disabled' });
    }
  }
});

test('scene cards show the estimated level, with the source wherever scenes come from several shows', async ({ page }) => {
  const peppa = packs.find(pack => pack.data.title === 'Peppa Pig')!;
  const peppaClips = clips.filter(clip => clip.packId === peppa.entry.id);
  await page.goto('/en/library/all');
  for (const clip of [...peppaClips, clips[0], clips.at(-1)!]) {
    await expect(page.getByRole('button', { name: `Choose scene: ${sceneTitle(clip)}`, exact: true }).getByText(`${clip.note} · ${levelText(clip)}`, { exact: true })).toBeVisible();
  }
  await page.goto(packPath(peppa.entry.id, 'en'));
  for (const clip of peppaClips) {
    const card = page.getByRole('button', { name: `Choose scene: ${sceneTitle(clip)}`, exact: true });
    await expect(card.getByText(levelText(clip), { exact: true })).toBeVisible();
    await expect(card).not.toContainText('Peppa Pig ·');
  }
  await setLanguage(page, 'zh-CN');
  for (const clip of peppaClips) await expect(page.getByRole('button', { name: `选择片段：${sceneTitle(clip, 'zh-CN')}`, exact: true }).getByText(levelText(clip, 'zh-CN'), { exact: true })).toBeVisible();
  await homeLink(page, 'zh-CN').click();
  await expect(page.getByRole('heading', { level: 1, name: '选一个片段来配音', exact: true })).toBeVisible();
});
