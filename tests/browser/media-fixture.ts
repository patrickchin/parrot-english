import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Scene } from '../../src/scene';
import { routeShortScene } from './short-scene';

// Real video, PCM capture, Web Audio playback, and IndexedDB; only the mic
// hardware and remote content are substituted so runs are reproducible offline.
export async function prepareMediaTest(page: Page) {
  const scene: Scene = JSON.parse(await readFile('tests/fixtures/sintel/scene.json', 'utf8'));
  delete scene.backing;
  scene.roles = scene.roles.slice(0, 1);
  scene.duration = 3.2;
  scene.lines = scene.lines.filter(line => line.roleId === scene.roles[0].id).map((line, index) => ({
    ...line, start: 0.2 + index, end: 0.9 + index, words: undefined,
  }));
  await page.route('**/scenes/patrick/scene.json', route => route.fulfill({ json: scene }));
  await routeShortScene(page);
  await page.addInitScript(() => {
    const audit = {
      tracks: [] as MediaStreamTrack[], sources: new Set<AudioBufferSourceNode>(), microphoneDelay: 0,
      context: undefined as AudioContext | undefined, inputs: [] as AudioContext[],
      captures: [] as { frames: number; peak: number; sampleRate: number; started?: number; stopped?: number; inputClock?: number }[],
      playback: [] as Record<string, unknown>[],
    };
    (window as unknown as { mediaAudit: typeof audit }).mediaAudit = audit;
    let wasActive = false;
    const samplePlayback = () => {
      const video = document.querySelector('video'), context = audit.context;
      const active = !!video && (!video.paused || audit.sources.size > 0);
      if (video && context && (active || wasActive)) {
        audit.playback.push({ now: performance.now(), video: video.currentTime, paused: video.paused, seeking: video.seeking,
          readyState: video.readyState, audio: context.currentTime, state: context.state, timestamp: context.getOutputTimestamp(),
          baseLatency: context.baseLatency, outputLatency: context.outputLatency });
        if (audit.playback.length > 240) audit.playback.shift();
      }
      wasActive = active; requestAnimationFrame(samplePlayback);
    };
    requestAnimationFrame(samplePlayback);
    const NativeContext = AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); audit.context = this; }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => { start(...args); audit.sources.add(source); };
        source.stop = (...args) => { stop(...args); audit.sources.delete(source); };
        source.addEventListener('ended', () => audit.sources.delete(source));
        return source;
      }
    };
    const NativeWorklet = AudioWorkletNode;
    window.AudioWorkletNode = class extends NativeWorklet {
      constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
        super(context, name, options);
        if (name !== 'capture-waveform') return;
        const capture = { frames: 0, peak: 0, sampleRate: context.sampleRate } as typeof audit.captures[number];
        audit.captures.push(capture);
        this.port.addEventListener('message', event => {
          if (event.data.type === 'started') { capture.started = event.data.time; capture.inputClock = audit.inputs.at(-1)?.currentTime; }
          if (event.data.type === 'stopped') capture.stopped = context.currentTime;
          if (event.data.type === 'data') {
            capture.frames += event.data.samples.length;
            capture.peak = Math.max(capture.peak, ...event.data.peaks);
          }
        });
      }
    };
    let microphone: Promise<MediaStream> | undefined;
    async function microphoneSignal() {
      const context = new NativeContext();
      audit.inputs.push(context);
      const oscillator = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
      gain.gain.value = 0.2; oscillator.connect(gain).connect(output);
      // Model one continuously running hardware input. Repeatedly opening and
      // closing generator contexts can park WebKit's synthetic audio clock.
      const silent = context.createGain(); silent.gain.value = 0;
      oscillator.connect(silent).connect(context.destination); oscillator.start();
      await context.resume();
      const until = performance.now() + 8000;
      while (context.currentTime < 256 / context.sampleRate) {
        if (performance.now() > until) throw new Error('Synthetic microphone clock did not start');
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      return output.stream;
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      await new Promise(resolve => setTimeout(resolve, audit.microphoneDelay));
      const stream = (await (microphone ??= microphoneSignal())).clone();
      audit.tracks.push(...stream.getTracks());
      return stream;
    } } });
  });
  return scene.lines.map((line, index) => `第 ${index + 1} 句：${line.text}`);
}

export type MediaAudit = {
  tracks: MediaStreamTrack[]; sources: Set<AudioBufferSourceNode>; microphoneDelay: number; context?: AudioContext;
  inputs: AudioContext[]; captures: { frames: number; peak: number; sampleRate: number; started?: number; stopped?: number; inputClock?: number }[];
  playback: Record<string, unknown>[];
};
