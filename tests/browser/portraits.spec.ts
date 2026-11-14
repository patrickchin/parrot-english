import { readScene } from '../content-fixtures';
import { scenePath } from './scene-path';
import { test, expect } from './fixtures';
import { clips, packs } from '../content-fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('each authored character avatar loads in the role picker', async ({ page }, info) => {
  // This visits every authored scene; budget grows with the content catalog.
  test.setTimeout(clips.length * 4000 + 30000);
  const avatars = new Map<string, string>();
  for (const clip of clips) {
    const scene = readScene(clip.slug);
    const locale = packs.find(pack => pack.entry.id === clip.packId)!.data.locales['zh-CN'];
    if (!scene.roles.some((role: { portrait?: string }) => role.portrait)) continue;
    await page.goto(scenePath(clip.slug));
    for (const role of scene.roles.filter((role: { selectable?: boolean }) => role.selectable !== false)) {
      const button = page.getByRole('button', { name: locale.roles[role.id].name, exact: true });
      await expect(button).toBeVisible();
      if (role.name === '来电者') continue; // Never appears in the scene.
      expect(role.portrait).toBeTruthy();
      const portrait = button.locator('img');
      await expect(portrait).toBeVisible();
      await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThanOrEqual(192);
      const filename = (await portrait.getAttribute('src'))!.split('/').pop()!;
      // Scene-specific filenames may share the same source-character crop.
      const imageId = filename.match(/(?:avatar|portrait)-([a-f0-9]+)\.jpg$/)?.[1] ?? filename;
      const character = `${clip.note}:${role.name}`;
      if (avatars.has(character)) expect(imageId).toBe(avatars.get(character));
      avatars.set(character, imageId);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  }
  expect(avatars.get('Young Sheldon:谢尔顿')).not.toBe(avatars.get('The Big Bang Theory:谢尔顿'));
  await page.goto('/scenes/onions');
  await expect(page.getByRole('button', { name: /^驴子/ })).toBeVisible();
  const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
  await mkdir(folder, { recursive: true });
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /^史莱克/ })).toBeVisible();
    if (info.project.name === 'chromium' && width !== 320) {
      await page.screenshot({ path: join(folder, `character-picker-${width}.png`), fullPage: true });
    }
  }
});

test('a failed portrait keeps the character named and selectable', async ({ page }) => {
  await page.route('**/*-avatar-*.jpg', route => route.abort());
  await page.goto('/scenes/onions');
  const donkey = page.getByRole('button', { name: /^驴子/ });
  await expect(donkey).toBeVisible();
  await expect(donkey.locator('img')).toHaveCount(0);
  await donkey.click();
  await expect(donkey).toHaveAttribute('aria-pressed', 'true');
});
