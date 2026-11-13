import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';

const filmCount = clips.filter(clip => clip.note === 'Ratatouille').length;

const youngerCount = clips.filter(clip => clip.note === 'English Singsing').length;

test('learner franchises open from the directory and survive playback and language changes', async ({ page }) => {
  await page.goto('/en/');
  const tags = page.getByRole('navigation', { name: 'Browse tags', exact: true });
  const younger = tags.getByRole('link', { name: 'English Singsing', exact: true });
  await expect(younger).toHaveAccessibleDescription(`${youngerCount} scenes`);
  await younger.focus();
  await younger.press('Enter');
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await page.getByRole('button', { name: 'Choose scene: Good morning! How are you?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await setLanguage(page, 'zh-CN');
  await expect(page.getByRole('heading', { level: 2, name: 'English Singsing', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '浏览标签', exact: true }).click();
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
