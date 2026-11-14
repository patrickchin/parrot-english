import { test, expect } from './fixtures';
import { readScene, clips } from '../content-fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

for (const slug of ['corn-corntastic-day', 'apparently-get-dizzy', 'emotional-damage', 'weather-boy', 'i-like-turtles', 'nine-plus-ten', 'they-were-roommates', 'can-i-pet-that-dog', 'in-me-mums-car', 'lei-jun-are-you-ok', 'road-work-ahead', 'hurricane-tortilla', 'dropped-my-croissant', 'look-at-those-chickens', 'i-smell-like-beef', 'avocado-thanks', 'god-and-anime', 'valentino-white-bag', 'i-want-waffle-fries', 'very-demure-mindful']) {
  test(`social meme ${slug} supports discovery, original playback and saved recording`, async ({ page, browserName }, info) => {
    const scene = readScene(slug);
    const clip = clips.find(clip => clip.slug === slug)!;
    const title = clip.english;
    await page.goto('/en/');
    await page.getByRole('navigation', { name: 'Browse tags', exact: true }).getByRole('link', { name: 'Memes', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/library\/all\?show=Memes$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Memes', exact: true })).toBeVisible();
    await page.getByRole('searchbox').fill(title);
    await page.getByRole('button', { name: `Choose scene: ${title}`, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Preview subtitles', exact: true }).getByRole('listitem')).toHaveCount(scene.lines.length);
    for (const role of scene.roles) {
      const button = page.getByRole('button', { name: role.name, exact: true });
      if (role.selectable === false) {
        await expect(button).toHaveCount(0);
      } else {
        await expect(button).toBeVisible();
        if (role.portrait) await expect.poll(() => button.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
        else await expect(button.locator('img')).toHaveCount(0);
      }
    }
    await page.getByRole('button', { name: 'Scene credits', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Watch the original', exact: true })).toHaveAttribute('href', scene.credit.source);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    const video = page.locator('video');
    await page.getByRole('button', { name: 'Play original scene', exact: true }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Stop playback or recording', exact: true }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(scene.duration, 1);
    await expect(video).toHaveJSProperty('error', null);
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `${slug}-playable.png`), fullPage: true });
    }
    if (browserName !== 'chromium') return;
    await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'My recording', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  });
}
