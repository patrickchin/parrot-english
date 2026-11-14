import { test, expect, catalogUrl } from './fixtures';
import { readFile } from 'node:fs/promises';

const id = 'shr_ABCDEFGHIJKLMNOPQRSTUVWX';
const token = 'cap_ABCDEFGHIJKLMNOPQRSTUVWX';
const path = `/en/s/${id}`;
const videoUrl = new URL(`/guest-shares/published/${id}/video.mp4?signature=test`, catalogUrl).href;

test('an account-free playback link works independently of the content catalogue and only its creator can remove it', async ({ page }) => {
  let removed = false;
  await page.route(catalogUrl, route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/share-config', route => route.fulfill({ json: { apiBase: '/api/guest' } }));
  await page.route('**/api/guest/shares/' + id, route => {
    if (route.request().method() === 'DELETE') {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      removed = true;
      return route.fulfill({ status: 204 });
    }
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({ status: removed ? 410 : 200, json: removed ? {} : { id, title: 'Patrick’s dub', url: videoUrl,
      expiresAt: new Date(Date.now() + 86400000).toISOString(), credits: { title: 'Original clip', source: 'https://example.com/original', attribution: 'Original performers' } } });
  });
  await page.route(videoUrl, async route => route.fulfill({ body: await readFile('content/media/sintel/search-v1.mp4'), contentType: 'video/mp4', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Patrick’s dub', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove shared video', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Original source: Original clip', exact: true })).toHaveAttribute('href', 'https://example.com/original');
  await expect.poll(() => page.getByLabel('Patrick’s dub', { exact: true }).evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  await page.evaluate(({ id, token }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('parrotbook-share-capabilities', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('capabilities');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction('capabilities', 'readwrite'); tx.objectStore('capabilities').put(token, id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), { id, token });
  await page.reload();
  await page.getByRole('button', { name: 'Remove shared video', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The playback link will stop working.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Remove shared video', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove shared video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('This shared video was removed.');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('This video is unavailable, expired, or has been removed.');
  await expect(page.getByRole('button', { name: 'Remove shared video', exact: true })).toHaveCount(0);
});

for (const failure of ['expired', 'pending', 'unconfigured', 'foreign-media']) test(`shared video ${failure} shows a useful recovery state`, async ({ page }) => {
  await page.route('**/api/share-config', route => route.fulfill({ status: failure === 'unconfigured' ? 503 : 200, json: { apiBase: '/api/guest' } }));
  await page.route('**/api/guest/shares/' + id, route => route.fulfill({ status: failure === 'expired' ? 410 : failure === 'pending' ? 404 : 200,
    json: { id, title: 'Wrong media', expiresAt: new Date(Date.now() + 86400000).toISOString(), url: 'https://example.com/private.mp4' } }));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Shared dub', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('This video is unavailable, expired, or has been removed.');
  await expect(page.getByRole('button', { name: 'Reload video', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try a scene', exact: true })).toHaveAttribute('href', '/en/packs');
  await expect(page.locator('video')).toHaveCount(0);
});
