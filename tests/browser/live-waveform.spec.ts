import { readScene } from '../content-fixtures';
import { test, expect } from './fixtures';
import { waveformImage } from './waveform-pixels';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Continuous trace snapshots distort the very frame times this test measures.
test.use({ trace: 'off' });

test('live canvas stays behind its cursor, appends incrementally, and keeps both lanes aligned after resizing', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'The synthetic microphone uses Chromium.');
  await page.addInitScript(() => {
    const audit = { commits: 0, referenceColumns: 0, voiceColumns: 0, voiceRight: 0 };
    (window as unknown as { waveformAudit: typeof audit }).waveformAudit = audit;
    // Observe React commits and real Canvas drawing, without production test hooks.
    const renderers = new Map();
    Object.assign(window, { __REACT_DEVTOOLS_GLOBAL_HOOK__: {
      supportsFiber: true, renderers, inject: (renderer: unknown) => { renderers.set(1, renderer); return 1; },
      onCommitFiberRoot: () => { audit.commits++; }, onCommitFiberUnmount: () => {},
    } });
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.getAttribute('aria-label') === '原声波形') audit.referenceColumns++;
      if (this.canvas.getAttribute('aria-label') === '你的声音波形') {
        audit.voiceColumns++; audit.voiceRight = Math.max(audit.voiceRight, args[0] + args[2]);
      }
      fill.apply(this, args);
    };
    const NativeContext = AudioContext;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new NativeContext(); await context.resume();
      const signal = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
      gain.gain.value = 0.2; signal.connect(gain).connect(output); signal.start();
      const track = output.stream.getAudioTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { stop(); void context.close(); };
      return output.stream;
    } } });
  });
  await page.goto('/scenes/onions');
  const scene = readScene('onions'), line = scene.lines[0];
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const original = page.getByRole('img', { name: '原声波形', exact: true });
  await expect(original).toBeVisible();
  const idleBox = await original.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  // Stress runs target a production preview; dev instrumentation changes timings.
  const cpuRate = Number(process.env.PARROTBOOK_CPU_THROTTLE ?? 1);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const cursor = page.getByRole('progressbar', { name: '配音时间指针' });
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.25);
  expect((await original.boundingBox())!.width).toBeCloseTo(idleBox!.width, 1);
  const recorded = page.getByRole('img', { name: '你的声音波形', exact: true });
  const metrics = await recorded.evaluate(async (canvas: HTMLCanvasElement, start) => {
    const audit = (window as unknown as { waveformAudit: { commits: number; referenceColumns: number; voiceColumns: number; voiceRight: number } }).waveformAudit;
    const before = { ...audit };
    const progress = document.querySelector<HTMLElement>('[role=progressbar][aria-valuenow]')!;
    const video = document.querySelector('video')!;
    const duration = Number(progress.getAttribute('aria-valuemax'));
    const context = canvas.getContext('2d')!;
    const width = canvas.getBoundingClientRect().width;
    const frames: { now: number; cursor: number; x: number; frontier: number; media: number }[] = [];
    const until = performance.now() + 1200;
    await new Promise<void>(resolve => {
      const sample = () => {
        frames.push({ now: performance.now(), cursor: Number(progress.getAttribute('aria-valuenow')), x: progress.getBoundingClientRect().x,
          frontier: audit.voiceRight / width * duration, media: video.currentTime - start });
        if (performance.now() < until) requestAnimationFrame(sample); else resolve();
      };
      requestAnimationFrame(sample);
    });
    // Reading GPU pixels on every frame would itself stall the renderer. Check
    // actual pixels once, after observing the drawing calls and frame motion.
    const pixels = context.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
    let right = canvas.width - 1;
    while (right >= 0 && !pixels[right * 4 + 3]) right--;
    const gaps = frames.slice(1).map((frame, i) => frame.now - frames[i].now).sort((a, b) => a - b);
    return { frames: frames.length, changes: frames.filter((frame, i) => i && frame.x !== frames[i - 1].x).length,
      p95FrameMs: gaps[Math.floor(gaps.length * 0.95)],
      maxAhead: Math.max(...frames.map(frame => frame.frontier - frame.cursor)),
      maxLag: Math.max(...frames.map(frame => frame.cursor - frame.frontier)),
      pixelAhead: (right + 1) / canvas.width * duration - Number(progress.getAttribute('aria-valuenow')),
      cursorError: Math.max(...frames.map(frame => Math.abs(frame.cursor - frame.media))),
      commits: audit.commits - before.commits, referenceColumns: audit.referenceColumns - before.referenceColumns,
      voiceColumns: audit.voiceColumns - before.voiceColumns, width: canvas.width, pixelSeconds: duration / canvas.width };
  }, Math.max(0, line.start - 0.5));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await test.info().attach('live-canvas-measurement', { body: JSON.stringify({ cpuRate, ...metrics }), contentType: 'application/json' });
  expect(metrics.frames).toBeGreaterThan(30);
  expect(metrics.changes).toBeGreaterThan(metrics.frames * 0.65);
  expect(metrics.p95FrameMs).toBeLessThan(50);
  expect(metrics.maxAhead).toBeLessThan(metrics.pixelSeconds + 0.002);
  expect(metrics.pixelAhead).toBeLessThan(metrics.pixelSeconds + 0.002);
  expect(metrics.maxLag).toBeLessThan(0.1);
  expect(metrics.cursorError).toBeLessThan(0.06);
  expect(metrics.commits).toBeGreaterThan(0);
  expect(metrics.commits).toBeLessThan(15);
  expect(metrics.referenceColumns).toBe(0);
  expect(metrics.voiceColumns).toBeLessThan(metrics.width + metrics.frames * 4);
  await page.getByRole('button', { name: '停止录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  expect((await original.boundingBox())!.width).toBeCloseTo(idleBox!.width, 1);
  const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const top = await original.boundingBox(), bottom = await recorded.boundingBox();
    expect(Math.abs(top!.x - bottom!.x)).toBeLessThan(1);
    expect(Math.abs(top!.width - bottom!.width)).toBeLessThan(1);
    expect(top!.y + top!.height).toBeLessThanOrEqual(bottom!.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => recorded.evaluate((canvas: HTMLCanvasElement) => Math.abs(canvas.width / devicePixelRatio - canvas.getBoundingClientRect().width))).toBeLessThan(1);
    expect(await waveformImage(recorded)).not.toBe('data:,');
    if (info.project.name === 'chromium') {
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `canvas-waveform-${width}.png`), fullPage: true });
    }
  }
  const light = await waveformImage(recorded);
  await page.getByRole('button', { name: '切换到深色模式', exact: true }).click();
  await expect.poll(() => waveformImage(recorded)).not.toBe(light);
  if (info.project.name === 'chromium') await page.screenshot({ path: join(folder, 'canvas-waveform-dark.png'), fullPage: true });
  await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click();
  await expect.poll(() => waveformImage(recorded)).toBe(light);
});
