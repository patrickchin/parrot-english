import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test.use({ samplePack: true });

const selector = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: 'UI language / 界面语言' });

test('UI language persists across navigation and reload while English dialogue and Chinese hints stay independent', async ({ page }, info) => {
  await page.goto('/');
  await selector(page).selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'No, this is Patrick!' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Choose scene: No, this is Patrick!', exact: true }).click();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expect(page.getByText('Thank you.', { exact: true })).toHaveAttribute('lang', 'en');
  await expect(page.getByText('谢谢你。', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Show Chinese meaning hints' })).toHaveCount(0);
  await selector(page).selectOption('zh-CN');
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeVisible();
  await expect(page.getByText('Thank you.', { exact: true })).toBeVisible();
  await expect(page.getByText('谢谢你。', { exact: true })).toBeVisible();
  await selector(page).selectOption('en');
  for (const viewport of [{ width: 320, height: 640 }, { width: 360, height: 640 }, { width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width >= 360) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    for (const control of [selector(page), page.getByRole('button', { name: 'How to dub', exact: true }), page.getByRole('button', { name: 'Back to scenes', exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    if (info.project.name === 'chromium' && [375, 1280].includes(viewport.width)) {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `ui-language-${viewport.width}.png`) });
    }
  }
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await page.reload();
  await expect(selector(page)).toHaveValue('en');
  await expect(page.getByRole('heading', { level: 1, name: 'No, this is Patrick!' })).toBeVisible();
});

test('switching language during recording keeps the take, waveform and replay', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit recording requires a physical-device check.');
  await page.goto('/#patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await selector(page).selectOption('en');
  await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(page.getByRole('img', { name: 'Your voice waveform', exact: true })).toBeVisible();
  await selector(page).selectOption('zh-CN');
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
});

test('language works without local storage and translates recording guidance and microphone errors', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } });
  });
  await page.goto('/#patrick');
  await selector(page).selectOption('en');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('No uploads · Clears on close', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Microphone access is off.');
  await selector(page).selectOption('zh-CN');
  await expect(page.getByRole('alert')).toContainText('麦克风还没开启。');
});

test('failed scene loading keeps the language selector available', async ({ page }) => {
  await page.route('**/packs/patrick/pack.json', route => route.fulfill({ status: 503 }));
  await page.goto('/#patrick');
  await expect(page.getByRole('alert')).toBeVisible();
  await selector(page).selectOption('en');
  await expect(page.getByRole('alert')).toHaveText('The scene could not load. Please try again.');
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
});
