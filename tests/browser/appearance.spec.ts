import { test, expect, setLanguage } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const background = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('Playhouse defaults to light even on a dark device and remembers an explicit theme across routes and reload', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect.poll(() => background(page)).toBe('rgb(243, 245, 242)');
  const featured = page.getByRole('region', { name: '不，这是派大星！', exact: true });
  await expect(featured.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await expect.poll(() => background(page)).toBe('rgb(23, 23, 23)');
  await featured.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect.poll(() => background(page)).toBe('rgb(23, 23, 23)');
  await page.reload();
  await expect(page.getByRole('button', { name: '切换到浅色模式', exact: true })).toBeVisible();
  await expect.poll(() => background(page)).toBe('rgb(23, 23, 23)');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const theme = (await page.getByRole('button', { name: '切换到浅色模式', exact: true }).boundingBox())!;
    expect(theme.width).toBeGreaterThanOrEqual(44);
    expect(theme.height).toBeGreaterThanOrEqual(44);
    expect(theme.x + theme.width).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  for (const mode of ['light', 'dark'] as const) {
    if (mode === 'light') {
      const toggle = page.getByRole('button', { name: '切换到浅色模式', exact: true });
      await toggle.focus();
      await toggle.press('Space');
    } else await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (info.project.name === 'chromium') {
        const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
        await mkdir(folder, { recursive: true });
        await page.screenshot({ path: join(folder, `playhouse-${mode}-${width}.png`), animations: 'disabled' });
      }
    }
  }
  await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click();
  await page.reload();
  await expect.poll(() => background(page)).toBe('rgb(243, 245, 242)');
});

test('appearance switching still works across scene navigation without browser storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await page.getByRole('button', { name: '选择片段：飞向宇宙！', exact: true }).click();
  await expect(page.getByRole('region', { name: '选择角色', exact: true })).toBeVisible();
  await expect.poll(() => background(page)).toBe('rgb(23, 23, 23)');
  await setLanguage(page, 'en');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect.poll(() => background(page)).toBe('rgb(243, 245, 242)');
});
