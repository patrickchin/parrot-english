import { test, expect, headerDestination } from './fixtures';

test('the pack gallery keeps artwork, readable titles and usable selection on phones in every language', async ({ page }) => {
  for (const [language, label] of [['en', 'Packs'], ['zh', '内容包'], ['es', 'Paquetes'], ['ja', 'パック'], ['ko', '팩']]) {
    await page.goto(`/${language}/`);
    if (language === 'zh') await expect(page).toHaveTitle('Parrotbook · 英语配音');
    const title = page.getByRole('heading', { level: 1, name: label, exact: true });
    const gallery = page.getByRole('navigation', { name: label, exact: true });
    const pack = gallery.getByRole('link', { name: 'Friends', exact: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(title).toBeVisible();
      await pack.scrollIntoViewIfNeeded(); await pack.focus();
      await expect(pack).toBeFocused(); await expect(pack).toBeInViewport();
      await expect(pack.getByAltText('', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await pack.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await page.getByRole('banner').getByRole('link').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await pack.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Friends', exact: true })).toBeVisible();
  }
});

test('pack selection and shared surfaces keep playback, help, saved dubs and theme navigation usable', async ({ page }) => {
  await page.goto('/en/');
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Choose scene: A sofa that will not turn', exact: true }).click();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'How to dub', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Before a child uses it, a guardian must understand and agree to the recording purpose.');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await (await headerDestination(page, 'My dubs')).click();
  await expect(page.getByRole('button', { name: /^Continue dub:/ })).toHaveCount(1);
  await expect(page.getByText('Saved only in this browser.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.getByRole('button', { name: /^Delete dub:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Delete this dub?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep dub', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Continue dub:/ })).toHaveCount(1);
});
