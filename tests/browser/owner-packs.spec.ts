import { test, expect, catalogUrl, headerDestination, homeShelves, shelfTitle, showCard, homeLink } from './fixtures';
import type { Page } from '@playwright/test';
import { publishedCatalog, packs, clips, readScene, sceneFile } from '../content-fixtures';
import type { Pack } from '../../src/content-pack';
import type { Scene } from '../../src/scene';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { mobileViewports, mobileScreenshot, touchControl } from './mobile-viewports';

const ownerKey = 'test-only-owner-access-key';
const uploadId = 'upl_ownerBrowserTest';
const patrickManifest: Omit<Scene, 'base'> = readScene('patrick');
const patrickClip = clips.find(clip => clip.slug === 'patrick')!;
const patrickPack: Pack = packs.find(pack => pack.entry.id === patrickClip.packId)!.data;
const patrickEnglish = patrickPack.locales?.en;
const patrickScene = {
  ...patrickManifest,
  title: patrickEnglish?.scenes[patrickManifest.id].title ?? patrickManifest.title,
  roles: patrickManifest.roles.map(role => ({ ...role, name: patrickEnglish?.roles[role.id].name ?? role.name })),
};
let directory: string, packFolder: string, pack: Pack, scene: ReturnType<typeof readScene>, bodies: Map<string, Buffer>;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parrotbook-owner-browser-'));
  packFolder = join(directory, 'weekend-pack');
  const original = patrickClip;
  const source = patrickPack;
  scene = structuredClone(patrickManifest);
  scene.id = 'scene_ownerBrowserTest';
  const roleIds = new Map<string, string>();
  scene.roles = scene.roles.map((role: { id: string }, index: number) => {
    const id = `role_ownerBrowserTest_${index}`; roleIds.set(role.id, id); return { ...role, id };
  });
  scene.lines = scene.lines.map((line: { roleId: string }, index: number) => ({ ...line, id: `line_ownerBrowserTest_${index}`, roleId: roleIds.get(line.roleId)! }));
  const locales = Object.fromEntries(Object.entries(source.locales ?? {}).map(([language, locale]) => {
    return [language, { scenes: { [scene.id]: { title: 'Weekend Patrick', licence: locale.scenes[original.id].licence, changes: locale.scenes[original.id].changes } },
      roles: Object.fromEntries([...roleIds].map(([oldId, id]) => [id, locale.roles[oldId]])) }];
  }));
  pack = { version: 1, id: 'pack_ownerBrowserTest', title: 'Weekend Patrick', description: 'An owner-published selection.', author: 'Mary',
    scenes: [{ ...original, id: scene.id, slug: 'owner-weekend-patrick', routeSlug: 'owner-weekend-patrick', title: 'Weekend Patrick', english: 'Weekend Patrick', manifest: 'scenes/patrick/scene.json' }], locales };
  bodies = new Map([
    ['pack.json', Buffer.from(JSON.stringify(pack))],
    ['scenes/patrick/scene.json', Buffer.from(JSON.stringify(scene))],
    [`scenes/patrick/${scene.waveform}`, await readFile(sceneFile('patrick', scene.waveform))],
  ]);
  for (const [path, body] of bodies) {
    await mkdir(join(packFolder, path, '..'), { recursive: true });
    await writeFile(join(packFolder, path), body);
  }
});
test.afterAll(() => rm(directory, { recursive: true, force: true }));

async function ownerService(page: Page, options: { failFile?: boolean; failPublication?: boolean } = {}) {
  await page.addInitScript(() => {
    // Browser debugging protocols omit disk-backed File bodies. Observe the
    // actual File passed to native XHR without changing its bytes or transport.
    const sent = new Map<string, Promise<number[]>>();
    Object.assign(window, { ownerFileUploads: sent });
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      if (body instanceof File && body.webkitRelativePath) {
        const path = body.webkitRelativePath.split('/').slice(1).join('/');
        sent.set(path, body.arrayBuffer().then(bytes => [...new Uint8Array(bytes)]));
      }
      return send.call(this, body);
    };
  });
  const current: typeof publishedCatalog & { featuredSceneId?: string } = structuredClone(publishedCatalog);
  const packData = { ...current.packData, [pack.id]: pack };
  const uploaded = new Map<string, Buffer>();
  const managed = packs.map(({ entry, data }: { entry: typeof packs[number]['entry']; data: Pack }) => ({
    id: entry.id, title: data.title, uploader: 'Patrick', manifest: new URL(entry.manifest, catalogUrl).href,
    sceneCount: data.scenes.length, visible: true, scenes: data.scenes.map(({ id, title }) => ({ id, title })),
  }));
  const syncCatalog = () => {
    current.packs = managed.filter(item => item.visible).map(item => ({ id: item.id, manifest: new URL(item.manifest).pathname.replace('/content/', ''), uploader: item.uploader }));
    current.packData = Object.fromEntries(current.packs.map(item => [item.id, packData[item.id]]));
    if (!managed.some(item => item.visible && item.scenes.some(scene => scene.id === current.featuredSceneId))) delete current.featuredSceneId;
  };
  const state = { starts: 0, refreshes: 0, puts: 0, publishes: 0, published: false };
  let fileFailed = false, publishFailed = false;
  let descriptors: { path: string; size: number; type: string }[] = [];
  await page.route('**/api/owner-config', route => route.fulfill({ json: { apiBase: '/api/owner' } }));
  await page.route(catalogUrl, route => route.fulfill({ json: current }));
  const plan = () => ({ id: uploadId, uploads: descriptors.map(file => ({ path: file.path,
    url: new URL(`uploads/${uploadId}/files/${file.path}?signature=test`, catalogUrl).href,
    headers: { 'Content-Type': file.type, 'x-oss-object-acl': 'private' } })) });
  await page.route('**/api/owner/**', async route => {
    const request = route.request();
    if (request.headers().authorization !== `Bearer ${ownerKey}`) return route.fulfill({ status: 401, json: { message: 'Owner access is required.' } });
    expect(request.url()).not.toContain(ownerKey);
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({ json: { ok: true } });
    if (path === '/api/owner/packs') return route.fulfill({ json: { packs: managed.map(item => ({ ...item, scenes: item.visible ? item.scenes : [] })), featuredSceneId: current.featuredSceneId ?? null } });
    if (path === '/api/owner/catalog/featured-scene') {
      expect(request.method()).toBe('PATCH');
      const { sceneId } = request.postDataJSON();
      if (sceneId !== null && !managed.some(item => item.visible && item.scenes.some(scene => scene.id === sceneId))) return route.fulfill({ status: 404 });
      current.featuredSceneId = sceneId ?? undefined;
      return route.fulfill({ json: { featuredSceneId: sceneId } });
    }
    if (path.startsWith('/api/owner/packs/')) {
      const id = path.split('/').at(-1)!;
      const index = managed.findIndex(item => item.id === id);
      if (request.method() === 'PATCH') managed[index].visible = request.postDataJSON().visible;
      else if (request.method() === 'DELETE') managed.splice(index, 1);
      else throw new Error('Unexpected management request');
      syncCatalog();
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/owner/uploads') {
      state.starts++; descriptors = request.postDataJSON().files;
      expect(descriptors.map(file => file.path).sort()).toEqual([...bodies.keys()].sort());
      return route.fulfill({ json: plan() });
    }
    if (path.endsWith('/publish')) {
      state.publishes++;
      expect(uploaded.size).toBe(bodies.size);
      if (options.failPublication && !publishFailed) { publishFailed = true; return route.fulfill({ status: 503, json: { message: 'Please retry this upload.' } }); }
      const manifest = `packs/${pack.id}/pack.json`;
      if (!state.published) managed.push({ id: pack.id, title: pack.title, uploader: 'Patrick', manifest: new URL(manifest, catalogUrl).href, sceneCount: 1, visible: true, scenes: [{ id: scene.id, title: pack.title }] });
      syncCatalog();
      state.published = true;
      return route.fulfill({ json: { id: pack.id, title: pack.title, franchise: pack.franchise, manifest: new URL(manifest, catalogUrl).href, sceneCount: 1 } });
    }
    state.refreshes++; return route.fulfill({ json: plan() });
  });
  await page.route(`**/content/uploads/${uploadId}/**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type,x-oss-object-acl' } });
    expect(request.method()).toBe('PUT');
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers()['x-oss-object-acl']).toBe('private');
    const path = new URL(request.url()).pathname.split(`/uploads/${uploadId}/files/`)[1];
    state.puts++;
    if (options.failFile && path === 'scenes/patrick/scene.json' && !fileFailed) { fileFailed = true; return route.fulfill({ status: 503 }); }
    const bytes = request.postDataBuffer() ?? Buffer.from(await page.evaluate(async path => {
      const sent = (window as unknown as { ownerFileUploads: Map<string, Promise<number[]>> }).ownerFileUploads;
      const bytes = await sent.get(path);
      if (!bytes) throw new Error('Native XHR did not receive the selected file.');
      return bytes;
    }, path));
    expect(bytes).toEqual(bodies.get(path));
    uploaded.set(path, bytes);
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route(new URL(`packs/${pack.id}/scenes/patrick/scene.json`, catalogUrl).href, route => route.fulfill({ json: scene }));
  await page.route(new URL(`packs/${pack.id}/scenes/patrick/${scene.waveform}`, catalogUrl).href, route => route.fulfill({ body: bodies.get(`scenes/patrick/${scene.waveform}`), contentType: 'application/json' }));
  return state;
}

async function unlock(page: Page) {
  await page.goto('/en/owner/packs');
  await page.getByLabel('Owner access key', { exact: true }).fill(ownerKey);
  await page.getByRole('button', { name: 'Unlock uploads', exact: true }).click();
  await expect(page.getByLabel('Choose collection folder', { exact: true })).toBeVisible();
}

test('owner access protects folder uploads and never persists the access key', async ({ page }) => {
  const state = await ownerService(page);
  await page.goto('/en/owner/packs');
  await expect(page.getByRole('heading', { level: 1, name: 'Manage collections', exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose collection folder', { exact: true })).toHaveCount(0);
  await page.getByLabel('Owner access key', { exact: true }).fill('wrong-test-key');
  await page.getByRole('button', { name: 'Unlock uploads', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The access key was not accepted.');
  expect(state.starts).toBe(0);
  await page.getByLabel('Owner access key', { exact: true }).fill(ownerKey);
  await page.getByRole('button', { name: 'Unlock uploads', exact: true }).click();
  await expect(page.getByLabel('Choose collection folder', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain(ownerKey);
  await page.reload();
  await expect(page.getByLabel('Owner access key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Choose collection folder', { exact: true })).toHaveCount(0);
});

test('the owner can trim Patrick’s existing subtitles and reopen the saved timings', async ({ page }) => {
  await ownerService(page);
  await unlock(page);
  const studio = await importPatrick(page);
  const timeline = studio.getByRole('region', { name: 'Timeline', exact: true });
  const details = studio.getByRole('complementary', { name: 'Selection details', exact: true });
  const firstCaption = patrickScene.lines[0];
  const cue = timeline.getByRole('button', { name: firstCaption.text, exact: true }).first();
  await expect(cue).toHaveAttribute('aria-pressed', 'true');
  await studio.getByLabel('Scene title', { exact: true }).fill('Patrick timing draft');
  const start = details.getByLabel('Record from (seconds)', { exact: true });
  await expect(start).toHaveValue(String(firstCaption.start));
  const handle = timeline.getByRole('button', { name: 'Trim recording start', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 16, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await start.inputValue())).toBeLessThan(firstCaption.start);
  const trimmedStart = await start.inputValue();

  const end = details.getByLabel('Record until (seconds)', { exact: true });
  await expect(details.getByRole('button', { name: 'Move End (s) later by 0.1 seconds' })).toBeDisabled();
  await details.getByRole('button', { name: 'Move End (s) earlier by 0.1 seconds' }).click();
  await expect(end).toHaveValue('4.85');
  await end.fill('4.8');
  await end.press('Enter');
  await expect(end).toHaveValue('4.8');
  await studio.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(studio.getByRole('status').filter({ hasText: 'Draft saved in this browser.' })).toBeVisible();

  await unlock(page);
  await studio.getByLabel('Draft actions', { exact: true }).click();
  await studio.getByLabel('Saved drafts', { exact: true }).selectOption({ label: 'Patrick timing draft' });
  await expect(cue).toHaveAttribute('aria-pressed', 'true');
  await expect(start).toHaveValue(trimmedStart);
  await expect(end).toHaveValue('4.8');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

async function importPatrick(page: Page) {
  await page.getByLabel('Import scene JSON', { exact: true }).setInputFiles({
    name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(patrickScene)),
  });
  const studio = page.getByRole('region', { name: 'Scene studio', exact: true });
  await expect(studio.getByLabel('Scene title', { exact: true })).toHaveValue(patrickScene.title);
  return studio;
}

test('the owner can preview Patrick’s recording windows and preserve manifest fields on export', async ({ page }, info) => {
  await ownerService(page);
  await unlock(page);
  const studio = await importPatrick(page);
  const preview = studio.getByLabel('Preview', { exact: true }).and(studio.locator('video'));
  await expect(preview).toHaveAttribute('src', patrickScene.mediaBase + patrickScene.video);
  const play = studio.getByRole('button', { name: 'Play recording window' });
  await expect(play).toBeEnabled();
  const details = studio.getByRole('complementary', { name: 'Selection details' });
  const subtitle = details.getByRole('textbox', { name: 'Subtitle', exact: true });
  const [first, second] = patrickScene.lines;
  await expect(subtitle).toHaveValue(first.text);
  const pause = studio.getByRole('button', { name: 'Pause playback', exact: true });
  const playhead = studio.getByRole('slider', { name: 'Timeline playhead' });
  const mediaTime = () => preview.evaluate(node => (node as HTMLVideoElement).currentTime);
  const ruler = (await playhead.boundingBox())!;
  await playhead.click({ position: { x: ruler.width * (first.start + 0.5) / patrickScene.duration, y: 6 } });
  await expect.poll(mediaTime).toBeGreaterThan(first.start + 0.25);
  expect(await mediaTime()).toBeLessThan(first.end);
  await preview.evaluate(node => {
    const video = node as HTMLVideoElement;
    video.addEventListener('playing', () => { video.dataset.previewStart = String(video.currentTime); }, { once: true });
  });
  await play.click();
  await expect(pause).toBeVisible();
  await expect.poll(async () => Math.abs(Number(await preview.getAttribute('data-preview-start')) - first.start)).toBeLessThan(0.15);
  await expect(play).toBeVisible();
  await expect.poll(mediaTime).toBeCloseTo(first.end, 2);
  await studio.getByRole('button', { name: second.text, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(subtitle).toHaveValue(second.text);
  if (info.project.name === 'chromium') {
    const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(folder, { recursive: true });
    for (const [name, width] of [['desktop', 1440], ['tablet', 768], ['phone', 390]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await studio.screenshot({ path: join(folder, 'scene-studio-timeline-' + name + '.png') });
    }
  }
  await details.getByRole('button', { name: 'Move End (s) later by 0.1 seconds' }).click();
  await play.click();
  await expect(pause).toBeVisible();
  await expect(play).toBeVisible();
  await expect.poll(mediaTime).toBeCloseTo(7.9, 2);
  await subtitle.fill('No, this is Patrick!');
  await studio.getByLabel('Draft actions', { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), studio.getByRole('button', { name: 'Export draft JSON', exact: true }).click()]);
  const output = JSON.parse(await readFile(await download.path()!, 'utf8'));
  expect(output.scene.id).toBe(patrickScene.id);
  expect(output.scene.credit).toEqual(patrickScene.credit);
  const expectedLines = patrickScene.lines.map((line, index) => {
    if (index !== 1) return line;
    const { words: _words, ...cue } = line;
    return { ...cue, end: 7.9, text: 'No, this is Patrick!' };
  });
  expect(output.scene.lines).toEqual(expectedLines);
  expect(output.scene.roles[0].portrait).toBe(patrickScene.roles[0].portrait);
  await studio.getByLabel('Draft actions', { exact: true }).click();
  await studio.getByRole('button', { name: 'Source clip', exact: true }).click();
  await expect(studio.getByLabel('YouTube URL', { exact: true })).toHaveValue(patrickScene.credit.source);
});

test('the timeline seeks a YouTube source relative to the clip start', async ({ page }) => {
  await ownerService(page);
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.YT = { Player: class {
        constructor(target, options) {
          this.time = options.playerVars.start;
          this.state = 5;
          this.events = options.events;
          target.dataset.videoId = options.videoId;
          queueMicrotask(() => this.events.onReady());
        }
        getCurrentTime() { return this.time; }
        getPlayerState() { return this.state; }
        pauseVideo() { this.state = 2; this.events.onStateChange({ data: 2 }); }
        seekTo(time) { this.time = time; window.lastYoutubeSeek = time; }
        destroy() {}
      }};
      window.onYouTubeIframeAPIReady();
    `,
  }));
  await unlock(page);
  const studio = page.getByRole('region', { name: 'Scene studio', exact: true });
  await studio.getByLabel('Clip starts at (seconds)', { exact: true }).fill('17');
  await studio.getByLabel('Clip ends at (seconds)', { exact: true }).fill('23.2');
  await studio.getByLabel('YouTube URL', { exact: true }).fill(patrickScene.credit.source);
  await expect(studio.getByRole('button', { name: 'Play clip' })).toBeEnabled();
  const ruler = studio.getByRole('slider', { name: 'Timeline playhead' });
  await ruler.press('Home');
  await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuetext', '00:00.10');
  expect(await page.evaluate(() => (window as unknown as { lastYoutubeSeek: number }).lastYoutubeSeek)).toBe(17.1);
});

test('an owner publishes a native folder without franchise metadata and its pack becomes searchable without rebuilding', async ({ page }, info) => {
  const state = await ownerService(page);
  await unlock(page);
  await page.getByLabel('Choose collection folder', { exact: true }).setInputFiles(packFolder);
  await expect(page.getByRole('heading', { level: 3, name: pack.title, exact: true })).toBeVisible();
  const viewports = info.project.name.startsWith('mobile-qa-') ? mobileViewports : [320, 390, 768, 1440].map(width => ({ width, height: 900, name: String(width) }));
  for (const viewport of viewports) {
    const { width } = viewport;
    await page.setViewportSize(viewport);
    if (info.project.name.startsWith('mobile-qa-')) {
      await touchControl(page, page.getByRole('button', { name: 'Upload and publish', exact: true }));
      await mobileScreenshot(page, info, 'owner-preview', viewport.name);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Upload and publish', exact: true })).toBeVisible();
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `owner-pack-preview-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Upload and publish', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Weekend Patrick is published.' })).toHaveText('Weekend Patrick is published.');
  expect(state.starts).toBe(1); expect(state.puts).toBe(bodies.size); expect(state.publishes).toBe(1);
  await page.getByRole('link', { name: 'Open published collection', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: pack.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(1);
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
  await homeLink(page).click();
  const search = page.getByRole('searchbox', { name: 'Find a show or scene', exact: true });
  const shows = page.getByRole('region', { name: 'Shows', exact: true });
  // Authors and uploaders are credits, not show search terms.
  await search.fill('Mary');
  await expect(page.getByRole('status')).toHaveText(/^\d+ results?$/);
  await expect(shows).toHaveCount(0);
  await search.fill('Weekend Patrick');
  await expect(shows.getByRole('link')).toHaveCount(1);
  await expect(showCard(shows, pack.title, 'en', 1)).toBeVisible();
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
});

test('failed transfers refresh signed URLs and retry without repeating completed uploads', async ({ page }) => {
  const state = await ownerService(page, { failFile: true });
  await unlock(page);
  await page.getByLabel('Choose collection folder', { exact: true }).setInputFiles(packFolder);
  await page.getByRole('button', { name: 'Upload and publish', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Completed files are kept for retry.');
  expect(state.publishes).toBe(0);
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Weekend Patrick is published.' })).toHaveText('Weekend Patrick is published.');
  expect(state.starts).toBe(1); expect(state.refreshes).toBe(1); expect(state.puts).toBe(bodies.size + 1); expect(state.publishes).toBe(1);
});

test('an uncertain publication can be retried without uploading files again', async ({ page }) => {
  const state = await ownerService(page, { failPublication: true });
  await unlock(page);
  await page.getByLabel('Choose collection folder', { exact: true }).setInputFiles(packFolder);
  await page.getByRole('button', { name: 'Upload and publish', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Publication could not be confirmed.');
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Weekend Patrick is published.' })).toHaveText('Weekend Patrick is published.');
  expect(state.puts).toBe(bodies.size); expect(state.publishes).toBe(2); expect(state.refreshes).toBe(0);
});

test('an in-flight transfer has a navigation warning and can be cancelled before publication', async ({ page }) => {
  const state = await ownerService(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/content/uploads/${uploadId}/**`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type,x-oss-object-acl' } });
    await pending;
    await route.abort('aborted').catch(() => {});
  });
  await unlock(page);
  await page.getByLabel('Choose collection folder', { exact: true }).setInputFiles(packFolder);
  await page.getByRole('button', { name: 'Upload and publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel upload', exact: true })).toBeVisible();
  await (await headerDestination(page, 'Browse')).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep uploading', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/owner\/packs$/);
  await page.getByRole('button', { name: 'Cancel upload', exact: true }).click();
  release();
  await expect(page.getByRole('status')).toHaveText('Upload stopped. Retry to continue with the completed files.');
  expect(state.publishes).toBe(0);
});

test('owner setup failure is visible and an invalid folder never starts an upload', async ({ page }) => {
  await ownerService(page);
  let configured = false;
  await page.route('**/api/owner-config', route => route.fulfill({ status: configured ? 200 : 503, json: configured ? { apiBase: '/api/owner' } : { error: 'not_configured' } }));
  await page.goto('/en/owner/packs');
  await expect(page.getByRole('alert')).toContainText('Owner uploads are not available yet.');
  configured = true;
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.getByLabel('Owner access key', { exact: true }).fill(ownerKey);
  await page.getByRole('button', { name: 'Unlock uploads', exact: true }).click();
  const invalid = join(directory, 'invalid-pack');
  await mkdir(invalid, { recursive: true });
  await writeFile(join(invalid, 'pack.json'), JSON.stringify({ ...pack, title: '' }));
  await page.getByLabel('Choose collection folder', { exact: true }).setInputFiles(invalid);
  await expect(page.getByRole('alert')).toContainText('pack.json is invalid.');
  await expect(page.getByRole('button', { name: 'Upload and publish', exact: true })).toHaveCount(0);
});

test('public home search survives reload and recovers from an empty result', async ({ page }) => {
  await page.goto('/en/packs');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(homeShelves.length);
  await expect(page.getByText(/Uploaded by/)).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Franchise', exact: true })).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Find a show or scene', exact: true });
  await search.fill('Friends');
  await expect(showCard(page.getByRole('region', { name: 'Shows', exact: true }), 'Friends')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('q')).toBe('Friends');
  await page.reload();
  await expect(search).toHaveValue('Friends');
  await expect(showCard(page.getByRole('region', { name: 'Shows', exact: true }), 'Friends')).toBeVisible();
  await search.fill('no-pack-matches-this-query');
  await expect(page.getByRole('status')).toHaveText('0 results');
  await page.getByRole('button', { name: 'Clear search', exact: true }).last().click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(homeShelves.length);
});

test('the owner can change or clear the public featured scene at runtime', async ({ page }) => {
  await ownerService(page);
  const featured = clips.find(clip => clip.slug === 'patrick')!;
  const second = clips.find(clip => clip.slug === 'first-english-good-morning')!;
  const title = (clip: typeof featured) => publishedCatalog.packData[clip.packId].locales?.en?.scenes[clip.id]?.title ?? clip.title;
  const picker = page.getByRole('combobox', { name: 'Featured scene', exact: true });
  const save = page.getByRole('button', { name: 'Save featured scene', exact: true });
  await unlock(page);
  await expect(picker).toHaveValue('');
  await picker.selectOption(featured.id);
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Featured scene updated.');
  await (await headerDestination(page, 'Browse')).click();
  const region = page.getByRole('region', { name: title(featured), exact: true });
  await expect(region).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(region.getByRole('link', { name: /Start dubbing/ })).toBeVisible();
  }
  await region.getByRole('link', { name: /Start dubbing/ }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await unlock(page);
  await expect(picker).toHaveValue(featured.id);
  await picker.selectOption(second.id);
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Featured scene updated.');
  await (await headerDestination(page, 'Browse')).click();
  await expect(page.getByRole('region', { name: title(second), exact: true })).toBeVisible();
  await expect(region).toHaveCount(0);
  await unlock(page);
  await picker.selectOption('');
  await save.click();
  await expect(page.getByRole('status')).toHaveText('Featured scene updated.');
  await (await headerDestination(page, 'Browse')).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(homeShelves.map(shelf => shelfTitle(shelf, 'en')));
  await expect(page.getByText('Featured scene', { exact: true })).toHaveCount(0);
});

test('owner management hides, restores and deletes packs through the owner API', async ({ page }, info) => {
  await ownerService(page);
  await unlock(page);
  const title = packs[0].data.title;
  const management = page.getByRole('region', { name: 'Your collections', exact: true });
  const row = management.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(row.getByText('Visible in Collections', { exact: true })).toBeVisible();
  if (info.project.name.startsWith('mobile-qa-')) for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const action of ['Hide', 'Delete']) await touchControl(page, row.getByRole('button', { name: `${action} ${title}`, exact: true }));
  }
  await row.getByRole('button', { name: `Hide ${title}`, exact: true }).click();
  await expect(row.getByText('Hidden from Collections', { exact: true })).toBeVisible();
  await (await headerDestination(page, 'Browse')).click();
  // The first published pack is the Memes collection, which has its own shelf.
  const shelf = page.getByRole('region', { name: title, exact: true });
  const shelves = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(shelves).toHaveCount(homeShelves.length - 1);
  await expect(shelf).toHaveCount(0);
  await unlock(page);
  await row.getByRole('button', { name: `Show ${title}`, exact: true }).click();
  await expect(row.getByText('Visible in Collections', { exact: true })).toBeVisible();
  await (await headerDestination(page, 'Browse')).click();
  await expect(shelves).toHaveCount(homeShelves.length);
  await expect(shelf).toBeVisible();
  await unlock(page);
  await row.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Shared videos, audio and images remain in storage.');
  await dialog.getByRole('button', { name: 'Keep collection', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
  await (await headerDestination(page, 'Browse')).click();
  await expect(shelves).toHaveCount(homeShelves.length - 1);
  await expect(shelf).toHaveCount(0);
});
