import { test, expect } from './fixtures';
import { clips, memeClips } from '../../src/catalog';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('the simplified shelf keeps scenes, help, privacy and source details accessible', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '今天，给谁配音？' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sintel/ })).toHaveCount(0);
  for (const clip of memeClips) {
    await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: clip.title, exact: true })).toBeVisible();
  }
  await expect(page.getByText('成人原型测试 · 录音不上传，关闭或刷新清空。影视梗片段尚未确认再分发许可。', { exact: true })).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `cleanup-library-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole('button', { name: '怎么配音？', exact: true }).click();
  await expect(page.getByText('选片段 → 选角色 → 听原声 → 一句一句录 → 看你的版本。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.getByRole('button', { name: '片段与来源', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: '观看原片' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '今天，给谁配音？' })).toBeVisible();
});

for (const clip of [...clips.slice(0, 4), ...clips.filter(c => ['infinity', 'mayonnaise'].includes(c.slug))]) test(`hosted clip ${clip.slug} can play and record a turn`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture requires a physical-device check.');
  await page.goto('/#' + clip.slug);
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.getByRole('button', { name: '同意并开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});


test('the expanded shelf finds scenes by Chinese, English, and film, and opens a new scene', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.fill('Toy Story');
  await expect(page.getByRole('button', { name: /^选择片段：/ })).toHaveCount(3);
  await search.fill('fluffy');
  await expect(page.getByRole('button', { name: '选择片段：太毛茸茸了！', exact: true })).toBeVisible();
  await search.fill('松鼠');
  await expect(page.getByRole('button', { name: '选择片段：松鼠！', exact: true })).toBeVisible();
  await search.fill('no-matching-scene');
  await expect(page.getByRole('status')).toHaveText('没有找到片段。');
  await page.getByRole('combobox', { name: 'UI language / 界面语言' }).selectOption('en');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await search.fill('mayonnaise');
  await page.getByRole('button', { name: 'Choose scene: Is mayonnaise an instrument?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Scene credits', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Watch the original' })).toHaveAttribute('href', /youtube.com/);
});


test('list view is keyboard accessible, fits phones, and persists through scene navigation and reload', async ({ page }, info) => {
  await page.goto('/');
  const grid = page.getByRole('button', { name: '网格视图', exact: true });
  const list = page.getByRole('button', { name: '列表视图', exact: true });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await list.focus();
  await list.press('Space');
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('listitem')).toHaveCount(24);
  const first = page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true });
  const second = page.getByRole('button', { name: '选择片段：巧克力？！', exact: true });
  await expect(first).toContainText('No, this is Patrick.');
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
    expect(a.height).toBeGreaterThanOrEqual(64);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    for (const control of [grid, list]) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    if (info.project.name === 'chromium' && [375, 1280].includes(width)) {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `library-list-${width}.png`) });
    }
  }
  await page.getByRole('searchbox').fill('infinity');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await grid.click();
  await expect(page.getByRole('searchbox')).toHaveValue('infinity');
  await list.click();
  await page.getByRole('button', { name: '选择片段：飞向宇宙！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'UI language / 界面语言' }).selectOption('en');
  await expect(page.getByRole('button', { name: 'List view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Grid view', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('view switching works when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  await expect(page.getByRole('button', { name: '列表视图', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true })).toContainText('No, this is Patrick.');
});


test('the retired sample route returns to the meme library', async ({ page }) => {
  const sampleRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/packs/sintel/')) sampleRequests.push(request.url()); });
  await page.goto('/#sintel');
  await expect(page.getByRole('heading', { level: 1, name: '今天，给谁配音？' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(24);
  expect(sampleRequests).toEqual([]);
});
