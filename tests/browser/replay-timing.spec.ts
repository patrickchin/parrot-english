import { test, expect } from './fixtures';

test('replay reuses decoded takes and aligns a rendered audio transient with the picture', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeContext = AudioContext;
    type Audit = { context: AudioContext; decodes: number; transient?: number; frames: { now: number; media: number }[] };
    const audit = { decodes: 0, frames: [] } as unknown as Audit;
    (window as unknown as { replayAudit: Audit }).replayAudit = audit;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); audit.context = this; }
      decodeAudioData(bytes: ArrayBuffer) { audit.decodes++; return super.decodeAudioData(bytes); }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new NativeContext(); await context.resume();
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
  await page.route('**/packs/onions/pack.json', async route => {
    const pack = await (await route.fetch()).json();
    delete pack.backing;
    await route.fulfill({ json: pack });
  });
  await page.goto('/#onions');
  const pack = await (await page.request.get('/packs/onions/pack.json')).json();
  const line = pack.lines[0];
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const cursor = page.getByRole('progressbar', { name: '配音时间指针' });
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(1.1);
  await page.getByRole('button', { name: '停止录音', exact: true }).click();
  const listen = page.getByRole('button', { name: '听我的录音', exact: true });
  await expect(listen).toBeEnabled();
  const onset = await page.getByRole('img', { name: '你的声音波形', exact: true }).locator('path').evaluate((path, line) => {
    const first = [...path.getAttribute('d')!.matchAll(/L([\d.]+) ([\d.]+)/g)].find(point => Number(point[2]) < 35)!;
    return line.start + Number(first[1]) / 1000 * (line.end - line.start);
  }, line);
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
