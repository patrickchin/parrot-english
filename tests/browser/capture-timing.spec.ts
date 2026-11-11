import { test, expect } from './fixtures';

// Exercise real encoder output, including the first sound after the picture starts.
test('capture is ready before the picture and preserves the opening sound through delayed startup', async ({ page }) => {
  await page.addInitScript(() => {
    type CaptureWindow = Window & { captureAtPlay?: boolean; captureReady?: boolean; context?: BaseAudioContext; sampleZero?: number; clipOrigin?: number };
    const state = window as CaptureWindow;
    const NativeWorklet = AudioWorkletNode;
    Object.defineProperty(window, 'AudioWorkletNode', { configurable: true, value: class extends NativeWorklet {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        if (name !== 'capture-waveform') return;
        state.context = context;
        this.port.addEventListener('message', event => { if (event.data.type === 'started') { state.captureReady = true; state.sampleZero = event.data.time; } });
        const post = this.port.postMessage.bind(this.port);
        Object.defineProperty(this.port, 'postMessage', { value: (message: unknown) => {
          if (message === 'start') setTimeout(() => post(message), 180); else post(message);
        } });
      }
    } });
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function () {
      await nativePlay.call(this);
      await new Promise(resolve => setTimeout(resolve, 350));
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new AudioContext(); await context.resume();
      const signal = context.createOscillator(), gain = context.createGain();
      const output = context.createMediaStreamDestination();
      // Put the voice only on the right channel; native mono downmix must retain it.
      const stereo = context.createChannelMerger(2);
      gain.gain.value = 0; signal.connect(gain); gain.connect(stereo, 0, 1); stereo.connect(output); signal.start();
      document.querySelector('video')!.addEventListener('playing', () => {
        state.captureAtPlay = state.captureReady;
        state.clipOrigin = document.querySelector('video')!.currentTime - (state.context!.currentTime - state.sampleZero!);
        // Only the opening 90 ms contains sound. A late recorder loses it entirely.
        gain.gain.setValueAtTime(0.2, context.currentTime);
        gain.gain.setValueAtTime(0, context.currentTime + 0.09);
      }, { once: true });
      const track = output.stream.getAudioTracks()[0];
      const nativeStop = track.stop.bind(track);
      track.stop = () => { nativeStop(); void context.close(); };
      return output.stream;
    } } });
  });
  await page.goto('/scenes/onions');
  const scene = await (await page.request.get('/scenes/onions/scene.json')).json();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  const stop = page.getByRole('button', { name: '停止录音', exact: true });
  await expect(stop).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { captureAtPlay?: boolean }).captureAtPlay)).toBe(true);
  const cursor = page.getByRole('progressbar', { name: '配音时间指针' });
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.65);
  await stop.click();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const signal = await page.evaluate(async scene => {
    const path = '/src/dub-store.ts';
    const { loadDub } = await import(path) as typeof import('../../src/dub-store');
    const draft = await loadDub(location.pathname.split('/').at(-1)!, scene);
    const progress = Object.values(draft.lesson.progress).find(line => line.status === 'recorded')!;
    if (progress.status !== 'recorded') throw new Error('No recorded take');
    const blob = progress.take.blob;
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    await context.close();
    const firstSample = samples.findIndex(sample => Math.abs(sample) > 0.03);
    const origin = (window as Window & { clipOrigin?: number }).clipOrigin!;
    return { peak, duration: buffer.duration, onset: origin + firstSample / buffer.sampleRate };
  }, scene);
  expect(signal.peak).toBeGreaterThan(0.03);
  expect(signal.duration).toBeGreaterThan(0.65);
  const onset = await page.getByRole('img', { name: '你的声音波形', exact: true }).locator('path').evaluate((path, line) => {
    const first = [...path.getAttribute('d')!.matchAll(/L([\d.]+) ([\d.]+)/g)].find(point => Number(point[2]) < 39)!;
    return line.start + Number(first[1]) / 1000 * (line.end - line.start);
  }, scene.lines[0]);
  // Compare real encoded PCM to its plotted envelope, not to an assumed mic latency.
  expect(Math.abs(onset - signal.onset)).toBeLessThan(0.02);
  const savedWave = await page.getByRole('img', { name: '你的声音波形', exact: true }).locator('path').getAttribute('d');
  await page.getByRole('button', { name: '重新录这一句', exact: true }).click();
  await expect(stop).toBeVisible();
  await page.evaluate(() => (window as unknown as { context: AudioContext }).context.suspend());
  await expect(page.getByRole('alert')).toContainText('播放或录音暂时中断');
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await expect(page.getByRole('img', { name: '你的声音波形', exact: true }).locator('path')).toHaveAttribute('d', savedWave!);
});

test('cancelling while recorder startup is pending keeps the picture paused and releases the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    type CaptureWindow = Window & { pendingCapture?: boolean; captureTracks?: MediaStreamTrack[] };
    const state = window as CaptureWindow;
    const NativeWorklet = AudioWorkletNode;
    Object.defineProperty(window, 'AudioWorkletNode', { configurable: true, value: class extends NativeWorklet {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        if (name !== 'capture-waveform') return;
        const post = this.port.postMessage.bind(this.port);
        Object.defineProperty(this.port, 'postMessage', { value: (message: unknown) => {
          // Withhold readiness to exercise cancellation before the first sample.
          if (message === 'start') state.pendingCapture = true; else post(message);
        } });
      }
    } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new AudioContext(); await context.resume();
      const signal = context.createOscillator(), output = context.createMediaStreamDestination();
      signal.connect(output); signal.start();
      state.captureTracks = output.stream.getTracks();
      for (const track of state.captureTracks) {
        const nativeStop = track.stop.bind(track);
        track.stop = () => { nativeStop(); void context.close(); };
      }
      return output.stream;
    } } });
  });
  await page.goto('/scenes/onions');
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { pendingCapture?: boolean }).pendingCapture)).toBe(true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => (window as unknown as Window & { captureTracks: MediaStreamTrack[] }).captureTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '开始录音', exact: true })).toBeEnabled();
});
