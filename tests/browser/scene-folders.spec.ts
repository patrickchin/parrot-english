import { test, expect, setLanguage } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const filmCount = clips.filter(clip => clip.cohort === 'older-audience').length;

const youngerCount = clips.filter(clip => clip.cohort === 'younger-age-5').length;

test('audience folders keep the younger scenes separate and survive playback, language changes and reload', async ({ page }, info) => {
  await page.goto('/');
  const categories = page.getByRole('group', { name: '片段分类', exact: true });
  const younger = categories.getByRole('button', { name: /^英语启蒙/ });
  await expect(categories.getByRole('button', { pressed: true })).toContainText('电影与动画');
  await expect(page.getByRole('combobox', { name: '片段文件夹', exact: true })).toHaveCount(0);
  await expect(categories.getByRole('button')).toHaveCount(4);
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
  await page.getByRole('searchbox').fill('Toy Story');
  await younger.click();
  await expect(younger).toHaveAttribute('aria-pressed', 'true');
  await expect(categories.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  for (const clip of clips.filter(c => c.cohort === 'younger-age-5')) await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await categories.getByRole('button').all()) {
      await expect(button).toBeVisible();
      const thumbnail = button.getByAltText('', { exact: true });
      await expect(thumbnail).toBeVisible();
      await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await expect(categories.getByText(`${filmCount} 个片段`, { exact: true })).toBeVisible();
    await expect(younger.getByText(`${youngerCount} 个片段`, { exact: true })).toBeVisible();
    if (info.project.name === 'chromium') {
      const shots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english'); await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `category-tabs-${width}.png`), animations: 'disabled', fullPage: true });
    }
  }
  await page.getByRole('button', { name: '选择片段：早上好！你好吗？', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(younger).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(younger).toHaveAttribute('aria-pressed', 'true');
  await setLanguage(page, 'en');
  const translatedCategories = page.getByRole('group', { name: 'Scene categories', exact: true });
  const translatedYounger = translatedCategories.getByRole('button', { name: /^First English/ });
  await expect(translatedYounger).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 320, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'chromium') {
    await page.screenshot({ path: join(homedir(), 'Pictures/Screenshots/Codex/parrot-english/category-thumbnails-english-320.png'), animations: 'disabled', fullPage: true });
  }
  // Every category participates in native Tab/Shift+Tab and Enter/Space navigation.
  await translatedYounger.focus();
  await translatedYounger.press('Tab');
  await expect(translatedCategories.getByRole('button', { name: /^Ages 10–12/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  const films = translatedCategories.getByRole('button', { name: /^Films & animation/ });
  await expect(films).toBeFocused();
  await films.press('Enter');
  await expect(films).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
  await translatedYounger.focus();
  await translatedYounger.press('Space');
  await expect(translatedYounger).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('listitem')).toHaveCount(youngerCount);
  await films.click();
  await page.getByRole('searchbox').fill('floor');
  await expect(page.getByRole('button', { name: 'Choose scene: What about the floor?', exact: true })).toBeVisible();
});

test('a younger learner can record a line in a complete conversation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/scenes/first-english-good-morning');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});
