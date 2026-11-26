import { test, expect, setLanguage, escapeRegExp, openShow, sceneItems, showCard } from './fixtures';
import { clips } from '../content-fixtures';
import { readFile } from 'node:fs/promises';

const filmCount = clips.filter(clip => clip.note === 'Ratatouille').length;

const youngerCount = clips.filter(clip => clip.note === 'English Singsing').length;

test('learner franchises open from the directory and survive playback and language changes', async ({ page }) => {
  await page.goto('/en/');
  const younger = showCard(page.getByRole('region', { name: 'First English', exact: true }), 'English Singsing');
  await expect(younger).toContainText(`${youngerCount} scenes`);
  await younger.focus();
  await younger.press('Enter');
  await expect(sceneItems(page)).toHaveCount(youngerCount);
  await page.getByRole('button', { name: 'Choose scene: Good morning! How are you?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await page.reload();
  await expect(sceneItems(page)).toHaveCount(youngerCount);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: 'English Singsing', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: '导航路径', exact: true }).getByRole('link', { name: '首页', exact: true }).click();
  await openShow(page, 'Ratatouille');
  await expect(sceneItems(page)).toHaveCount(filmCount);
  await page.getByRole('searchbox').fill('cook');
  await expect(page.getByRole('button', { name: '选择片段：谁都能做饭！', exact: true })).toBeVisible();
});

test('a younger learner can record a line in a complete conversation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/scenes/first-english-good-morning');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});

test('internet memes share one tag and retain searchable source names', async ({ page }) => {
  const recipe = JSON.parse(await readFile('content/social-meme-review-scenes.json', 'utf8'));
  const sceneIds = new Set(recipe.scenes.map((scene: { sceneId: string }) => scene.sceneId));
  const memes = clips.filter(clip => sceneIds.has(clip.id));
  await page.goto('/en/');
  const shelf = page.getByRole('region', { name: 'Memes', exact: true });
  const seeAll = shelf.getByRole('link', { name: `See all ${memes.length} in Memes`, exact: true });
  await expect(seeAll).toBeVisible();
  await expect(showCard(page.getByRole('region', { name: 'Cartoons & films', exact: true }), 'SpongeBob SquarePants')).toBeVisible();
  for (const source of new Set(memes.map(clip => clip.note))) {
    await expect(page.getByRole('link', { name: new RegExp(`^${escapeRegExp(source)}`) })).toHaveCount(0);
  }
  await seeAll.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memes', exact: true })).toBeVisible();
  await expect(sceneItems(page)).toHaveCount(memes.length);
  for (const clip of memes) await expect(page.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('FOX5');
  await expect(page.getByRole('button', { name: "Choose scene: Wouldn't you like to know, weather boy?", exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find a show or scene', exact: true }).fill('Memes');
  await expect(showCard(page.getByRole('region', { name: 'Shows', exact: true }), 'Memes')).toBeVisible();
});
