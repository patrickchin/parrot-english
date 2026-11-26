import { test, expect, catalogUrl, homeShelves } from './fixtures';
import { clips, packs } from '../content-fixtures';

// Home previews up to four items per shelf, in shelf order.
const homeItems = homeShelves.flatMap(shelf => shelf.kind === 'section'
  ? shelf.shows.slice(0, 4).map(show => packs.find(pack => pack.entry.id === show.id)!.data.scenes[0] as typeof clips[number])
  : shelf.scenes.slice(0, 4) as unknown as typeof clips);

for (const gallery of ['packs', 'scenes'] as const) test(`${gallery} waits to download distant posters until they approach the viewport`, async ({ page }) => {
  const images = new Set<string>();
  page.on('request', request => { if (request.resourceType() === 'image') images.add(request.url()); });
  await page.goto(gallery === 'packs' ? '/en/packs' : '/en/library/all');
  const cards = gallery === 'packs'
    ? page.getByRole('main').getByRole('listitem')
    : page.getByRole('button', { name: /^Choose scene:/ });
  await expect(cards).toHaveCount(gallery === 'packs' ? homeItems.length : clips.length);
  await expect.poll(() => cards.first().locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // Close enough for native lazy loading to fetch, beyond our viewport margin.
  const index = await cards.evaluateAll(elements => elements.findIndex(element => {
    const top = element.getBoundingClientRect().top;
    return top > innerHeight + 120 && top < innerHeight + 1000;
  }));
  expect(index).toBeGreaterThan(1);
  const card = cards.nth(index);
  const clip = gallery === 'packs' ? homeItems[index] : clips[index];
  const pack = packs.find(pack => pack.data.scenes.some((scene: { slug: string }) => scene.slug === clip.slug))!;
  const poster = new URL(clip.poster, new URL(pack.entry.manifest, catalogUrl)).href;
  await expect(card).not.toBeInViewport();
  expect(images.has(poster)).toBe(false);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect.poll(() => images.has(poster)).toBe(true);
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('scene lists keep loaded posters when clearing a filter moves them offscreen', async ({ page }) => {
  const clip = clips.at(-1)!;
  const pack = packs.find(pack => pack.entry.id === clip.packId)!;
  const poster = new URL(clip.poster, new URL(pack.entry.manifest, catalogUrl)).href;
  await page.goto('/en/library/all');
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  await search.fill(clip.english);
  const card = page.getByRole('button', { name: `Choose scene: ${clip.english}`, exact: true });
  await expect.poll(() => card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await search.fill('');
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(clips.length);
  await expect(card).not.toBeInViewport();
  await expect(card.locator('img')).toHaveAttribute('src', poster);
});
