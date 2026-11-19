import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { prepareMediaTest } from './media-fixture';
import { touchControl } from './mobile-viewports';

test.use({ sampleScene: true });

async function expectVisuallyClipped(text: Locator) {
  await expect(text).toBeAttached();
  expect(await text.evaluate(element => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      if ((style.clip !== 'auto' || style.clipPath !== 'none') && box.width <= 1 && box.height <= 1) return true;
    }
    return false;
  }), 'Routine information stays available to assistive technology without taking visible space').toBe(true);
}

async function expectCaption(button: Locator, caption: string, shown: boolean) {
  const text = button.getByText(caption, { exact: true });
  await expect(button.locator('svg')).toBeVisible();
  if (!shown) return expect(text).toBeHidden();
  await expect(text).toBeVisible();
  const icon = (await button.locator('svg').boundingBox())!, label = (await text.boundingBox())!;
  expect(label.x).toBeGreaterThan(icon.x + icon.width);
  expect(Math.abs(label.y + label.height / 2 - icon.y - icon.height / 2)).toBeLessThan(2);
}

test('player summaries stay out of the picture and primary controls follow their available width', async ({ page }) => {
  const lines = await prepareMediaTest(page);
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expectVisuallyClipped(page.getByText('Sintel', { exact: true }));
  await expectVisuallyClipped(page.getByText('Saved on this device', { exact: true }));
  const waveform = page.getByRole('region', { name: 'Voice waveform comparison', exact: true });
  await expectVisuallyClipped(waveform.getByText('Original', { exact: true }));
  await expectVisuallyClipped(waveform.getByText('Your voice', { exact: true }));

  const controls = page.getByRole('group', { name: 'Dubbing controls', exact: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const group = (await controls.boundingBox())!, captions = group.width >= 340;
    const original = controls.getByRole('button', { name: 'Listen to the original line', exact: true });
    const record = controls.getByRole('button', { name: 'Record', exact: true });
    const take = controls.getByRole('button', { name: 'My recording (You)', exact: true });
    await expectCaption(original, 'Original', captions);
    await expectCaption(record, 'Record', captions);
    await expectCaption(take, 'You', captions);
    const originalBox = (await original.boundingBox())!, recordBox = (await record.boundingBox())!, takeBox = (await take.boundingBox())!;
    expect(takeBox.x).toBeGreaterThan(recordBox.x);
    expect(recordBox.x).toBeGreaterThan(originalBox.x);
    const previous = controls.getByRole('button', { name: 'Previous line', exact: true });
    const next = controls.getByRole('button', { name: 'Next', exact: true });
    await expectCaption(previous, 'Previous', captions);
    await expectCaption(next, 'Next', captions);
    const previousBox = (await previous.boundingBox())!, nextBox = (await next.boundingBox())!;
    expect(nextBox.x).toBeGreaterThan(previousBox.x);
    expect(Math.abs(nextBox.x + nextBox.width - group.x - group.width)).toBeLessThan(1);
    const movie = page.getByRole('region', { name: 'Movie scene', exact: true });
    const transport = (await movie.getByRole('button', { name: 'Play reference scene', exact: true }).boundingBox())!;
    const progress = (await movie.getByRole('progressbar', { name: 'Scene playback progress', exact: true }).boundingBox())!;
    expect(transport.x).toBeGreaterThan(progress.x + progress.width);
    for (const button of await controls.getByRole('button').all()) await touchControl(page, button);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  for (const _ of lines) await controls.getByRole('button', { name: 'Next', exact: true }).click();
  const result = page.getByRole('region', { name: 'Dub complete', exact: true });
  await expectVisuallyClipped(result.getByRole('heading', { level: 1, name: 'Your dub is ready!', exact: true }));
  await expectVisuallyClipped(result.getByText(/^Recorded lines: 0\./));
  await expect(result.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const group = (await controls.boundingBox())!, captions = group.width >= 340;
    const primary = [['Previous line', 'Previous'], ['Play my dub', 'Play'], ['Edit a line', 'Edit'], ['Download video', 'Download']];
    for (const [name, caption] of primary) await expectCaption(result.getByRole('button', { name, exact: true }), caption, captions);
    const play = result.getByRole('button', { name: 'Play my dub', exact: true });
    const back = result.getByRole('button', { name: 'Previous line', exact: true });
    const playBox = (await play.boundingBox())!, backBox = (await back.boundingBox())!;
    expect(playBox.x).toBeGreaterThan(backBox.x);
    expect(Math.abs(playBox.x + playBox.width - group.x - group.width)).toBeLessThan(1);
    const playIcon = (await play.locator('svg').boundingBox())!;
    for (const name of ['Prepare to share', 'Start over', 'Scene credits']) {
      const utility = result.getByRole('button', { name, exact: true });
      await expect(utility).toHaveText('');
      await touchControl(page, utility);
      const box = (await utility.boundingBox())!, icon = (await utility.locator('svg').boundingBox())!;
      expect(box.height).toBeLessThan(playBox.height);
      expect(icon.width).toBeLessThan(playIcon.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('finished-dub Previous returns to the last line and accepted takes survive save recovery', async ({ page }) => {
  const lines = await prepareMediaTest(page);
  await page.goto('/en/scenes/patrick');
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeAttached();
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    const state = window as unknown as { rejectSave?: () => void; restoreSave: () => void };
    state.restoreSave = () => { Blob.prototype.arrayBuffer = original; };
    Blob.prototype.arrayBuffer = function () {
      if (!this.type.startsWith('audio/')) return original.call(this);
      return new Promise<ArrayBuffer>((_, reject) => { state.rejectSave = () => reject(new DOMException('Full', 'QuotaExceededError')); });
    };
  });
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const take = page.getByRole('button', { name: 'My recording (You)', exact: true });
  await expect(take).toBeEnabled();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { rejectSave?: () => void }).rejectSave)).toBe(true);
  const saving = page.getByText('Saving…', { exact: true });
  await expect(saving).toBeVisible();
  expect((await saving.boundingBox())!.height).toBeGreaterThan(1);
  await page.evaluate(() => (window as unknown as { rejectSave: () => void }).rejectSave());
  await expect(page.getByRole('alert')).toContainText('storage is full');
  const failed = page.getByText('Not saved yet', { exact: true });
  await expect(failed).toBeVisible();
  expect((await failed.boundingBox())!.height).toBeGreaterThan(1);
  await page.evaluate(() => (window as unknown as { restoreSave: () => void }).restoreSave());
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expectVisuallyClipped(page.getByText('Saved on this device', { exact: true }));
  for (const _ of lines) await page.getByRole('button', { name: 'Next', exact: true }).click();
  const result = page.getByRole('region', { name: 'Dub complete', exact: true });
  await result.getByRole('button', { name: 'Previous line', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Line 3:/ })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: /^Line 1:/ }).click();
  await expect(take).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await take.click();
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
});
