import { test, expect, catalogUrl, setLanguage, headerDestination } from './fixtures';
import { catalog, clips, packs, readScene } from '../content-fixtures';
import { packPath, packsPath } from '../../src/app/routes';
import type { Pack } from '../../src/content-pack';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const starter = packs.find(pack => pack.data.scenes.some((scene: { slug: string }) => scene.slug === 'first-english-good-morning'))!;
const memePack = packs.find(pack => pack.data.scenes.some((scene: { slug: string }) => scene.slug === 'patrick'))!;
const titleOf = (pack: typeof starter, id: string, language = 'en') => pack.data.locales[language].scenes[id].title as string;
const authoredPatrick = clips.find(clip => clip.slug === 'patrick')!;

test('the pack gallery shows authored metadata and supports responsive keyboard selection without user uploads', async ({ page }, info) => {
  await page.goto('/en/');
  const entry = await headerDestination(page, 'Content packs');
  await expect(entry).toHaveAttribute('href', packsPath('en'));
  await entry.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Content packs', exact: true })).toBeVisible();
  const gallery = page.getByRole('navigation', { name: 'Content packs', exact: true });
  await expect(gallery.getByRole('link')).toHaveCount(packs.length);
  for (const pack of packs) {
    const card = gallery.getByRole('link', { name: pack.data.title, exact: true });
    await expect(card).toHaveAttribute('href', packPath(pack.entry.id, 'en'));
    await expect(card).toContainText(pack.data.description);
    await expect(card).toContainText(`By ${pack.data.author}`);
    await expect(card).toContainText(`${pack.data.scenes.length} scenes`);
  }
  await expect(page.getByRole('button', { name: /upload|publish|import|create pack/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /upload|publish|import|create pack/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  const target = gallery.getByRole('link', { name: starter.data.title, exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await target.focus();
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    if (info.project.name === 'chromium') {
      const directory = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `content-packs-${width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  await target.press('Enter');
  await expect(page).toHaveURL(new URL(packPath(starter.entry.id, 'en'), page.url()).href);
  await expect(page.getByRole('heading', { level: 1, name: starter.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(starter.data.scenes.length);
  await expect(page.getByRole('button', { name: /upload|publish|import|create pack/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  const first = starter.data.scenes[0];
  const scene = page.getByRole('button', { name: `Choose scene: ${titleOf(starter, first.id)}`, exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await scene.focus();
    await expect(scene).toBeFocused();
    await expect(scene).toBeInViewport();
  }
  await scene.press('Enter');
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
});

test('a newly published pack and its actual authored scene appear from the runtime catalog without an app build', async ({ page }) => {
  const id = 'pack_ownerWeekendTest';
  const source = structuredClone(memePack.data) as Pack;
  const scene = readScene('patrick');
  const chosen = source.scenes.find(clip => clip.slug === 'patrick')!;
  // Keep the authored manifest/media and performance intact. The additional pack
  // shares its storage directory so relative manifest URLs retain their base.
  const extra: Pack = { ...source, id, title: 'Weekend picks', description: 'A new owner-published selection.', author: 'Parrotbook', scenes: [chosen], locales: {} };
  for (const [language, locale] of Object.entries(source.locales!)) {
    extra.locales![language] = {
      scenes: { [chosen.id]: locale.scenes[chosen.id] },
      roles: Object.fromEntries(scene.roles.map((role: { id: string }) => [role.id, locale.roles[role.id]])),
      notices: locale.notices,
    };
    delete locale.scenes[chosen.id];
    for (const role of scene.roles) delete locale.roles[role.id];
  }
  source.scenes = source.scenes.filter(clip => clip.id !== chosen.id);
  const current = structuredClone(catalog);
  const manifest = memePack.entry.manifest.replace('pack.json', 'weekend-pack.json');
  await page.route(catalogUrl, route => route.fulfill({ json: current }));
  await page.route(new URL(memePack.entry.manifest, catalogUrl).href, route => route.fulfill({ json: current.packs.some(pack => pack.id === id) ? source : memePack.data }));
  await page.route(new URL(manifest, catalogUrl).href, route => route.fulfill({ json: extra }));
  await page.goto(packsPath('en'));
  const gallery = page.getByRole('navigation', { name: 'Content packs', exact: true });
  await expect(gallery.getByRole('link', { name: extra.title, exact: true })).toHaveCount(0);
  current.packs.push({ id, manifest });
  await page.reload();
  await expect(gallery.getByRole('link')).toHaveCount(packs.length + 1);
  const added = gallery.getByRole('link', { name: extra.title, exact: true });
  await expect(added).toContainText(extra.description);
  await expect(added).toContainText('1 scene');
  await added.click();
  await expect(page.getByRole('heading', { level: 1, name: extra.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(1);
  await page.getByRole('button', { name: `Choose scene: ${titleOf(memePack, chosen.id)}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`\\?pack=${id}$`));
  await page.getByRole('button', { name: 'Back to scenes', exact: true }).click();
  await expect(page).toHaveURL(new URL(packPath(id, 'en'), page.url()).href);
  current.packs.pop();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Content packs', exact: true }).click();
  await expect(gallery.getByRole('link', { name: extra.title, exact: true })).toHaveCount(0);
});

test('pack selection scopes search and survives reload, history and language changes', async ({ page }) => {
  await page.goto(packsPath('en'));
  await page.getByRole('navigation', { name: 'Content packs', exact: true }).getByRole('link', { name: starter.data.title, exact: true }).click();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(starter.data.scenes.length);
  const notice = page.getByText(starter.data.locales.en.notices.library, { exact: true });
  await expect(notice).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Find a scene', exact: true });
  const greeting = starter.data.scenes.find((clip: { slug: string }) => clip.slug === 'first-english-good-morning')!;
  await search.fill(titleOf(starter, greeting.id));
  await expect(page.getByRole('button', { name: `Choose scene: ${titleOf(starter, greeting.id)}`, exact: true })).toBeVisible();
  await search.fill('SpongeBob');
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'Show all scenes', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(starter.data.scenes.length);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: starter.data.title, exact: true })).toBeVisible();
  await setLanguage(page, 'zh-CN');
  await expect(page).toHaveURL(new URL(packPath(starter.entry.id, 'zh-CN'), page.url()).href);
  await expect(page.getByRole('button', { name: /^选择片段：/ })).toHaveCount(starter.data.scenes.length);
  await expect(page.getByRole('button', { name: `选择片段：${titleOf(starter, greeting.id, 'zh-CN')}`, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new URL(packPath(starter.entry.id, 'en'), page.url()).href);
  await page.goForward();
  await expect(page).toHaveURL(new URL(packPath(starter.entry.id, 'zh-CN'), page.url()).href);
  await setLanguage(page, 'en');
  await page.getByRole('link', { name: 'All content packs', exact: true }).click();
  await expect(page).toHaveURL(new URL(packsPath('en'), page.url()).href);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: starter.data.title, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('navigation', { name: 'Content packs', exact: true })).toBeVisible();
});

test('recorded dubs retain their selected pack through saving, reload, language and player Back', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture requires a physical-device check.');
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.goto(packPath(memePack.entry.id, 'en'));
  await page.getByRole('button', { name: `Choose scene: ${titleOf(memePack, authoredPatrick.id)}`, exact: true }).click();
  await page.getByRole('button', { name: 'Start dubbing', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const saved = new URL(page.url());
  expect(saved.pathname).toMatch(/\/dubs\/dub_[a-f0-9]{30}$/);
  expect(saved.searchParams.get('pack')).toBe(memePack.entry.id);
  await page.reload();
  await expect(page.getByRole('button', { name: 'My recording', exact: true })).toBeEnabled();
  await setLanguage(page, 'zh-CN');
  expect(new URL(page.url()).searchParams.get('pack')).toBe(memePack.entry.id);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(new URL(packPath(memePack.entry.id, 'zh-CN'), page.url()).href);
  await expect(page.getByRole('heading', { level: 1, name: memePack.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^选择片段：/ })).toHaveCount(memePack.data.scenes.length);
  await (await headerDestination(page, '我的配音')).click();
  await page.getByRole('button', { name: new RegExp(`^继续配音：${titleOf(memePack, authoredPatrick.id, 'zh-CN')}`) }).click();
  await expect(page).toHaveURL(saved.href.replace('/en/', '/zh/'));
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page).toHaveURL(new URL(packPath(memePack.entry.id, 'zh-CN'), page.url()).href);
  expect(writes).toEqual([]);
});

test('an empty catalog keeps a useful pack gallery without an upload flow', async ({ page }) => {
  await page.route(catalogUrl, route => route.fulfill({ json: { version: 1, packs: [] } }));
  await page.goto(packsPath('en'));
  await expect(page.getByRole('heading', { level: 1, name: 'Content packs', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('No content packs yet');
  await expect(page.getByRole('button', { name: /upload|publish|import|create pack/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test('an empty authored pack stays distinct from an unknown pack', async ({ page }) => {
  await page.route(new URL(starter.entry.manifest, catalogUrl).href, route => route.fulfill({ json: { ...starter.data, scenes: [], locales: undefined } }));
  await page.goto(packPath(starter.entry.id, 'en'));
  await expect(page.getByRole('heading', { level: 1, name: starter.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('No scenes in this pack');
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'All content packs', exact: true }).click();
  await page.goto(packPath('pack_missingTest', 'en'));
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Content packs', exact: true }).click();
  await expect(page).toHaveURL(new URL(packsPath('en'), page.url()).href);
  await expect(page.getByRole('navigation', { name: 'Content packs', exact: true })).toBeVisible();
});
