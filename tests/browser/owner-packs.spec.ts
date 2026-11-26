import { test, expect, catalogUrl, headerDestination, homeShelves, shelfTitle, showCard } from './fixtures';
import type { Page } from '@playwright/test';
import { publishedCatalog, packs, clips, readScene, sceneFile } from '../content-fixtures';
import type { Pack } from '../../src/content-pack';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { mobileViewports, mobileScreenshot, touchControl } from './mobile-viewports';

const ownerKey = 'test-only-owner-access-key';
const uploadId = 'upl_ownerBrowserTest';
let directory: string, packFolder: string, pack: Pack, scene: ReturnType<typeof readScene>, bodies: Map<string, Buffer>;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parrotbook-owner-browser-'));
  packFolder = join(directory, 'weekend-pack');
  const original = clips.find(clip => clip.slug === 'patrick')!;
  const source = packs.find(pack => pack.entry.id === original.packId)!.data;
  scene = structuredClone(readScene('patrick'));
  scene.id = 'scene_ownerBrowserTest';
  const roleIds = new Map<string, string>();
  scene.roles = scene.roles.map((role: { id: string }, index: number) => {
    const id = `role_ownerBrowserTest_${index}`; roleIds.set(role.id, id); return { ...role, id };
  });
  scene.lines = scene.lines.map((line: { roleId: string }, index: number) => ({ ...line, id: `line_ownerBrowserTest_${index}`, roleId: roleIds.get(line.roleId)! }));
  const locales = Object.fromEntries(Object.entries(source.locales).map(([language, value]) => {
    const locale = value as { scenes: Record<string, { licence: string; changes: string }>; roles: Record<string, { name: string; hint: string }> };
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
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Home', exact: true }).click();
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
