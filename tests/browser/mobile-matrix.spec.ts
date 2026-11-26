import { test, expect, homeShelves, homeShows, showCard, homeLink, showsShelf, tagChip } from './fixtures';
import { prepareMediaTest } from './media-fixture';
import { mobileScreenshot, mobileViewports, touchControl } from './mobile-viewports';

test.use({ sampleScene: true });

test('phone and tablet layouts keep software notices and source hashes readable', async ({ page }, info) => {
  const response = await page.goto('/software-notices.html');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Software notices');
  const sourceHash = page.getByText('60a2818f76dcd1fee3155b1791304af104a0fc1b', { exact: true });
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await sourceHash.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await sourceHash.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].every(box => box.left >= 0 && box.right <= innerWidth);
    }), 'Every line of the complete source hash fits the viewport').toBe(true);
    if (viewport.name === 'phone-portrait') await mobileScreenshot(page, info, 'software-notices', viewport.name);
  }
  await page.getByText('Full Mozilla Public License 2.0', { exact: true }).click();
  await page.getByText('Full GNU Lesser General Public License 2.1', { exact: true }).click();
  await expect(page.locator('pre')).toHaveCount(2);
  for (const licence of await page.locator('pre').all()) await expect(licence).toBeVisible();
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('phone and tablet layouts retain browse shelves, practice controls and completion through rotation', async ({ page, browser }, info) => {
  console.log(`Mobile QA engine: ${info.project.name} ${browser.version()}`);
  const lines = await prepareMediaTest(page);
  await page.goto('/en/packs');
  const cards = page.getByRole('main').getByRole('listitem');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(homeShelves.length);
  // Full-page screenshots do not themselves load offscreen lazy covers.
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    const cover = card.locator('img');
    await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await cover.evaluate((image: HTMLImageElement) => image.decode());
  }
  const shows = showsShelf(page).getByRole('link');
  await expect(shows).toHaveCount(homeShows.length);
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { level: 1, name: 'Pick a scene to dub', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await touchControl(page, page.getByRole('searchbox', { name: 'Find a show or scene', exact: true }));
    await touchControl(page, tagChip(page, 'starter'));
    const columns = viewport.width >= 1024 ? 4 : viewport.width >= 640 ? 3 : 2;
    const boxes = await Promise.all(Array.from({ length: columns + 1 }, (_, index) => shows.nth(index).boundingBox()));
    const first = boxes[0]!;
    for (let index = 1; index < columns; index++) {
      const card = boxes[index]!, previous = boxes[index - 1]!;
      expect(Math.abs(card.y - first.y)).toBeLessThan(1);
      expect(card.x).toBeGreaterThan(previous.x + previous.width);
      expect(card.width).toBeCloseTo(first.width, 0);
    }
    const nextRow = boxes[columns]!;
    expect(nextRow.x).toBeCloseTo(first.x, 0);
    expect(nextRow.y).toBeGreaterThan(first.y + first.height);
    await page.evaluate(() => scrollTo(0, 0));
    await mobileScreenshot(page, info, 'collections', viewport.name);
  }
  await showCard(showsShelf(page), 'Friends').tap();
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { level: 1, name: 'Friends', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await touchControl(page, homeLink(page));
  }
  await homeLink(page).tap();
  await page.getByRole('searchbox', { name: 'Find a show or scene', exact: true }).fill('SpongeBob');
  const showResults = page.getByRole('region', { name: 'Shows', exact: true });
  await expect(showResults.getByRole('link')).toHaveCount(1);
  await showCard(showResults, 'SpongeBob SquarePants').tap();
  await page.getByRole('button', { name: 'Choose scene: Who are you looking for?', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).tap();
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const waveformStatus = page.getByRole('region', { name: 'Voice waveform comparison', exact: true }).getByRole('status');
    await expect(waveformStatus).toHaveText('The original waveform is unavailable. You can still listen and record.');
    expect(await waveformStatus.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const text = [...range.getClientRects()];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
        if (['hidden', 'clip'].includes(style.overflowY) && text.some(rect => rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) return false;
        if (['hidden', 'clip'].includes(style.overflowX) && text.some(rect => rect.left < box.left - 1 || rect.right > box.right + 1)) return false;
      }
      return true;
    }), 'The complete waveform recovery message must remain readable').toBe(true);
    for (const name of ['Record', 'Listen to the original line', 'Next', 'Back to scenes', 'How to dub']) {
      const control = page.getByRole('button', { name, exact: true });
      await touchControl(page, control); await control.click({ trial: true });
    }
    await expect(page.getByText('Thank you.', { exact: true })).toBeVisible();
    await touchControl(page, page.getByRole('button', { name: 'Record', exact: true }));
    await mobileScreenshot(page, info, 'practice', viewport.name);
  }
  for (const _ of lines) await page.getByRole('button', { name: 'Next', exact: true }).tap();
  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { level: 1, name: 'Your dub is ready!', exact: true })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Prepare to share', 'Download video', 'Back to scenes']) await touchControl(page, page.getByRole('button', { name, exact: true }));
    await touchControl(page, page.getByRole('button', { name: 'Prepare to share', exact: true }));
    await mobileScreenshot(page, info, 'result', viewport.name);
  }
});
