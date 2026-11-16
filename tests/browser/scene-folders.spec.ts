import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';
import { readFile } from 'node:fs/promises';

const filmCount = clips.filter(clip => clip.note === 'Ratatouille').length;

const youngerCount = clips.filter(clip => clip.note === 'English Singsing').length;

test('learner franchises open from the directory and survive playback and language changes', async ({ page }) => {
  await page.goto('/en/');
  const tags = page.getByRole('navigation', { name: 'Packs', exact: true });
  const younger = tags.getByRole('link', { name: 'English Singsing', exact: true });
  await expect(younger).toContainText(`${youngerCount} scenes`);
  await younger.focus();
  await younger.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await page.getByRole('button', { name: 'Choose scene: Good morning! How are you?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: 'English Singsing', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '全部内容包', exact: true }).click();
  await page.getByRole('link', { name: 'Ratatouille', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
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
  const tags = page.getByRole('navigation', { name: 'Packs', exact: true });
  const tag = tags.getByRole('link', { name: 'Memes', exact: true });
  await expect(tag).toContainText(`${memes.length} scenes`);
  await expect(tags.getByRole('link', { name: 'SpongeBob SquarePants', exact: true })).toBeVisible();
  for (const source of new Set(memes.map(clip => clip.note))) {
    await expect(tags.getByRole('link', { name: source, exact: true })).toHaveCount(0);
  }
  await tag.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memes', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(memes.length);
  for (const clip of memes) await expect(page.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('FOX5');
  await expect(page.getByRole('button', { name: "Choose scene: Wouldn't you like to know, weather boy?", exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All packs', exact: true }).click();
  await page.getByRole('searchbox').fill('Memes');
  await expect(page.getByRole('navigation', { name: 'Packs', exact: true }).getByRole('link', { name: 'Memes', exact: true })).toBeVisible();
});
