import { test, expect, headerDestination } from './fixtures';

test('the Pop Studio hero keeps its scene artwork, readable title and start action on phones in every language', async ({ page }) => {
  for (const language of ['en', 'zh', 'es', 'ja', 'ko']) {
    await page.goto(`/${language}/`);
    if (language === 'zh') await expect(page).toHaveTitle('Parrotbook · 英语配音');
    const title = page.getByRole('heading', { level: 1 });
    const hero = page.getByRole('region').filter({ has: title });
    const start = hero.getByRole('button');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(start).toBeVisible();
      await expect(hero.getByAltText('', { exact: true })).toBeVisible();
      const lines = await title.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight));
      expect(lines, `${language} headline at ${width}px`).toBeLessThanOrEqual(2.1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await page.getByRole('banner').getByRole('link').first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('the new scene hero and shared surfaces keep playback, help, saved dubs and theme navigation usable', async ({ page }) => {
  await page.goto('/en/library/teens?show=Friends');
  const title = page.getByRole('heading', { level: 1, name: 'The scene is set. Your voice is next.' });
  await expect(title).toBeVisible();
  await page.getByRole('region').filter({ has: title }).getByRole('button', { name: 'Start dubbing', exact: true }).click();
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
