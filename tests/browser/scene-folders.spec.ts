import { test, expect, setLanguage } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('audience folders keep the eight younger scenes separate and survive playback, language changes and reload', async ({ page }, info) => {
  await page.goto('/');
  const folder = page.getByRole('combobox', { name: '片段文件夹', exact: true });
  await expect(folder).toContainText('电影与动画');
  await expect(page.getByRole('listitem')).toHaveCount(24);
  await page.getByRole('searchbox').fill('Toy Story');
  await folder.click();
  await page.getByRole('option', { name: /^较小孩子/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(8);
  for (const clip of clips.filter(c => c.cohort === 'younger-age-5')) await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await folder.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await folder.click();
    const popup = page.getByRole('listbox');
    await expect(popup.getByRole('option')).toHaveCount(4);
    await expect(popup.getByText('24 个片段', { exact: true })).toBeVisible();
    await expect(popup.getByText('8 个片段', { exact: true })).toBeVisible();
    const bounds = (await popup.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(812);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (info.project.name === 'chromium') {
      const shots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english'); await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `category-folders-${width}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(folder).toBeFocused();
  }
  await page.getByRole('button', { name: '选择片段：猜猜我们干什么了！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(folder).toContainText('较小孩子');
  await page.reload();
  await expect(folder).toContainText('较小孩子');
  await setLanguage(page, 'en');
  const translatedFolder = page.getByRole('combobox', { name: 'Scene folder', exact: true });
  await expect(translatedFolder).toContainText('Younger children');
  await translatedFolder.focus();
  await translatedFolder.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: /^Younger children/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: /^Films & animation/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(translatedFolder).toContainText('Films & animation');
  await expect(page.getByRole('listitem')).toHaveCount(24);
  await page.getByRole('searchbox').fill('banana');
  await expect(page.getByRole('button', { name: 'Choose scene: What about the floor?', exact: true })).toBeVisible();
});

test('a younger learner can record a line in a complete conversation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/scenes/ben-never-scared');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});
