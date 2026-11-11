import { test, expect, setLanguage } from './fixtures';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Pack } from '../../src/pack';
import { routeShortScene } from './short-scene';

test.use({ samplePack: true });
async function shortPack() {
  const pack: Pack = JSON.parse(await readFile('tests/fixtures/sintel/pack.json', 'utf8'));
  delete pack.backing;
  pack.duration = 3.2;
  pack.lines = pack.lines.slice(0, 3).map((line, index) => ({ ...line, start: 0.2 + index, end: 1.2 + index, words: undefined }));
  return pack;
}
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket('ws://127.0.0.1:4317/**', socket => socket.close());
  await page.route('**/packs/patrick/pack.json', async route => route.fulfill({ json: await shortPack() }));
  await routeShortScene(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 660;
      const gain = context.createGain(); gain.gain.value = 0.2;
      const output = context.createMediaStreamDestination(); oscillator.connect(gain).connect(output); oscillator.start();
      for (const track of output.stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stop(); oscillator.stop(); void context.close(); }; }
      return output.stream;
    } } });
  });
});

async function saved(page: import('@playwright/test').Page) {
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/dub=dub_[a-f0-9]{30}.*#patrick$/);
}
async function record(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await saved(page);
}

test('partial dubs survive reload and a new tab with exact audio, waveform, role, and line progress', async ({ page, context }) => {
  const uploads: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()); });
  await page.goto('/#patrick'); await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await record(page);
  const wave = page.getByRole('img', { name: '你的声音波形', exact: true });
  const originalPath = await wave.locator('path').getAttribute('d');
  const url = page.url();
  await page.getByRole('button', { name: '下一步', exact: true }).click(); await saved(page);
  await page.reload();
  await expect(page.getByRole('button', { name: "第 2 句：I'm searching for someone.", exact: true })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: '第 1 句：Thank you.', exact: true }).click();
  await expect(wave.locator('path')).toHaveAttribute('d', originalPath!);
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止播放', exact: true }).click(); await saved(page);
  // A fresh page in the same browser has the same IndexedDB, not the old JS state.
  const second = await context.newPage();
  await second.routeWebSocket('ws://127.0.0.1:4317/**', socket => socket.close());
  await second.route('**/packs/patrick/*.json', async route => route.fulfill({ body: await readFile('tests/fixtures/sintel/' + new URL(route.request().url()).pathname.split('/').pop()), contentType: 'application/json' }));
  await second.route('**/packs/patrick/pack.json', async route => route.fulfill({ json: await shortPack() }));
  await routeShortScene(second);
  await second.goto(url);
  await expect(second.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(second.getByRole('img', { name: '你的声音波形', exact: true }).locator('path')).toHaveAttribute('d', originalPath!);
  await second.close();
  // Reopening in the main page keeps the routed fixture's exact manifest as well.
  await page.goto('/'); await page.goto(url);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(wave.locator('path')).toHaveAttribute('d', originalPath!);
  await page.getByRole('button', { name: '第 1 句：Thank you.', exact: true }).click();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(uploads).toEqual([]);
});

test('completed and partial attempts stay separate; restarting keeps history and deleting removes only that attempt', async ({ page }, info) => {
  await page.goto('/#patrick'); await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await record(page);
  const firstUrl = page.url();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click(); await saved(page);
  await page.reload(); await expect(page.getByRole('heading', { name: '你的配音，完成啦！', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下载配音视频', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载配音视频', exact: true }).click();
  await expect(page.getByRole('link', { name: '再次下载视频', exact: true })).toBeVisible({ timeout: 12000 });
  expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.getByRole('button', { name: '开始新的配音', exact: true }).click();
  await page.getByRole('button', { name: /^旅人/ }).click(); await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await record(page); const secondUrl = page.url(); expect(secondUrl).not.toBe(firstUrl);
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  const history = page.getByRole('region', { name: '我的配音', exact: true });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByText(/已完成 · 已录 1 \/ 2 句/)).toBeVisible();
  await expect(history.getByText(/未完成 · 已录 1 \/ 1 句/)).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'chromium') { const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english'); await mkdir(folder, { recursive: true }); await page.screenshot({ path: join(folder, `saved-dubs-${width}.png`), fullPage: true }); }
  }
  await history.getByRole('button', { name: '继续配音：你在找谁？，Sintel', exact: true }).click();
  await expect(page).toHaveURL(firstUrl); await expect(page.getByRole('heading', { name: '你的配音，完成啦！', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回片段', exact: true }).click();
  const row = history.getByRole('listitem').filter({ has: page.getByRole('button', { name: '继续配音：你在找谁？，Sintel', exact: true }) });
  await row.getByRole('button', { name: '删除配音：你在找谁？', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除配音', exact: true }).click();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await page.reload(); await expect(history.getByRole('listitem')).toHaveCount(1);
  await history.getByRole('button', { name: '继续配音：你在找谁？，旅人', exact: true }).click();
  await expect(page).toHaveURL(secondUrl); await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
});

test('quota errors preserve the last saved attempt and in-memory take, then retry saves it', async ({ page }) => {
  await page.goto('/#patrick'); await page.getByRole('button', { name: '开始配音', exact: true }).click(); await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'media') throw new DOMException('Full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('本机存储空间不足');
  const before = await page.evaluate(async () => { const path = '/src/dub-store.ts'; return (await (await import(path)).listDubs())[0].recorded; });
  expect(before).toBe(0);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload(); await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
});

test('changed content cannot overwrite a saved dub and My dubs translates', async ({ page }) => {
  await page.goto('/#patrick'); await page.getByRole('button', { name: '开始配音', exact: true }).click(); await record(page);
  await page.route('**/packs/patrick/pack.json', async route => { const pack = JSON.parse(await readFile('tests/fixtures/sintel/pack.json', 'utf8')); pack.video = 'changed.mp4'; await route.fulfill({ json: pack }); });
  await page.reload(); await expect(page.getByRole('alert')).toContainText('片段已更新');
  await page.getByRole('button', { name: '返回片段', exact: true }).click(); await setLanguage(page, 'en');
  await expect(page.getByRole('region', { name: 'My dubs', exact: true }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText(/Saved only in this browser/)).toBeVisible();
});

test('unavailable storage keeps recording usable and retry can save the current take', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { indexedDB.open = open; };
    indexedDB.open = () => { throw new DOMException('Storage disabled', 'SecurityError'); };
  });
  await page.getByRole('button', { name: '选择片段：不，这是派大星！', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无法保存到本机');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved(page);
  await page.reload(); await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
});
