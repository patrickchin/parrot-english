import { test, expect, setLanguage, openShow, showCard } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const background = (page: import('@playwright/test').Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the blue bird identity defaults to light even on a dark device and remembers an explicit theme across routes and reload', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/packs');
  await expect.poll(() => background(page)).toBe('rgb(220, 239, 255)');
  const pack = showCard(page.getByRole('region', { name: '动画与电影', exact: true }), 'SpongeBob SquarePants', 'zh-CN');
  await expect(pack).toBeVisible();
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await expect.poll(() => background(page)).toBe('rgb(17, 19, 24)');
  await pack.click();
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect.poll(() => background(page)).toBe('rgb(17, 19, 24)');
  await page.reload();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '切换到浅色模式', exact: true })).toBeVisible();
  await expect.poll(() => background(page)).toBe('rgb(17, 19, 24)');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const themeControl = page.getByRole('button', { name: '切换到浅色模式', exact: true });
    await expect(themeControl).toBeVisible();
    const theme = (await themeControl.boundingBox())!;
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
        await page.screenshot({ path: join(folder, `bluebird-${mode}-${width}.png`), animations: 'disabled' });
      }
    }
  }
  await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click();
  await page.reload();
  await expect.poll(() => background(page)).toBe('rgb(220, 239, 255)');
});

test('appearance switching still works across scene navigation without browser storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.goto('/packs');
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await openShow(page, 'Toy Story');
  await page.getByRole('button', { name: '选择片段：飞向宇宙！', exact: true }).click();
  await expect(page.getByRole('region', { name: '选择角色', exact: true })).toBeVisible();
  const player = page.getByRole('main').locator('..');
  await expect(player).toHaveCSS('background-color', 'rgb(17, 19, 24)');
  await expect.poll(() => background(page)).toBe('rgb(17, 19, 24)');
  await setLanguage(page, 'en');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(player).toHaveCSS('background-color', 'rgb(243, 239, 230)');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  const controls = page.getByRole('group', { name: 'Dubbing controls', exact: true });
  await expect(controls.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(player).toHaveCSS('background-color', 'rgb(17, 19, 24)');
  await expect(controls.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect.poll(() => background(page)).toBe('rgb(220, 239, 255)');
});
