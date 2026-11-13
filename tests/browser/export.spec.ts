import { test, expect } from './fixtures';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scene } from '../../src/scene';
import { routeShortScene } from './short-scene';

test.use({ sampleScene: true });

test.beforeEach(async ({ page }) => {
  // A development hot reload must not reset the session during a real-time export.
  await page.routeWebSocket('ws://127.0.0.1:4317/**', socket => socket.close());
  const scene: Scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
  // Match the shipped catalog, whose clips keep the original video audio and
  // have no separate backing asset. The offline mix check covers a backing bed.
  delete scene.backing;
  scene.duration = 3.2;
  scene.lines = scene.lines.slice(0, 3).map((line, index) => ({ ...line, start: 0.2 + index, end: 1.2 + index, words: undefined }));
  await page.route('**/scenes/patrick/scene.json', route => route.fulfill({ json: scene }));
  await routeShortScene(page);
  await page.addInitScript(() => {
    // A known microphone tone makes the exported voice independently measurable.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 660;
      const gain = context.createGain(); gain.gain.value = 0.2;
      const output = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(output); oscillator.start();
      output.stream.getTracks().forEach(track => {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); oscillator.stop(); void context.close(); };
      });
      return output.stream;
    } } });
  });
});

async function completeDub(page: import('@playwright/test').Page) {
  await page.goto('/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled({ timeout: 12000 });
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  // Leave the second learner turn skipped: its original audio must survive.
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '你的配音，完成啦！', exact: true })).toBeVisible();
}

test('downloads a real local H.264/AAC MP4 with the recorded voice and original skipped turns', async ({ page }, info) => {
  const uploads: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url()); });
  await completeDub(page);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
    const button = page.getByRole('button', { name: '下载配音视频', exact: true });
    await expect(button).toBeEnabled();
    const bounds = (await button.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 375 ? 667 : 900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'chromium') {
      const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `download-dub-${width}.png`), fullPage: true });
    }
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载配音视频', exact: true }).click();
  await expect(page.getByRole('link', { name: '再次下载视频', exact: true })).toBeVisible({ timeout: 12000 });
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^parrotbook-scene_.*\.mp4$/);
  const path = info.outputPath('dub.mp4'); await file.saveAs(path);
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8' }));
  expect(metadata.streams.map((stream: { codec_name: string }) => stream.codec_name).sort()).toEqual(['aac', 'h264']);
  expect(Number(metadata.format.duration)).toBeGreaterThan(3.0);
  expect(Number(metadata.format.duration)).toBeLessThan(3.6);
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1']);
  const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  function tone(start: number, end: number) {
    let real = 0, imaginary = 0;
    for (let i = Math.floor(start * 48000); i < end * 48000; i++) {
      real += samples[i] * Math.cos(2 * Math.PI * 660 * i / 48000);
      imaginary += samples[i] * Math.sin(2 * Math.PI * 660 * i / 48000);
    }
    return 2 * Math.hypot(real, imaginary) / ((end - start) * 48000);
  }
  expect(tone(0.4, 0.8)).toBeGreaterThan(0.12);
  expect(tone(2.4, 2.8)).toBeLessThan(0.04);
  // Decoding a frame also catches blank/corrupt video-track exports.
  const frame = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', path, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  expect([...frame].some(value => value > 10)).toBe(true);
  expect(uploads).toEqual([]);
  await expect(page.getByRole('link', { name: '再次下载视频', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '再改一句', exact: true })).toBeEnabled();
});

test('cancel and failed export preserve takes and allow retry', async ({ page }) => {
  await completeDub(page);
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.route('**/search-v1.mp4', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fallback(); });
  await page.getByRole('button', { name: '下载配音视频', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消导出', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '再改一句', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '取消导出', exact: true }).click();
  await expect(page.getByRole('button', { name: '下载配音视频', exact: true })).toBeEnabled();
  await page.route('**/search-v1.mp4', route => route.abort());
  await page.getByRole('button', { name: '下载配音视频', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载配音视频', exact: true })).toBeEnabled();
  await page.unroute('**/search-v1.mp4');
  await page.getByRole('button', { name: '再改一句', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  expect(downloads).toEqual([]);
});

test('local mix keeps backing, skipped dialogue, and the retained take offset at exact line boundaries', async ({ page }) => {
  await page.goto('/library/older-audience');
  const levels = await page.evaluate(async () => {
    const mixerPath = '/src/export-dub.ts', wavPath = '/src/pcm-recording.ts';
    const { mixDubAudio } = await import(mixerPath);
    const { encodePcmWav } = await import(wavPath);
    const wav = (level: number) => encodePcmWav([new Float32Array(48000).fill(level)], 48000);
    const scene = { duration: 1, lines: [{ id: 'line_recorded', start: 0.2, end: 0.6 }, { id: 'line_skipped', start: 0.6, end: 1 }] };
    const takes = { line_recorded: { start: 0.1, blob: wav(0.4) } };
    const result: AudioBuffer = await mixDubAudio(scene, takes, await wav(0.1).arrayBuffer(), await wav(0.2).arrayBuffer());
    return [0.05, 0.15, 0.3, 0.55, 0.65, 0.99].map(time => result.getChannelData(0)[Math.floor(time * 48000)]);
  });
  for (const [index, level] of [0.1, 0.5, 0.6, 0.6, 0.1, 0.1].entries()) expect(levels[index]).toBeCloseTo(level, 3);
});
