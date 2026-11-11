import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('a short Joey line has moving video context and retains early and late voice through replay and saving', async ({ page }, info) => {
  await page.addInitScript(() => {
    type Probe = { blob?: Blob; videoStart?: number; leadInAudible?: boolean; replayVoiceDuration?: number };
    const probe: Probe = {};
    (window as unknown as { leadInProbe: Probe }).leadInProbe = probe;
    const nativeURL = URL.createObjectURL;
    URL.createObjectURL = function (object) {
      if (object instanceof Blob && object.type.startsWith('audio/')) probe.blob = object;
      return nativeURL.call(URL, object);
    };
    const NativeContext = AudioContext;
    window.AudioContext = class extends NativeContext {
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (when = 0, offset = 0, duration?: number) => {
          const samples = source.buffer!.getChannelData(0).subarray(Math.round(offset * this.sampleRate), duration === undefined ? undefined : Math.round((offset + duration) * this.sampleRate));
          const first = samples.findIndex(sample => Math.abs(sample) > 0.03);
          let last = samples.length - 1;
          while (last >= 0 && Math.abs(samples[last]) < 0.03) last--;
          probe.replayVoiceDuration = (last - first) / this.sampleRate;
          return start(when, offset, duration);
        };
        return source;
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      const context = new NativeContext(); await context.resume();
      const tone = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
      tone.connect(gain).connect(output); gain.gain.value = 0; tone.start();
      const video = document.querySelector('video')!;
      video.addEventListener('playing', () => {
        probe.videoStart = video.currentTime; probe.leadInAudible = !video.muted;
        // Voice begins 200 ms before the target and finishes 350 ms after it.
        const origin = context.currentTime - video.currentTime;
        gain.gain.setValueAtTime(0.2, origin + 9.765);
        gain.gain.setValueAtTime(0, origin + 10.935);
      }, { once: true });
      const track = output.stream.getAudioTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { stop(); void context.close(); };
      return output.stream;
    } } });
  });
  await page.goto('/#friends-thesaurus');
  await page.getByRole('button', { name: '乔伊 3 句台词', exact: true }).click();
  await page.getByRole('button', { name: '开始配音', exact: true }).click();
  await page.getByRole('button', { name: "第 2 句：What'd I just say?", exact: true }).click();
  const cursor = page.getByRole('progressbar', { name: '配音时间指针', exact: true });
  await expect(cursor).toHaveAttribute('aria-valuemax', '1.62');
  const target = page.getByRole('img', { name: '台词时间范围', exact: true });
  const graph = page.getByRole('region', { name: '声音波形对比', exact: true });
  // The target visibly begins after the runway on both desktop and phone.
  const [targetBox, cursorBox] = await Promise.all([target.boundingBox(), cursor.boundingBox()]);
  expect(targetBox!.x - cursorBox!.x).toBeGreaterThan(50);
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止录音', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await cursor.getAttribute('aria-valuenow'))).toBeGreaterThan(0.1);
  await expect(page.locator('video')).toHaveJSProperty('muted', true);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  const capture = await page.evaluate(async () => {
    const probe = (window as unknown as { leadInProbe: { blob: Blob; videoStart: number; leadInAudible: boolean } }).leadInProbe;
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await probe.blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const first = samples.findIndex(sample => Math.abs(sample) > 0.03);
    let last = samples.length - 1;
    while (last >= 0 && Math.abs(samples[last]) < 0.03) last--;
    await context.close();
    return { videoStart: probe.videoStart, leadInAudible: probe.leadInAudible, duration: buffer.duration, voiceDuration: (last - first) / buffer.sampleRate };
  });
  expect(capture.videoStart).toBeCloseTo(9.465, 1);
  expect(capture.leadInAudible).toBe(true);
  expect(capture.duration).toBeGreaterThan(1.6);
  expect(capture.voiceDuration).toBeGreaterThan(1.12);
  expect(capture.voiceDuration).toBeLessThan(1.22);
  const stoppedAt = await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
  expect(stoppedAt).toBeGreaterThanOrEqual(11.085);
  expect(stoppedAt).toBeLessThan(11.2);
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '听我的录音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止播放', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { leadInProbe: { replayVoiceDuration: number } }).leadInProbe.replayVoiceDuration)).toBeGreaterThan(1.12);
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(10.7);
  await expect(page.getByRole('button', { name: '听我的录音', exact: true })).toBeEnabled();
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(11.085);
  await expect(page.getByRole('alert')).toHaveCount(0);
  if (info.project.name === 'chromium') {
    const folder = join(homedir(), 'Pictures/Screenshots/Codex/parrot-english');
    await mkdir(folder, { recursive: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await expect(graph).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: join(folder, `recording-lead-in-${width}.png`), fullPage: true });
    }
  }
});

test('export retains padded voice, keeps surrounding original audio, and protects neighboring speakers', async ({ page }) => {
  await page.goto('/');
  const levels = await page.evaluate(async () => {
    const mixerPath = '/src/export-dub.ts', wavPath = '/src/pcm-recording.ts';
    const { mixDubAudio } = await import(mixerPath);
    const { encodePcmWav } = await import(wavPath);
    const wav = (level: number) => encodePcmWav([new Float32Array(48000 * 4).fill(level)], 48000);
    const pack = { duration: 4, lines: [{ id: 'line_previous', start: 0, end: 1 }, { id: 'line_short', start: 1.4, end: 2.02 }, { id: 'line_next', start: 2.82, end: 4 }] };
    const takes = { line_short: { start: 0.9, blob: wav(0.4) } };
    const result: AudioBuffer = await mixDubAudio(pack, takes, await wav(0.1).arrayBuffer());
    return [0.95, 1.1, 1.3, 1.5, 2.1, 2.5, 2.9].map(time => result.getChannelData(0)[Math.round(time * 48000)]);
  });
  for (const [index, level] of [0.1, 0.1, 0.5, 0.4, 0.5, 0.1, 0.1].entries()) expect(levels[index]).toBeCloseTo(level, 3);
});
