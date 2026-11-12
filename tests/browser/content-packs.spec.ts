import { test, expect, catalogUrl, headerDestination } from './fixtures';
import { catalog, clips, packs, readScene, sceneFile } from '../content-fixtures';
import { readFile } from 'node:fs/promises';

const communityId = 'pack_communityTest';
const communityPath = `packs/${communityId}/pack.json`;
const communityUrl = new URL(communityPath, catalogUrl).href;

function communityPack() {
  const original = clips.find(clip => clip.slug === 'patrick')!;
  const scene = readScene('patrick');
  scene.id = 'scene_communityTest'; scene.title = 'Community hello';
  scene.roles = [{ ...scene.roles[0], id: 'role_communityTest', name: 'Sam' }];
  scene.lines = [{ ...scene.lines[0], id: 'line_communityTest', roleId: scene.roles[0].id, text: 'Hello from our community.', words: undefined }];
  const summary = {
    ...original, id: scene.id, slug: 'community-hello', title: scene.title,
    manifest: 'scenes/community-hello/scene.json', tags: ['communitymagic'],
    quotes: ['Hello from our community.'],
  };
  const locales = Object.fromEntries(['en', 'zh-CN', 'es', 'ja', 'ko'].map(language => [language, {
    scenes: { [scene.id]: { title: scene.title, licence: scene.credit.licence, changes: scene.credit.changes } },
    roles: { [scene.roles[0].id]: { name: 'Sam', hint: scene.roles[0].hint } },
  }]));
  return { scene, pack: { version: 1, id: communityId, title: 'Community test', description: 'A dynamically published test pack.', author: 'Community creator', scenes: [summary], locales } };
}

test('publishing and withdrawing a pack updates discovery, search, playback and saved dubs without rebuilding', async ({ page }) => {
  const { scene, pack } = communityPack();
  const current = structuredClone(catalog);
  await page.route(catalogUrl, route => route.fulfill({ json: current }));
  await page.route(communityUrl, route => route.fulfill({ json: pack }));
  await page.route(new URL('scenes/community-hello/scene.json', communityUrl).href, route => route.fulfill({ json: scene }));
  await page.route(new URL('scenes/community-hello/' + scene.waveform, communityUrl).href, async route => route.fulfill({ body: await readFile(sceneFile('patrick', scene.waveform)), contentType: 'application/json' }));
  await page.goto('/en/');
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  await search.fill('communitymagic');
  await expect(page.getByRole('button', { name: 'Choose scene: Community hello', exact: true })).toHaveCount(0);

  current.packs.push({ id: communityId, manifest: communityPath });
  await page.reload();
  await search.fill('communitymagic');
  await page.getByRole('button', { name: 'Choose scene: Community hello', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Community hello', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sam', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preview subtitles', exact: true }).getByRole('listitem').getByText('Hello from our community.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scene credits', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText(packs[0].data.locales.en.notices.scene);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dubs\/dub_[a-f0-9]{30}$/);
  const savedUrl = page.url();

  current.packs.pop();
  await page.goto(savedUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toHaveCount(0);
  await (await headerDestination(page, 'My dubs')).click();
  await expect(page.getByRole('button', { name: /^Continue dub: Community hello/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete dub: Community hello', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete dub', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No dubs yet', exact: true })).toBeVisible();
});

test('a direct scene link waits for the dynamic catalog before resolving the scene', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(catalogUrl, async route => { await waiting; await route.fulfill({ json: catalog }); });
  await page.goto('/en/scenes/toy-story-infinity');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('failed or malformed packs show a retryable error and My dubs stays accessible', async ({ page }) => {
  let broken = true;
  const pack = packs[0];
  await page.route(new URL(pack.entry.manifest, catalogUrl).href, route => route.fulfill({ json: broken ? { ...pack.data, version: 99 } : pack.data }));
  await page.goto('/en/scenes/patrick');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toHaveCount(0);
  await (await headerDestination(page, 'My dubs')).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My dubs', exact: true })).toBeVisible();
  await (await headerDestination(page, 'Scene library')).click();
  broken = false;
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Find a scene', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an empty published catalog keeps categories and a single meaningful heading usable', async ({ page }) => {
  await page.route(catalogUrl, route => route.fulfill({ json: { version: 1, packs: [] } }));
  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1, name: 'Scene library', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Scene categories', exact: true }).getByRole('button', { name: /^First English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
