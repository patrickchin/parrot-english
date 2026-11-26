import { scenePath } from './scene-path';
import { test, expect, catalogUrl, setLanguage, browseText, escapeRegExp, homeShelves, openShow, shelfShown, shelfTitle, showCard } from './fixtures';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { clips, packs } from '../content-fixtures';

test('catalog downloads while application JavaScript is held and is reused on first render', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  page.on('request', request => { if (request.url() === catalogUrl) requests++; });
  await page.route('**/assets/main-*.js', async route => { await held; await route.continue(); });
  try {
    await page.goto('/en/packs', { waitUntil: 'commit' });
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('searchbox', { name: 'Find a show or scene', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

for (const initialPath of ['/en/packs', '/en/library/all']) test(`first visit to ${initialPath} discovers every pack, scene and locale with one catalog request`, async ({ page }) => {
  const requests: { method: string; url: string; type: string }[] = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url(), type: request.resourceType() }));
  await page.goto(initialPath);
  expect(packs).toHaveLength(21);
  expect(clips).toHaveLength(132);
  if (initialPath === '/en/packs') {
    // Every published pack is either a show on an age shelf or a collection shelf.
    expect(homeShelves.reduce((total, shelf) => total + (shelf.kind === 'section' ? shelf.shows.length : 1), 0)).toBe(packs.length);
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(homeShelves.map(shelf => shelfTitle(shelf, 'en')));
    for (const shelf of homeShelves) {
      const name = shelfTitle(shelf, 'en');
      const region = page.getByRole('region', { name, exact: true });
      if (shelf.kind === 'collection') await expect(region.getByRole('link', { name: `See all ${shelf.scenes.length} in ${name}`, exact: true })).toBeVisible();
      else if (shelf.shows.length > shelfShown(shelf, page)) await expect(region.getByRole('link', { name: `See all ${shelf.shows.length} in ${name}`, exact: true })).toBeVisible();
      else for (const show of shelf.shows.slice(0, shelfShown(shelf, page))) await expect(showCard(region, show.title)).toBeVisible();
    }
    await page.getByRole('link', { name: 'All scenes', exact: true }).click();
  }
  for (const language of ['en', 'zh-CN', 'es', 'ja', 'ko'] as const) {
    await setLanguage(page, language);
    const titles = packs.flatMap(pack => pack.data.scenes.map((clip: typeof clips[number]) => pack.data.locales[language].scenes[clip.id].title as string));
    const choose = browseText(language).library.chooseScene;
    const scenes = page.getByRole('main').getByRole('button', { name: new RegExp(`^${escapeRegExp(choose.replace('{{title}}', ''))}`) });
    await expect(scenes).toHaveCount(titles.length);
    for (const [index, title] of titles.entries()) await expect(scenes.nth(index)).toHaveAccessibleName(choose.replace('{{title}}', title));
  }
  await setLanguage(page, 'en');
  const catalogRequests = () => requests.filter(request => request.url === catalogUrl);
  expect(catalogRequests()).toEqual([{ method: 'GET', url: catalogUrl, type: 'fetch' }]);
  // Posters may load while browsing. Pack/scene JSON, waveforms and playable
  // media remain deferred until the learner chooses a scene.
  expect(requests.filter(request => {
    const path = new URL(request.url).pathname;
    return request.type === 'media' || /\.(?:mp4|m4a|mp3|wav|aac|ogg|webm)$/.test(path) ||
      path.endsWith('.json') && (path.startsWith('/content/') && request.url !== catalogUrl || /waveform/i.test(path));
  })).toEqual([]);
  const clip = clips.find(clip => clip.slug === 'patrick')!;
  const pack = packs.find(pack => pack.entry.id === clip.packId)!;
  await page.getByRole('button', { name: `Choose scene: ${pack.data.locales.en.scenes[clip.id].title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  const sceneUrl = new URL(clip.manifest, new URL(pack.entry.manifest, catalogUrl)).href;
  expect(requests.filter(request => request.url === sceneUrl)).toHaveLength(1);
  expect(requests.filter(request => new URL(request.url).pathname.endsWith('/pack.json'))).toEqual([]);
  expect(catalogRequests()).toHaveLength(1);
});

test('the production build browses published packs and reloads the selected pack', async ({ page }) => {
  const response = await page.goto('/en/packs');
  expect(response?.status()).toBe(200);
  const pack = packs[0];
  await page.getByRole('region', { name: pack.data.title, exact: true }).getByRole('link', { name: `See all ${pack.data.scenes.length} in ${pack.data.title}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(pack.data.scenes.length);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose scene:/ })).toHaveCount(pack.data.scenes.length);
});

test('a production scene link downloads player code while its catalog is still loading', async ({ page }) => {
  let playerRequested = false;
  page.on('request', request => { if (/\/assets\/Player-[^/]+\.js$/.test(new URL(request.url()).pathname)) playerRequested = true; });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/content/catalog.json', async route => { await held; await route.fallback(); });
  try {
    await page.goto('/en/scenes/patrick');
    await expect.poll(() => playerRequested).toBe(true);
    // Current catalog membership still decides whether the scene can open.
    await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toHaveCount(0);
    await expect(page.locator('video')).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
});

test('production prepares player code from a scene list and defers owner JavaScript', async ({ page }) => {
  const scripts = new Set<string>();
  let catalogs = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/assets/') && path.endsWith('.js')) scripts.add(path);
    if (path === '/content/catalog.json') catalogs++;
  });
  const requested = (prefix: string) => [...scripts].some(path => new RegExp(`/assets/${prefix}-[^/]+\\.js$`).test(path));
  const codecsRequested = () => [...scripts].some(path => /\/assets\/(?:src|mediabunny[^/]*|export-dub)-[^/]+\.js$/.test(path));
  await page.route('**/api/owner-config', route => route.fulfill({ json: { apiBase: 'https://owner.example.test' } }));
  await page.goto('/en/');
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(homeShelves.length);
  // This verifies request presence, not HTTP-cache behavior; routing fixtures
  // deliberately disable the browser cache in this test suite.
  for (const prefix of ['Player', 'OwnerPacks', 'SavedDubs', 'SharedDub', 'share-client', 'dialog']) {
    expect(requested(prefix), `${prefix} stays out of the initial Packs request graph`).toBe(false);
  }
  expect(codecsRequested()).toBe(false);

  const clip = clips.find(clip => clip.slug === 'patrick')!;
  const pack = packs.find(pack => pack.entry.id === clip.packId)!;
  await openShow(page, pack.data.title);
  await expect(page.getByRole('heading', { level: 1, name: pack.data.title, exact: true })).toBeVisible();
  // Warm only code while the learner chooses a scene, without fetching video.
  await expect.poll(() => requested('Player')).toBe(true);
  await expect(page.locator('video')).toHaveCount(0);
  expect(codecsRequested()).toBe(false);
  const title = pack.data.locales.en.scenes[clip.id].title;
  await page.getByRole('button', { name: `Choose scene: ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  expect(requested('Player')).toBe(true);
  expect(requested('OwnerPacks')).toBe(false);
  expect(codecsRequested()).toBe(false);

  // Owner uploads intentionally have no public navigation entry.
  catalogs = 0;
  await page.goto('/en/owner/packs');
  await expect(page.getByRole('heading', { level: 1, name: 'Manage collections', exact: true })).toBeVisible();
  await expect(page.getByLabel('Owner access key', { exact: true })).toBeVisible();
  expect(requested('OwnerPacks')).toBe(true);
  expect(codecsRequested()).toBe(false);
  expect(catalogs).toBe(0);
});

for (const screen of ['owner', 'player']) test(`a failed route chunk keeps a localized error and recovers with Reload (${screen})`, async ({ page }) => {
  const chunk = screen === 'owner' ? '**/assets/OwnerPacks-*.js' : '**/assets/Player-*.js';
  await page.route(chunk, route => route.abort());
  await page.goto(screen === 'owner' ? '/en/owner/packs' : '/en/scenes/patrick');
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Parrotbook');
  await page.unroute(chunk);
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  if (screen === 'owner') await expect(page.getByRole('heading', { name: 'Manage collections', exact: true })).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
});

for (const clip of clips) test(`hosted ${clip.slug} opens and plays without a device file`, async ({ page }) => {
  await page.goto(scenePath(clip.slug));
  await expect(page.getByLabel('选择本地片段', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '播放原片', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
});

test('the public build reads a selected device file without uploading it or requesting private server media', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET' || req.url().includes('/content/local-dubbing/')) requests.push(req.method() + ' ' + req.url()); });
  // Keep device-local scene support covered independently of the hosted scenes.
  await page.route('**/scenes/patrick/scene.json', async route => {
    const scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
    scene.id = clips.find(clip => clip.slug === 'patrick')!.id;
    scene.mode = 'local'; delete scene.mediaBase;
    await route.fulfill({ json: scene });
  });
  await page.goto('/scenes/patrick');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeDisabled();
  await page.getByLabel('选择本地片段', { exact: true }).setInputFiles(resolve('content/media/sintel/search-v1.mp4'));
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeAttached();
  await expect(page).toHaveURL(/\/dubs\/dub_[a-f0-9]{30}$/);
  await page.reload();
  await expect(page.getByLabel('选择本地片段', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '听这一句原声 (听原声)', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

for (const path of ['/en/', '/zh/', '/en/packs', '/zh/packs', '/en/library/all', '/zh/library/all', '/en/scenes/toy-story-infinity', '/en/dubs', '/zh/dubs/']) test(`localized production path ${path} opens in its requested language`, async ({ page }) => {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  const english = path.startsWith('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', english ? 'en' : 'zh-CN');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (path.includes('/scenes/')) await expect(page.getByRole('button', { name: english ? 'Start dubbing' : '开始配音', exact: true })).toBeEnabled();
  else if (path.includes('/dubs')) await expect(page.getByRole('heading', { level: 1 })).toHaveText(english ? 'My dubs' : '我的配音');
  else await expect(page.getByRole('searchbox', { name: path.includes('/library/') ? english ? 'Find a scene' : '查找片段' : english ? 'Find a show or scene' : '查找节目或片段', exact: true })).toBeVisible();
});

for (const [language, heading, search, start] of [
  ['es', 'Mis doblajes', 'Buscar una escena', 'Empezar a doblar'],
  ['ja', '自分の吹き替え', 'シーンを探す', '吹き替えを始める'],
  ['ko', '내 더빙', '장면 찾기', '더빙 시작'],
]) for (const route of ['/', '/library/all', '/dubs', '/scenes/patrick']) test(`production ${language}${route} opens in its requested language`, async ({ page }) => {
  const response = await page.goto('/' + language + route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  if (route.includes('/scenes/')) await expect(page.getByRole('button', { name: start, exact: true })).toBeEnabled();
  else if (route === '/dubs') await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  else if (route === '/') await expect(page.getByRole('searchbox')).toBeVisible();
  else await expect(page.getByRole('searchbox', { name: search, exact: true })).toBeVisible();
});
