import { scenePath } from './scene-path';
import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';

test('TV franchise collections open from the directory with complete scenes', async ({ page }) => {
  await page.goto('/en/');
  await page.getByRole('link', { name: 'Young Sheldon', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Young Sheldon').length);
  await page.getByRole('link', { name: 'Browse tags', exact: true }).click();
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Choose scene: A sofa that will not turn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await setLanguage(page, 'zh-CN');
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Friends', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(clips.filter(clip => clip.note === 'Friends').length);
});

for (const slug of ['young-sheldon-library', 'himym-driving-lesson', 'harry-potter-new-friend', 'big-bang-notebook', 'bluey-real-coins', 'young-sheldon-good-guest', 'big-bang-long-lesson']) test(`${slug} plays and records a TV conversation line`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture needs a physical device.');
  await page.goto(scenePath(slug));
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 20000 });
});

test('an unknown folder shows a missing-page error', async ({ page }) => {
  await page.goto('/library/unknown');
  await expect(page.getByRole('heading', { level: 1, name: '页面不存在', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});
