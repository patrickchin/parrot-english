import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const mobileViewports = [
  { name: 'phone-small', width: 320, height: 568 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
];
export async function touchControl(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
export async function mobileScreenshot(page: Page, info: TestInfo, state: string, shape: string) {
  const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `${info.project.name}-${state}-${shape}.png`), fullPage: true, animations: 'disabled' });
}
