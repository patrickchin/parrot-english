import { test, expect } from './fixtures';
import { prepareMediaTest, type MediaAudit } from './media-fixture';
import type { Page } from '@playwright/test';
import type { Scene } from '../../src/scene';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type PreloadAudit = {
  blocked: number;
  loads: { trusted: boolean; active: boolean }[];
  hold: () => void;
};
type PreloadWindow = Window & { preloadAudit: PreloadAudit; mediaAudit: MediaAudit };

test.use({ sampleScene: true });
test.beforeEach(async ({ page }) => { await prepareMediaTest(page); });

async function metadataOnlyUntilUserLoad(page: Page) {
  await page.addInitScript(() => {
    const load = HTMLMediaElement.prototype.load;
    const ready = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!.get!;
    let allowed = false, gesture: Event | undefined;
    const audit: PreloadAudit = { blocked: 0, loads: [], hold: () => { allowed = false; } };
    (window as unknown as PreloadWindow).preloadAudit = audit;
    document.addEventListener('click', event => { if (event.isTrusted) gesture = event; }, true);
    // iOS can finish metadata and remain idle until the user initiates loading.
    // Retain native video decoding/playback once an explicit trusted load occurs.
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() {
      const state = ready.call(this) as number;
      return this instanceof HTMLVideoElement && !allowed ? Math.min(state, 1) : state;
    } });
    document.addEventListener('canplay', event => {
      if (event.target instanceof HTMLVideoElement && !allowed) { audit.blocked++; event.stopImmediatePropagation(); }
    }, true);
    HTMLMediaElement.prototype.load = function () {
      const trusted = gesture?.isTrusted === true && gesture.eventPhase !== Event.NONE;
      audit.loads.push({ trusted, active: navigator.userActivation.isActive });
      if (trusted) allowed = true;
      load.call(this);
    };
  });
}

async function expectMetadataOnly(page: Page) {
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

async function expectTrustedLoads(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => (window as unknown as PreloadWindow).preloadAudit.loads)).toEqual(
    Array.from({ length: count }, () => ({ trusted: true, active: true })),
  );
}

test('a metadata-only hosted video keeps Play available and loads directly from its tap', async ({ page }) => {
  await metadataOnlyUntilUserLoad(page);
  await page.goto('/en/scenes/patrick');
  await expectMetadataOnly(page);
  const play = page.getByRole('button', { name: 'Play original scene', exact: true });
  await expect(play).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await expectTrustedLoads(page, 0);
  await play.click();
  await expectTrustedLoads(page, 1);
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Stop playback or recording', exact: true }).click();
  // Prepared playback must not reload the source and discard its native state.
  await play.click();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.2);
  await expectTrustedLoads(page, 1);
  await page.getByRole('button', { name: 'Stop playback or recording', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.length)).toBe(0);
});

test('cold Start, Record and resumed-dub playback initiate loading without premature microphone access', async ({ page }) => {
  await metadataOnlyUntilUserLoad(page);
  await page.goto('/en/scenes/patrick');
  await expectMetadataOnly(page);
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expectTrustedLoads(page, 1);
  expect(await page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.length)).toBe(0);
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(3);
  const secondLine = page.getByRole('navigation', { name: 'Your lines', exact: true }).getByRole('button', { name: /^Line 2:/ });
  await secondLine.click();
  await expect(secondLine).toHaveAttribute('aria-current', 'step');
  // This line starts its preview at 0.7 s. A cold load resets native media to
  // HAVE_NOTHING/time zero, so preparing it must preserve the subsequent seek.
  await page.evaluate(() => (window as unknown as PreloadWindow).preloadAudit.hold());
  await expectMetadataOnly(page);
  const record = page.getByRole('button', { name: 'Record', exact: true });
  await expect(record).toBeEnabled();
  await record.click();
  await expectTrustedLoads(page, 2);
  await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.every(track => track.readyState === 'ended'))).toBe(true);
  await page.reload();
  await expectMetadataOnly(page);
  await expect(secondLine).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText("I'm searching for someone.", { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record this line again', exact: true })).toBeEnabled();
  const listen = page.getByRole('button', { name: 'My recording', exact: true });
  await expect(listen).toBeEnabled();
  await expectTrustedLoads(page, 0);
  await listen.click();
  await expectTrustedLoads(page, 1);
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.7);
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.length)).toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a missing local video and a file with the wrong duration keep media actions guarded', async ({ page }) => {
  const scene: Scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
  scene.mode = 'local'; delete scene.mediaBase;
  scene.duration += 2;
  await page.route('**/scenes/patrick/scene.json', route => route.fulfill({ json: scene }));
  await page.goto('/en/scenes/patrick');
  const start = page.getByRole('button', { name: 'Start dubbing', exact: true });
  const play = page.getByRole('button', { name: 'Play reference scene', exact: true });
  await expect(start).toBeDisabled();
  await expect(play).toBeDisabled();
  await expect(page.getByText('Choose a local video', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dialogue', exact: true })).toHaveCount(0);
  await page.getByLabel('Choose a local video', { exact: true }).setInputFiles(resolve('content/media/sintel/search-v1.mp4'));
  await expect(page.getByRole('alert')).toContainText('Choose the prepared scene file with the same duration');
  await expect(start).toBeDisabled();
  await expect(play).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.length)).toBe(0);
});

test('a failed hosted video stays visibly retryable without enabling recording', async ({ page }) => {
  await page.route('**/search-v1.mp4', route => route.abort());
  await page.goto('/en/scenes/patrick');
  await expect(page.getByRole('alert')).toContainText('The video could not load');
  await expect(page.getByRole('button', { name: 'Play original scene', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reload video', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as PreloadWindow).mediaAudit.tracks.length)).toBe(0);
});
