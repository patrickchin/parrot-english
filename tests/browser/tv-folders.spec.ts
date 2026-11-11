import { test, expect, setLanguage } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('TV folders open directly, keep complete scenes separate, and survive language changes and reload', async ({ page }, info) => {
  await page.goto('/?folder=older-children');
  const folder = page.getByRole('combobox', { name: '片段文件夹', exact: true });
  await expect(folder).toContainText('10–12岁');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('searchbox').fill('not-a-scene');
  await folder.click();
  await page.getByRole('option', { name: /^青少年/ }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(5);
  for (const clip of clips.filter(clip => clip.cohort === 'teens')) await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await folder.click();
    const menu = page.getByRole('listbox');
    await expect(menu.getByRole('option')).toHaveCount(4);
    await expect(menu.getByText('3 个片段', { exact: true })).toBeVisible();
    await expect(menu.getByText('5 个片段', { exact: true })).toBeVisible();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (info.project.name === 'chromium') {
      const shots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `tv-folders-${width}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: '选择片段：转不过弯的沙发', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /瑞秋和钱德勒/ })).toHaveCount(0);
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(folder).toContainText('青少年');
  await setLanguage(page, 'en');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Scene folder', exact: true })).toContainText('Teenagers');
  await expect(page.getByRole('listitem')).toHaveCount(5);
});

for (const slug of ['young-sheldon-library', 'himym-driving-lesson']) test(`${slug} plays and records a TV conversation line`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/#' + slug);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 20000 });
});

test('an unknown folder returns to the established film library', async ({ page }) => {
  await page.goto('/?folder=unknown');
  await expect(page.getByRole('combobox', { name: '片段文件夹', exact: true })).toContainText('电影与动画');
  await expect(page.getByRole('listitem')).toHaveCount(24);
});
