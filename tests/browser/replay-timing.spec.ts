import { waveformOnset } from './waveform-pixels';
import { readScene } from '../content-fixtures';
import { test, expect } from './fixtures';

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const capture = await page.evaluate(() => {
    const audit = (window as unknown as { replayAudit?: {
      captureFrames: unknown[]; captureEvents: unknown[]; presentedFrames: unknown[];
    } }).replayAudit;
    return { frames: audit?.captureFrames, events: audit?.captureEvents,
      presentedFrames: audit?.presentedFrames,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent) };
  }).catch(() => ({ unavailable: true }));
  await info.attach('early-capture-clocks', { body: JSON.stringify(capture), contentType: 'application/json' });
});

test('replay reuses decoded takes and aligns a rendered audio transient with the picture', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeContext = AudioContext;
    type Primitive = string | number | boolean | undefined;
    type Audit = { context: AudioContext; input?: AudioContext; decodes: number; transient?: number;
      frames: { now: number; media: number }[]; captureFrames: Record<string, Primitive>[];
      captureEvents: Record<string, Primitive>[]; presentedFrames: Record<string, Primitive>[]; captureFinished?: boolean };
    const audit = { decodes: 0, frames: [], captureFrames: [], captureEvents: [], presentedFrames: [] } as unknown as Audit;
    (window as unknown as { replayAudit: Audit }).replayAudit = audit;
    const sample = () => {
      const video = document.querySelector('video');
      const stamp = audit.context?.getOutputTimestamp();
      return { now: performance.now(), video: video?.currentTime, paused: video?.paused,
        seeking: video?.seeking, readyState: video?.readyState, rate: video?.playbackRate,
        audio: audit.context?.currentTime, state: audit.context?.state,
        input: audit.input?.currentTime, inputState: audit.input?.state,
        outputTime: stamp?.contextTime, outputPerformanceTime: stamp?.performanceTime };
    };
    const remember = (rows: Record<string, Primitive>[], value: Record<string, Primitive>, limit: number) => {
      rows.push(value); if (rows.length > limit) rows.shift();
    };
    let observed: HTMLVideoElement | undefined;
    const earlyFrames = () => {
      const video = document.querySelector('video');
      if (video && audit.context) remember(audit.captureFrames, sample(), 360);
      if (video && video !== observed && video.requestVideoFrameCallback) {
        observed = video;
        const presented: VideoFrameRequestCallback = (now, metadata) => {
          remember(audit.presentedFrames, { now, media: metadata.mediaTime,
            expectedDisplayTime: metadata.expectedDisplayTime, presented: metadata.presentedFrames }, 180);
          if (!audit.captureFinished) video.requestVideoFrameCallback(presented);
        };
        video.requestVideoFrameCallback(presented);
      }
      if (document.querySelector('[role="alert"]')) audit.captureFinished = true;
      if (!audit.captureFinished) requestAnimationFrame(earlyFrames);
    };
    requestAnimationFrame(earlyFrames);
    for (const event of ['playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked']) {
      document.addEventListener(event, e => {
        if (e.target instanceof HTMLVideoElement && !audit.captureFinished) {
          remember(audit.captureEvents, { event, ...sample() }, 60);
        }
      }, true);
    }
    const NativeWorklet = AudioWorkletNode;
    window.AudioWorkletNode = class extends NativeWorklet {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        if (name !== 'capture-waveform') return;
        this.port.addEventListener('message', event => {
          if (event.data.type === 'started' || event.data.type === 'stopped') {
            remember(audit.captureEvents, { event: 'worklet.' + event.data.type,
              startedAt: event.data.time, ...sample() }, 60);
            if (event.data.type === 'stopped') audit.captureFinished = true;
          }
        });
      }
    };
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); audit.context = this; }
      decodeAudioData(bytes: ArrayBuffer) { audit.decodes++; return super.decodeAudioData(bytes); }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new NativeContext(); await context.resume();
      audit.input = context;
      const oscillator = context.createOscillator(), gain = context.createGain();
      const output = context.createMediaStreamDestination();
      oscillator.connect(gain).connect(output);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0.2, context.currentTime + 0.6);
      oscillator.start();
      setTimeout(() => { void context.close(); }, 15000);
      return output.stream;
    } } });
  });
  await page.route('**/scenes/onions/scene.json', async route => {
    const scene = readScene('onions');
    delete scene.backing;
    await route.fulfill({ json: scene });
  });
  await page.goto('/scenes/onions');
  const scene = readScene('onions');
  const line = scene.lines[0];
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const cursor = page.getByRole('progressbar', { name: '配音时间指针' });
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(1.1);
  await page.getByRole('button', { name: '停止录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  const onset = await waveformOnset(page.getByRole('img', { name: '你的声音波形', exact: true }), line.start, line.end);
  expect(onset).toBeGreaterThan(line.start + 0.1);
  const before = await page.evaluate(async () => {
    const audit = (window as unknown as { replayAudit: { context: AudioContext; decodes: number; transient?: number; frames: { now: number; media: number }[] } }).replayAudit;
    const context = audit.context;
    const module = new Blob([`registerProcessor('replay-test-tap', class extends AudioWorkletProcessor {
      process(inputs) {
        const samples = inputs[0]?.[0];
        if (!this.found && samples) {
          const index = samples.findIndex(sample => Math.abs(sample) > 0.05);
          if (index >= 0) { this.found = true; this.port.postMessage(currentTime + index / sampleRate); }
        }
        return true;
      }
    });`], { type: 'text/javascript' });
    const url = URL.createObjectURL(module);
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const tap = new AudioWorkletNode(context, 'replay-test-tap');
    tap.connect(context.destination); // Outputs silence; observes real rendered samples.
    tap.port.onmessage = event => { audit.transient = event.data; };
    const createSource = context.createBufferSource.bind(context);
    context.createBufferSource = () => { const source = createSource(); source.connect(tap); return source; };
    const until = performance.now() + 5000;
    const sample = () => {
      audit.frames.push({ now: performance.now(), media: document.querySelector('video')!.currentTime });
      if (performance.now() < until) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return audit.decodes;
  });
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { replayAudit: { transient?: number } }).replayAudit.transient)).toBeGreaterThan(0);
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.85);
  const measured = await page.evaluate(() => {
    const audit = (window as unknown as { replayAudit: { context: AudioContext; decodes: number; transient: number; frames: { now: number; media: number }[] } }).replayAudit;
    const stamp = audit.context.getOutputTimestamp();
    const atOutput = stamp.performanceTime! + (audit.transient - stamp.contextTime!) * 1000;
    const nearest = audit.frames.reduce((a, b) => Math.abs(a.now - atOutput) < Math.abs(b.now - atOutput) ? a : b);
    return { decodes: audit.decodes, mediaAtTransient: nearest.media, sampleDistanceMs: Math.abs(nearest.now - atOutput) };
  });
  await test.info().attach('rendered-sync-measurement', { body: JSON.stringify({ onset, ...measured }), contentType: 'application/json' });
  expect(before).toBeLessThanOrEqual(1);
  expect(measured.decodes).toBe(1);
  expect(measured.sampleDistanceMs).toBeLessThan(30);
  expect(Math.abs(measured.mediaAtTransient - onset)).toBeLessThan(0.06);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { replayAudit: { decodes: number } }).replayAudit.decodes)).toBe(1);
  await page.getByRole('button', { name: '停止播放', exact: true }).click();
  // A native start that never reaches playing must leave a retryable result,
  // rather than waiting forever while the independently scheduled voice runs.
  await page.evaluate(() => { HTMLMediaElement.prototype.play = () => new Promise<void>(() => {}); });
  await listen.click();
  await expect(page.getByRole('alert')).toContainText('视频暂时无法播放');
  await expect(listen).toBeEnabled();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
});
