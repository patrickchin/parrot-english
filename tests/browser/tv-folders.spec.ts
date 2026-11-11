import { test, expect, setLanguage } from './fixtures';
import { clips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const olderChildCount = clips.filter(clip => clip.cohort === 'older-children').length;
const teenCount = clips.filter(clip => clip.cohort === 'teens').length;

test('TV folders open directly, keep complete scenes separate, and survive language changes and reload', async ({ page }, info) => {
  await page.goto('/library/older-children');
  const categories = page.getByRole('group', { name: '片段分类', exact: true });
  const teens = categories.getByRole('button', { name: /^青少年/ });
  await expect(categories.getByRole('button', { pressed: true })).toContainText('10–12岁');
  await expect(page.getByRole('listitem')).toHaveCount(olderChildCount);
  await page.getByRole('searchbox').fill('not-a-scene');
  await teens.click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(teenCount);
  for (const clip of clips.filter(clip => clip.cohort === 'teens')) await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(categories.getByRole('button')).toHaveCount(4);
    await expect(categories.getByText(`${olderChildCount} 个片段`, { exact: true })).toBeVisible();
    await expect(categories.getByText(`${teenCount} 个片段`, { exact: true })).toBeVisible();
    await expect(teens).toHaveAttribute('aria-pressed', 'true');
    if (info.project.name === 'chromium') {
      const shots = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `tv-category-tabs-${width}.png`), animations: 'disabled', fullPage: true });
    }
  }
  await page.getByRole('button', { name: '选择片段：转不过弯的沙发', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /瑞秋和钱德勒/ })).toHaveCount(0);
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(teens).toHaveAttribute('aria-pressed', 'true');
  await setLanguage(page, 'en');
  await page.reload();
  await expect(page.getByRole('group', { name: 'Scene categories', exact: true }).getByRole('button', { pressed: true })).toContainText('Teenagers');
  await expect(page.getByRole('listitem')).toHaveCount(teenCount);
});

for (const slug of ['young-sheldon-library', 'himym-driving-lesson', 'harry-potter-new-friend', 'big-bang-notebook', 'bluey-real-coins', 'young-sheldon-good-guest', 'big-bang-long-lesson']) test(`${slug} plays and records a TV conversation line`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto('/scenes/' + slug);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 20000 });
});

test('an unknown folder returns to the established film library', async ({ page }) => {
  await page.goto('/library/unknown');
  await expect(page.getByRole('group', { name: '片段分类', exact: true }).getByRole('button', { pressed: true })).toContainText('电影与动画');
  await expect(page.getByRole('listitem')).toHaveCount(24);
});
