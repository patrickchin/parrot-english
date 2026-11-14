import { test, expect, routeContent } from './fixtures';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { routeShortScene } from './short-scene';
import type { Scene } from '../../src/scene';

const shareId = 'shr_abcdefghijklmnopqrstuvwx';
const creatorToken = 'cap_abcdefghijklmnopqrstuvwx';
const storage = 'https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com';
test.use({ sampleScene: true });

test.beforeEach(async ({ page }) => {
  const scene: Scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
  delete scene.backing;
  scene.duration = 3.2;
  scene.lines = scene.lines.slice(0, 3).map((line, index) => ({ ...line, start: 0.2 + index, end: 1.2 + index, words: undefined }));
  await page.route('**/scenes/patrick/scene.json', route => route.fulfill({ json: scene }));
  await routeShortScene(page);
  await page.addInitScript(() => {
    // Some browser debugging protocols omit Blob request bodies. Observe the
    // original Blob passed to native fetch, leaving bytes and transport intact.
    const bodies = new Map<string, Promise<number[]>>();
    Object.assign(window, { guestUploadBodies: bodies });
    const fetch = window.fetch;
    window.fetch = function (input, init) {
      if (init?.body instanceof Blob) {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
        bodies.set(url.pathname, init.body.arrayBuffer().then(bytes => [...new Uint8Array(bytes)]));
      }
      return fetch.call(this, input, init);
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 660;
      const output = context.createMediaStreamDestination(); oscillator.connect(output); oscillator.start();
      for (const track of output.stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stop(); oscillator.stop(); void context.close(); }; }
      return output.stream;
    } } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data: ShareData) => data.files?.every(file => file.type === 'video/mp4') });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files![0];
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
      Object.assign(window, { nativeSharedFile: { name: file.name, size: file.size, type: file.type, hash } });
    } });
  });
});

async function prepareVideo(page: import('@playwright/test').Page, language: 'en' | 'zh' = 'en') {
  const labels = language === 'en' ? { start: 'Start dubbing', record: 'Record', recording: 'My recording', next: 'Next', result: 'Your dub is ready!', prepare: 'Prepare to share', file: 'Share video file' } : { start: '开始配音', record: '开始录音', recording: '听我的录音', next: '下一步', result: '你的配音，完成啦！', prepare: '准备分享', file: '分享视频文件' };
  await page.goto(`/${language}/scenes/patrick`);
  await page.getByRole('button', { name: labels.start, exact: true }).click();
  await page.getByRole('button', { name: labels.record, exact: true }).click();
  await expect(page.getByRole('button', { name: labels.recording, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: labels.next, exact: true }).click();
  await page.getByRole('button', { name: labels.next, exact: true }).click();
  await expect(page.getByRole('heading', { name: labels.result, exact: true })).toBeVisible();
  await page.getByRole('button', { name: labels.prepare, exact: true }).click();
  await expect(page.getByRole('button', { name: labels.file, exact: true })).toBeVisible({ timeout: 15000 });
}

test('a cached video shares as a native file or a consented expiring link with device removal', async ({ page, context, browser }, info) => {
  let creates = 0, puts = 0, publishes = 0, removed = false, failPublication = true;
  let bytes: Buffer | undefined;
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const summary = { id: shareId, title: 'My shared dub', expiresAt, credits: { title: 'Sintel', source: 'https://www.sintel.org/', attribution: 'Blender Foundation' } };
  const api = async (route: import('@playwright/test').Route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/shares')) {
      creates++;
      expect(request.headers().authorization).toBeUndefined();
      const details = request.postDataJSON();
      expect(details.credits.source).toMatch(/^https:/);
      return route.fulfill({ status: 201, json: { ...summary, creatorToken, upload: { size: details.size,
        url: `${storage}/guest-shares/uploads/${shareId}/video.mp4?signature=test`, headers: { 'Content-Type': 'video/mp4', 'x-oss-object-acl': 'private' } } } });
    }
    if (path.endsWith('/publish')) {
      publishes++;
      expect(request.headers().authorization).toBe(`Bearer ${creatorToken}`);
      expect(bytes).toBeDefined();
      if (failPublication) { failPublication = false; return route.fulfill({ status: 503, json: { error: 'Temporary publication failure' } }); }
      return route.fulfill({ json: summary });
    }
    if (request.method() === 'DELETE') {
      expect(request.headers().authorization).toBe(`Bearer ${creatorToken}`);
      removed = true; return route.fulfill({ status: 204 });
    }
    expect(request.headers().authorization).toBeUndefined();
    return route.fulfill(removed ? { status: 410, json: { error: 'Removed' } } : { json: { ...summary, url: `${storage}/guest-shares/published/${shareId}/video.mp4?signature=playback` } });
  };
  const configuration = (route: import('@playwright/test').Route) => route.fulfill({ json: { apiBase: '/api/share' } });
  const media = (route: import('@playwright/test').Route) => route.fulfill({ body: bytes!, contentType: 'video/mp4', headers: { 'Access-Control-Allow-Origin': '*' } });
  await context.route('**/api/share-config', configuration);
  await context.route('**/api/share/shares**', api);
  await context.route('**/guest-shares/published/**', media);
  await context.route('**/guest-shares/uploads/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type,x-oss-object-acl' } });
    puts++; expect(request.method()).toBe('PUT');
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers()['x-oss-object-acl']).toBe('private');
    bytes = request.postDataBuffer() ?? Buffer.from(await page.evaluate(async path => {
      const sent = (window as unknown as { guestUploadBodies: Map<string, Promise<number[]>> }).guestUploadBodies;
      const bytes = await sent.get(path);
      if (!bytes) throw new Error('Native fetch did not receive the exported video.');
      return bytes;
    }, new URL(request.url()).pathname));
    expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await prepareVideo(page);
  expect(creates).toBe(0); expect(puts).toBe(0);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Share video file', exact: true })).toBeVisible();
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `guest-share-controls-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Share video file', exact: true }).click();
  await expect(page.getByText('Video sent to the share menu.', { exact: true })).toBeVisible();
  expect(creates).toBe(0);
  const native = await page.evaluate(() => (window as unknown as { nativeSharedFile: { hash: string; size: number; type: string } }).nativeSharedFile);
  expect(native.size).toBeGreaterThan(16); expect(native.type).toBe('video/mp4');
  await page.getByRole('button', { name: 'Create playback link', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Anyone with the unlisted link can watch it for 7 days.');
  expect(creates).toBe(0);
  await dialog.getByRole('button', { name: 'Upload and create link', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The playback link could not be confirmed.');
  await dialog.getByRole('button', { name: 'Retry sharing', exact: true }).click();
  await expect(dialog.getByLabel('Playback link', { exact: true })).toHaveValue(new RegExp(`/en/s/${shareId}$`));
  expect(creates).toBe(1); expect(puts).toBe(1); expect(publishes).toBe(2);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(dialog.getByLabel('Playback link', { exact: true })).toBeVisible();
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `guest-share-link-${width}.png`), fullPage: true });
    }
  }
  expect(createHash('sha256').update(bytes!).digest('hex')).toBe(native.hash);
  const link = await dialog.getByLabel('Playback link', { exact: true }).inputValue();
  expect(link).not.toContain(creatorToken);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(creatorToken);
  await page.goto(link);
  await expect(page.getByRole('button', { name: 'Remove shared video', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove shared video', exact: true })).toBeVisible();
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await routeContent(friend);
  await friend.route('**/api/share-config', configuration); await friend.route('**/api/share/shares**', api); await friend.route('**/guest-shares/published/**', media);
  await friend.goto(link);
  await expect(friend.getByRole('heading', { name: summary.title, exact: true })).toBeVisible();
  await expect(friend.getByRole('button', { name: 'Remove shared video', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove shared video', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove shared video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('This shared video was removed.');
  await friend.reload();
  await expect(friend.getByRole('status')).toHaveText('This video is unavailable, expired, or has been removed.');
  await friendContext.close();
});

test('Chinese playback links use the localized zh route prefix', async ({ page }) => {
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await page.route('**/api/share-config', route => route.fulfill({ json: { apiBase: '/api/share' } }));
  await page.route('**/api/share/shares**', route => {
    if (route.request().url().endsWith('/publish')) return route.fulfill({ json: { id: shareId, title: '分享的配音', expiresAt } });
    return route.fulfill({ status: 201, json: { id: shareId, title: '分享的配音', expiresAt, creatorToken, upload: {
      url: `${storage}/guest-shares/uploads/${shareId}/video.mp4?signature=test`, size: route.request().postDataJSON().size,
      headers: { 'Content-Type': 'video/mp4', 'x-oss-object-acl': 'private' },
    } } });
  });
  await page.route('**/guest-shares/uploads/**', route => route.fulfill({ status: route.request().method() === 'OPTIONS' ? 204 : 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type,x-oss-object-acl' } }));
  await prepareVideo(page, 'zh');
  await page.getByRole('button', { name: '创建播放链接', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '上传并创建链接', exact: true }).click();
  await expect(page.getByLabel('播放链接', { exact: true })).toHaveValue(new RegExp(`/zh/s/${shareId}$`));
});
