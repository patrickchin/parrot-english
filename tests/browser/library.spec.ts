import { scenePath } from './scene-path';
import { test, expect, setLanguage } from './fixtures';
import { clips } from '../content-fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const filmCount = clips.filter(clip => clip.cohort === 'older-audience').length;

test('the simplified shelf keeps scenes, privacy and source details accessible without a Help button', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '片段已就位。 轮到你发声。' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sintel/ })).toHaveCount(0);
  for (const clip of clips.filter(clip => clip.cohort === 'older-audience')) {
    await expect(page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: clip.title, exact: true })).toBeVisible();
  }
  await expect(page.getByText('成人原型测试 · 配音保存在此浏览器，不会上传。影视梗片段尚未确认再分发许可。', { exact: true })).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `cleanup-library-${width}.png`), fullPage: true });
    }
  }
  await expect(page.getByRole('button', { name: '怎么配音？', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await page.getByRole('button', { name: '片段与来源', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: '观看原片' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '片段已就位。 轮到你发声。' })).toBeVisible();
});

for (const clip of [...clips.slice(0, 4), ...clips.filter(c => ['infinity', 'mayonnaise'].includes(c.slug))]) test(`hosted clip ${clip.slug} can play and record a turn`, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit microphone capture requires a physical-device check.');
  await page.goto(scenePath(clip.slug));
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 15000 });
});


test('the expanded shelf finds scenes by Chinese, English, and film, and opens a new scene', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.fill('Toy Story');
  await expect(page.getByRole('button', { name: /^选择片段：/ })).toHaveCount(3);
  await expect(page.getByText('3 个片段', { exact: true })).toBeVisible();
  await search.fill('fluffy');
  await expect(page.getByRole('button', { name: '选择片段：太毛茸茸了！', exact: true })).toBeVisible();
  await search.fill('松鼠');
  await expect(page.getByRole('button', { name: '选择片段：松鼠！', exact: true })).toBeVisible();
  await search.fill('no-matching-scene');
  await expect(page.getByRole('status')).toHaveText('没有找到片段。');
  await page.getByRole('button', { name: '查看全部片段', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
  await search.fill('no-matching-scene');
  await setLanguage(page, 'en');
  await expect(page.getByRole('status')).toHaveText('No scenes found.');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
  await search.fill('mayonnaise');
  await page.getByRole('button', { name: 'Choose scene: Is mayonnaise an instrument?', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start dubbing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Scene credits', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Watch the original' })).toHaveAttribute('href', /youtube.com/);
});


test('the scene shelf stays a keyboard-accessible grid', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '列表视图', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '网格视图', exact: true })).toHaveCount(0);
  const first = page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true });
  const second = page.getByRole('button', { name: '选择片段：巧克力？！', exact: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  }
  await first.focus();
  await first.press('Enter');
  await expect(page.getByRole('button', { name: '开始配音', exact: true })).toBeEnabled();
  const back = page.getByRole('button', { name: '返回片段', exact: true });
  await expect(back).toHaveText('');
  await back.click();
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(filmCount);
});

test('unknown pages, scenes and folders show an explicit error instead of another scene shelf', async ({ page }) => {
  for (const path of ['/scenes/missing-scene', '/library/missing-folder', '/missing-page']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: '页面不存在', exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await page.getByRole('button', { name: '片段库', exact: true }).click();
    await expect(page.getByRole('searchbox')).toBeVisible();
  }
});

test('help restores focus without requesting the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { micRequests: number }).micRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { (window as unknown as { micRequests: number }).micRequests++; throw new DOMException('Denied', 'NotAllowedError'); },
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const help = page.getByRole('button', { name: '怎么配音？', exact: true });
  await help.click();
  const dialog = page.getByRole('dialog', { name: '给电影，换上你的声音。', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('儿童使用前，请由监护人了解并同意录音用途。');
  const close = dialog.getByRole('button', { name: '知道了', exact: true });
  await close.focus();
  await close.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { micRequests: number }).micRequests)).toBe(0);
});

test('record requests the microphone directly across scenes, retries and session resets', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { micRequests: number }).micRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { (window as unknown as { micRequests: number }).micRequests++; throw new DOMException('Denied', 'NotAllowedError'); },
    } });
  });
  const requests = () => page.evaluate(() => (window as unknown as { micRequests: number }).micRequests);
  await page.goto('/');
  let count = 0;
  for (const clip of [clips[0], clips[1], clips[0]]) {
    await page.getByRole('button', { name: `选择片段：${clip.title}`, exact: true }).click();
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    expect(await requests()).toBe(count);
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole('button', { name: '开始录音', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('麦克风还没开启');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(await requests()).toBe(++count);
    }
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '开始新的配音', exact: true }).click();
    await page.getByRole('button', { name: '开始配音', exact: true }).click();
    await page.getByRole('button', { name: '开始录音', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('麦克风还没开启');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await requests()).toBe(++count);
    await page.getByRole('button', { name: '返回片段', exact: true }).click();
  }
});
