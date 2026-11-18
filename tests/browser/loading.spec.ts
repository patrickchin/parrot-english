import { test, expect, catalogUrl } from './fixtures';
import { clips, packs } from '../content-fixtures';

for (const gallery of ['packs', 'scenes'] as const) test(`${gallery} waits to download distant posters until they approach the viewport`, async ({ page }) => {
  const images = new Set<string>();
  page.on('request', request => { if (request.resourceType() === 'image') images.add(request.url()); });
  await page.goto(gallery === 'packs' ? '/en/packs' : '/en/library/all');
  const cards = gallery === 'packs'
    ? page.getByRole('navigation', { name: 'Collections', exact: true }).getByRole('link')
    : page.getByRole('button', { name: /^Choose scene:/ });
  await expect(cards).toHaveCount(gallery === 'packs' ? packs.length : clips.length);
  await expect.poll(() => cards.first().locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Close enough for native lazy loading to fetch, beyond our viewport margin.
  const index = await cards.evaluateAll(elements => elements.findIndex(element => {
    const top = element.getBoundingClientRect().top;
    return top > innerHeight + 120 && top < innerHeight + 1000;
  }));
  expect(index).toBeGreaterThan(1);
  const card = cards.nth(index);
  const clip = gallery === 'packs' ? packs[index].data.scenes[0] : clips[index];
  const pack = gallery === 'packs' ? packs[index] : packs.find(pack => pack.entry.id === clip.packId)!;
  const poster = new URL(clip.poster, new URL(pack.entry.manifest, catalogUrl)).href;
  await expect(card).not.toBeInViewport();
  expect(images.has(poster)).toBe(false);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect.poll(() => images.has(poster)).toBe(true);
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('packs keeps loaded posters when clearing a filter moves them offscreen', async ({ page }) => {
  const pack = packs.at(-1)!;
  const poster = new URL(pack.data.scenes[0].poster, new URL(pack.entry.manifest, catalogUrl)).href;
  await page.goto('/en/packs');
  const search = page.getByRole('searchbox', { name: 'Find a collection', exact: true });
  await search.fill(pack.data.title);
  const card = page.getByRole('navigation', { name: 'Collections', exact: true }).getByRole('link', { name: pack.data.title, exact: true });
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await search.fill('');
  await expect(card).not.toBeInViewport();
  await expect(card.locator('img')).toHaveAttribute('src', poster);
});
