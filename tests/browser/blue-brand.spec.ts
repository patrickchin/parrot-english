import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { prepareMediaTest } from './media-fixture';

const brandingPrefix = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/branding/geometric-bird/';

test.use({ sampleScene: true });
test.beforeEach(async ({ page }) => {
  // Keep geometry and URL-contract checks independent of the network. The exact
  // original branding image is verified separately against the published asset.
  await page.route(`${brandingPrefix}**`, route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  }));
});

async function expectTextContrast(control: Locator, label: string) {
  const measured = await control.evaluate(element => {
    const channels = (value: string) => {
      const result = value.match(/^rgba?\(([^)]+)\)$/);
      if (!result) throw new Error(`Unsupported rendered colour: ${value}`);
      return result[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255];
    for (const ancestor of ancestors) {
      const [r, g, b, alpha = 1] = channels(getComputedStyle(ancestor).backgroundColor);
      background = [r, g, b].map((value, index) => value * alpha + background[index] * (1 - alpha));
    }
    const foreground = getComputedStyle(element).color;
    const [r, g, b, alpha = 1] = channels(foreground);
    const text = [r, g, b].map((value, index) => value * alpha + background[index] * (1 - alpha));
    const luminance = (colour: number[]) => colour.map(value => {
      const linear = value / 255;
      return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const a = luminance(text), bLuminance = luminance(background);
    return { foreground, background, ratio: (Math.max(a, bLuminance) + 0.05) / (Math.min(a, bLuminance) + 0.05) };
  });
  expect(measured.ratio, `${label}: ${measured.foreground} on ${measured.background.join(', ')}`).toBeGreaterThanOrEqual(4.5);
}

test('the geometric bird stays visible and its native icon links use the published branding assets', async ({ page }) => {
  await page.goto('/en/packs');
  await expect(page.getByRole('heading', { level: 1, name: 'Pick a scene to dub', exact: true })).toBeVisible();
  const home = page.getByRole('banner').getByRole('link', { name: 'Parrotbook home', exact: true });
  const logo = home.getByAltText('', { exact: true });
  await expect(logo).toHaveCount(1);
  expect((await logo.getAttribute('src'))?.startsWith(brandingPrefix), 'The header uses the published branding URL').toBe(true);
  await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  for (const relation of ['icon', 'apple-touch-icon']) {
    const icons = page.locator(`head link[rel="${relation}"]`);
    expect(await icons.count(), `${relation} is present`).toBeGreaterThan(0);
    for (const icon of await icons.all()) expect((await icon.getAttribute('href'))?.startsWith(brandingPrefix), `${relation} uses the published branding URL`).toBe(true);
  }
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(home).toBeVisible();
      await expect(logo).toBeVisible();
      const box = (await logo.boundingBox())!;
      expect(box.width).toBe(width < 640 ? 28 : 36);
      expect(box.height).toBe(width < 640 ? 28 : 36);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

for (const mode of ['light', 'dark']) test(`${mode} branding keeps header, primary and recording text readable`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem('parrotbook-theme', theme), mode);
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareMediaTest(page);
  await page.goto('/en/scenes/patrick');
  const home = page.getByRole('banner').getByRole('link', { name: 'Parrotbook home', exact: true });
  const start = page.getByRole('button', { name: 'Start dubbing', exact: true });
  await expect(start).toBeEnabled();
  expect((await home.getByAltText('', { exact: true }).boundingBox())!.width).toBe(36);
  await expectTextContrast(home, `${mode} header`);
  await expectTextContrast(start, `${mode} primary action`);
  await start.click();
  const record = page.getByRole('button', { name: 'Record', exact: true });
  await expect(record).toBeEnabled();
  await expectTextContrast(record, `${mode} recording action`);
  await page.setViewportSize({ width: 320, height: 568 });
  expect((await home.getByAltText('', { exact: true }).boundingBox())!.width).toBe(28);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
