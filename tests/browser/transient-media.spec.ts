import { test, expect } from './fixtures';
import { prepareMediaTest } from './media-fixture';

test.use({ sampleScene: true });

test('capture waits for a parked startup clock before moving the picture', async ({ page }) => {
  await prepareMediaTest(page);
  await page.addInitScript(() => {
    const Context = AudioContext, clock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!.get!;
    window.AudioContext = class extends Context {
      constructor(options?: AudioContextOptions) {
        super(options);
        const readyAt = performance.now() + 400;
        Object.defineProperty(this, 'currentTime', { get: () => performance.now() < readyAt ? 128 / this.sampleRate : clock.call(this) });
        document.addEventListener('playing', () => {
          (window as unknown as { pictureBeforeCaptureReady: boolean }).pictureBeforeCaptureReady = performance.now() < readyAt;
        }, { capture: true, once: true });
      }
    };
  });
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { pictureBeforeCaptureReady: boolean }).pictureBeforeCaptureReady)).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const lineIndex of [0, 1]) test(`recorded replay preserves its opening and picture sync with a slow speaker output (line ${lineIndex + 1})`, async ({ page }) => {
  const lines = await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  if (lineIndex) await page.getByRole('button', { name: lines[lineIndex], exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  await page.evaluate(async (lineIndex) => {
    const ctx = (window as unknown as { mediaAudit: { context: AudioContext } }).mediaAudit.context;
    const lag = lineIndex ? 0.5 : 0.25, stamp = ctx.getOutputTimestamp.bind(ctx);
    // Delay the actual rendered output as well as its reported device clock.
    // Merely changing the timestamp would test a broken clock, not a slow speaker.
    ctx.getOutputTimestamp = () => { const value = stamp(); return { ...value, contextTime: Math.max(0, value.contextTime! - lag) }; };
    const module = URL.createObjectURL(new Blob([`registerProcessor('speaker-tap', class extends AudioWorkletProcessor {
      process(inputs) {
        if (!this.found && inputs[0]?.[0]?.some(sample => Math.abs(sample) > 0.03)) {
          this.found = true; this.port.postMessage(currentTime);
        }
        return true;
      }
    });`], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(module); URL.revokeObjectURL(module);
    const tap = new AudioWorkletNode(ctx, 'speaker-tap'); tap.connect(ctx.destination);
    const audit = { onset: -1, offset: -1, duration: 0, nativeTimestamp: stamp, picture: [] as { now: number; time: number }[] };
    (window as unknown as { speakerAudit: typeof audit }).speakerAudit = audit;
    tap.port.onmessage = event => { audit.onset = event.data; };
    const create = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = create(), connect = source.connect.bind(source), start = source.start.bind(source);
      source.connect = ((destination: AudioNode) => {
        if (destination === ctx.destination && !source.loop) {
          const delay = ctx.createDelay(); delay.delayTime.value = lag;
          connect(delay); delay.connect(tap); delay.connect(destination); return destination;
        }
        return connect(destination);
      }) as typeof source.connect;
      source.start = (when = 0, offset = 0, duration?: number) => {
        if (!source.loop) { audit.offset = offset; audit.duration = duration!; }
        start(when, offset, duration);
      };
      return source;
    };
    const sample = () => {
      audit.picture.push({ now: performance.now(), time: document.querySelector('video')!.currentTime });
      if (audit.picture.length < 400) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, lineIndex);
  await listen.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { speakerAudit: { onset: number } }).speakerAudit.onset)).toBeGreaterThan(0);
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const measured = await page.evaluate(() => {
    const audit = (window as unknown as { speakerAudit: { onset: number; offset: number; duration: number; nativeTimestamp: () => AudioTimestamp; picture: { now: number; time: number }[] } }).speakerAudit;
    const stamp = audit.nativeTimestamp();
    const outputAt = stamp.performanceTime! + (audit.onset - stamp.contextTime!) * 1000;
    const nearest = audit.picture.reduce((a, b) => Math.abs(a.now - outputAt) < Math.abs(b.now - outputAt) ? a : b);
    return { duration: audit.duration, pictureAtOpening: nearest.time, sampleDistance: Math.abs(nearest.now - outputAt) };
  });
  await test.info().attach('slow-speaker-sync', { body: JSON.stringify(measured), contentType: 'application/json' });
  expect(measured.duration).toBeGreaterThan(0.9);
  expect(measured.sampleDistance).toBeLessThan(35);
  expect(Math.abs(measured.pictureAtOpening - (lineIndex ? 1.05 : 0))).toBeLessThan(0.12);
  await listen.click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Cancel after voice scheduling, during the speaker lead-in. The delayed
  // video start must be cancelled too, and the saved take must remain available.
  await page.evaluate(() => { (window as unknown as { speakerAudit: { duration: number } }).speakerAudit.duration = 0; });
  await listen.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { speakerAudit: { duration: number } }).speakerAudit.duration)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const stoppedAt = await page.evaluate(() => (window as unknown as { mediaAudit: { context: AudioContext } }).mediaAudit.context.currentTime);
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaAudit: { context: AudioContext } }).mediaAudit.context.currentTime)).toBeGreaterThan(stoppedAt + 0.7);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => (window as unknown as { mediaAudit: { sources: Set<AudioBufferSourceNode> } }).mediaAudit.sources.size)).toBe(0);
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
for (const fault of ['readiness', 'waiting', 'clock'] as const) for (const action of ['record', 'replay'] as const) test(`${action} tolerates transient ${fault} while the picture keeps advancing`, async ({ page }) => {
  await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const record = page.getByRole('button', { name: '开始录音', exact: true });
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  if (action === 'replay') { await record.click(); await expect(listen).toBeEnabled(); }
  await (action === 'record' ? record : listen).click();
  await expect(page.getByRole('button', { name: action === 'record' ? '停止录音' : '停止播放', exact: true })).toBeVisible();
  await page.evaluate(async ({ fault, action }) => {
    const video = document.querySelector('video')!;
    const context = (window as unknown as { mediaAudit: { context: AudioContext } }).mediaAudit.context!;
    const timestamp = context.getOutputTimestamp.bind(context);
    const clock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!.get!;
    if (fault === 'readiness') Object.defineProperty(video, 'readyState', { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA });
    if (fault === 'waiting') video.dispatchEvent(new Event('waiting'));
    if (fault === 'clock' && action === 'record') Object.defineProperty(context, 'currentTime', { configurable: true, get: () => clock.call(context) + 0.25 });
    if (fault === 'clock' && action === 'replay') context.getOutputTimestamp = () => { const stamp = timestamp(); return { ...stamp, contextTime: Math.max(0, stamp.contextTime! - 0.25) }; };
    await new Promise(resolve => setTimeout(resolve, 80));
    Reflect.deleteProperty(video, 'readyState');
    Reflect.deleteProperty(context, 'currentTime');
    context.getOutputTimestamp = timestamp;
    if (fault === 'waiting') video.dispatchEvent(new Event('playing'));
  }, { fault, action });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a captured take survives reload and produces real rendered audio during recorded replay', async ({ page }) => {
  await prepareMediaTest(page);
  await page.addInitScript(() => {
    const analysers: AnalyserNode[] = [];
    (window as unknown as { replayAnalysers: AnalyserNode[] }).replayAnalysers = analysers;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, output?: number, input?: number) {
      if (this instanceof AudioBufferSourceNode && !this.loop && this.buffer && destination === this.context.destination) {
        const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
        Reflect.apply(connect, this, [analyser, 0, 0]); Reflect.apply(connect, analyser, [destination, 0, 0]);
        analysers.push(analyser); return destination;
      }
      return Reflect.apply(connect, this, destination instanceof AudioParam ? [destination, output] : [destination, output, input]);
    } as typeof connect;
  });
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.reload();
  await expect(listen).toBeEnabled();
  await listen.click();
  await expect.poll(() => page.evaluate(() => {
    const analysers = (window as unknown as { replayAnalysers: AnalyserNode[] }).replayAnalysers;
    return Math.max(0, ...analysers.map(analyser => {
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      return Math.max(...samples.map(Math.abs));
    }));
  })).toBeGreaterThan(0.03);
  await expect(listen).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const action of ['record', 'replay'] as const) test(`${action} still rejects a persistent clock discrepancy`, async ({ page }) => {
  await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  const record = page.getByRole('button', { name: '开始录音', exact: true });
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  if (action === 'replay') { await record.click(); await expect(listen).toBeEnabled(); }
  await (action === 'record' ? record : listen).click();
  await expect(page.getByRole('button', { name: action === 'record' ? '停止录音' : '停止播放', exact: true })).toBeVisible();
  await page.evaluate(action => {
    const context = (window as unknown as { mediaAudit: { context: AudioContext } }).mediaAudit.context!;
    if (action === 'record') {
      const clock = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime')!.get!;
      Object.defineProperty(context, 'currentTime', { get: () => clock.call(context) + 0.25 });
    } else {
      const timestamp = context.getOutputTimestamp.bind(context);
      context.getOutputTimestamp = () => ({ ...timestamp(), contextTime: Math.max(0, context.currentTime - 0.5), performanceTime: performance.now() });
    }
  }, action);
  await expect(page.getByRole('alert')).toContainText('播放或录音暂时中断');
  expect(await page.evaluate(() => (window as unknown as { mediaAudit: { tracks: MediaStreamTrack[] } }).mediaAudit.tracks.every(track => track.readyState === 'ended'))).toBe(true);
  if (action === 'replay') await expect(listen).toBeEnabled();
});

test('an original preview reports a bounded buffering failure without losing recording controls', async ({ page }) => {
  await prepareMediaTest(page);
  await page.goto('/zh/scenes/patrick');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '听这一句原声', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const video = document.querySelector('video')!;
    const paused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!.get!.call(video);
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => paused });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
    Object.defineProperty(video, 'ended', { configurable: true, get: () => false });
    video.dispatchEvent(new Event('waiting'));
  });
  await expect(page.getByRole('status').filter({ hasText: '正在准备…' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('缓冲', { timeout: 10000 });
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
});
