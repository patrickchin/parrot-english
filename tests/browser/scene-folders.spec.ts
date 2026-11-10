import { test, expect } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('audience folders keep the eight younger scenes separate and survive playback, language changes and reload', async ({ page }, info) => {
  await page.goto('/');
  const folder = page.getByRole('combobox', { name: '片段文件夹', exact: true });
  await expect(folder).toHaveValue('older-audience');
  await expect(page.getByRole('listitem')).toHaveCount(24);
  await page.getByRole('searchbox').fill('Toy Story');
  await folder.selectOption('younger-age-5');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(8);
  for (const clip of clips.filter(c => c.cohort === 'younger-age-5')) await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await folder.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      const shots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english'); await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `scene-folders-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: '选择片段：猜猜我们干什么了！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(folder).toHaveValue('younger-age-5');
  await page.reload();
  await expect(folder).toHaveValue('younger-age-5');
  await page.getByRole('combobox', { name: 'UI language / 界面语言' }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'Scene folder', exact: true })).toHaveValue('younger-age-5');
  await page.getByRole('combobox', { name: 'Scene folder', exact: true }).selectOption('older-audience');
  await expect(page.getByRole('listitem')).toHaveCount(24);
  await page.getByRole('searchbox').fill('banana');
  await expect(page.getByRole('button', { name: 'Choose scene: What about the floor?', exact: true })).toBeVisible();
});

test('a younger learner can record a line in a complete conversation', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/?folder=younger-age-5#ben-never-scared');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});
