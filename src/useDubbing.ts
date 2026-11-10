import { useEffect, useRef, useState, type RefObject } from 'react';
import { asset, type Pack, type Line } from './pack';
import { waveformStep } from './waveform';
import { encodePcmWav } from './pcm-recording';
import { audibleContextTime, decodeTake } from './audio-timing';

export type Take = { blob: Blob; url: string; duration: number; start: number; peaks: number[] };
export type Takes = Record<string, Take>;
type Phase = 'idle' | 'loading' | 'preview' | 'recording' | 'saving' | 'replay' | 'listening';

export function useDubbing(video: RefObject<HTMLVideoElement | null>, pack: Pack, onTake: (id: string, take: Take) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [liveStart, setLiveStart] = useState(0);
  const operation = useRef(0);
  const frame = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const waveformModule = useRef<Promise<void> | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const finishRecording = useRef<(() => void) | null>(null);
  const backing = useRef<AudioBuffer | null>(null);
  const decodedTakes = useRef(new WeakMap<Blob, Promise<AudioBuffer>>());
  const replayClock = useRef<{ context: AudioContext; start: number; startAt: number } | null>(null);
  const pendingReplay = useRef<(() => void) | null>(null);
  const captureCleanup = useRef<(() => void) | null>(null);
  const pendingSeek = useRef<AbortController | null>(null);
  const pendingCapture = useRef<AbortController | null>(null);

  function stop() {
    operation.current++;
    pendingReplay.current?.(); pendingReplay.current = null;
    replayClock.current = null;
    pendingSeek.current?.abort(); pendingSeek.current = null;
    pendingCapture.current?.abort(); pendingCapture.current = null;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    captureCleanup.current?.(); captureCleanup.current = null;
    finishRecording.current = null;
    for (const source of sources.current) { try { source.stop(); } catch { /* Already ended. */ } }
    sources.current = [];
    if (video.current) { video.current.pause(); video.current.muted = false; setTime(video.current.currentTime); }
    setLevel(0);
    setPhase('idle');
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
      void context.current?.close();
      context.current = null;
    };
  }, []);

  async function readyVideo(start: number, muted: boolean, play = true) {
    const el = video.current;
    if (!el || el.error) throw new Error('视频暂时无法播放，请重新加载片段。');
    const id = operation.current;
    el.muted = muted;
    if (Math.abs(el.currentTime - start) > 0.025) {
      const abort = new AbortController(); pendingSeek.current = abort;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('视频定位较慢，请稍后再试。')), 8000);
        const finish = (error?: Error) => { clearTimeout(timeout); el.removeEventListener('seeked', ready); el.removeEventListener('error', failed); abort.signal.removeEventListener('abort', cancelled); if (pendingSeek.current === abort) pendingSeek.current = null; error ? reject(error) : resolve(); };
        const ready = () => finish();
        const failed = () => finish(new Error('视频暂时无法播放，请重新加载片段。'));
        const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
        el.addEventListener('seeked', ready, { once: true }); el.addEventListener('error', failed, { once: true }); abort.signal.addEventListener('abort', cancelled, { once: true });
        el.currentTime = start;
      });
    }
    if (id !== operation.current) throw new DOMException('Cancelled', 'AbortError');
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      const abort = new AbortController(); pendingSeek.current = abort;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('视频定位较慢，请稍后再试。')), 8000);
        const finish = (error?: Error) => {
          clearTimeout(timeout); el.removeEventListener('canplay', ready); el.removeEventListener('error', failed); abort.signal.removeEventListener('abort', cancelled);
          if (pendingSeek.current === abort) pendingSeek.current = null;
          error ? reject(error) : resolve();
        };
        const ready = () => finish();
        const failed = () => finish(new Error('视频暂时无法播放，请重新加载片段。'));
        const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
        el.addEventListener('canplay', ready, { once: true }); el.addEventListener('error', failed, { once: true }); abort.signal.addEventListener('abort', cancelled, { once: true });
      });
    }
    if (id !== operation.current) throw new DOMException('Cancelled', 'AbortError');
    if (play) await el.play();
    return el;
  }

  function watch(id: number, end: number, takes?: Takes) {
    const tick = () => {
      const el = video.current;
      if (id !== operation.current || !el) return;
      if (takes && !el.ended && el.currentTime < end && (el.paused || el.seeking || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || el.playbackRate !== 1)) {
        stop(); setError('播放或录音暂时中断了，请再试一次。'); return;
      }
      const clock = replayClock.current;
      if (clock && !el.ended && el.currentTime < end) {
        const audible = clock.start + audibleContextTime(clock.context) - clock.startAt;
        // Stop rather than silently accepting a shifted dub after an output
        // device change or a picture startup/stall outside the sync tolerance.
        if (clock.context.state !== 'running' || Math.abs(audible - el.currentTime) > 0.12) {
          stop(); setError('播放或录音暂时中断了，请再试一次。'); return;
        }
      }
      if (takes) el.muted = pack.lines.some(line => takes[line.id] && el.currentTime >= line.start && el.currentTime < line.end);
      // Follow the media clock on every paint; throttling this made the playhead step.
      setTime(el.currentTime);
      if (el.ended || el.currentTime >= end) { setTime(Math.min(el.currentTime, pack.duration)); stop(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function preview(line?: Line) {
    stop(); setError(''); setPhase('loading');
    const id = operation.current;
    setTime(line?.start ?? 0);
    try {
      await readyVideo(line?.start ?? 0, false);
      if (id !== operation.current) return;
      setPhase('preview'); watch(id, line?.end ?? pack.duration);
    } catch (e) { if (id === operation.current) { stop(); setError(message(e)); } }
  }

  async function listen(take: Take, line: Line) {
    await replay({ [line.id]: take }, line);
  }

  async function record(line: Line) {
    stop(); setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setError('这个浏览器暂不支持录音。请用新版 Safari 或 Chrome 打开这个网址。'); return;
    }
    const id = operation.current;
    setPhase('loading');
    setLivePeaks([]); setLiveStart(line.start); setTime(line.start);
    try {
      context.current ??= new AudioContext();
      const ctx = context.current;
      // Safari can keep a context suspended until microphone permission resolves.
      void ctx.resume().catch(() => {});
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (id !== operation.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const input = ctx.createMediaStreamSource(captured);
      waveformModule.current ??= ctx.audioWorklet.addModule(new URL('./capture-waveform.worklet.js?no-inline', import.meta.url));
      try { await waveformModule.current; } catch (error) { waveformModule.current = null; throw error; }
      if (id !== operation.current) { input.disconnect(); return; }
      const detail = new AudioWorkletNode(ctx, 'capture-waveform', { channelCount: 1, channelCountMode: 'explicit' });
      input.connect(detail).connect(ctx.destination);
      const abort = new AbortController(); pendingCapture.current = abort;
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;
      const disconnectInput = () => {
        abort.abort(); clearTimeout(saveTimeout);
        if (pendingCapture.current === abort) pendingCapture.current = null;
        input.disconnect(); detail.disconnect(); detail.port.close();
      };
      captureCleanup.current = disconnectInput;
      await ctx.resume();
      if (id !== operation.current) return;
      const chunks: Float32Array[] = [], peaks: number[] = [];
      let captureContextStart = 0, captureStart = line.start, stopping = false;
      detail.port.onmessage = event => {
        if (id !== operation.current) return;
        const data = event.data;
        if (data.type === 'data') { chunks.push(data.samples); peaks.push(...data.peaks); }
        if (data.type !== 'stopped' || !stopping) return;
        // The audio thread sends its final partial block before this acknowledgement.
        disconnectInput();
        if (captureCleanup.current === disconnectInput) captureCleanup.current = null;
        captured.getTracks().forEach(track => track.stop());
        stream.current = null; finishRecording.current = null;
        const frames = chunks.reduce((total, chunk) => total + chunk.length, 0);
        const duration = frames / ctx.sampleRate;
        const preroll = Math.max(0, line.start - captureStart);
        const peak = peaks.slice(Math.ceil(preroll / waveformStep)).reduce((max, value) => Math.max(max, value), 0);
        setLevel(0); setPhase('idle');
        if (duration - preroll < 0.3 || peak < 0.003) {
          setError('没听到清楚的声音。靠近麦克风，再试一次吧。'); return;
        }
        const blob = encodePcmWav(chunks, ctx.sampleRate);
        onTake(line.id, { blob, url: URL.createObjectURL(blob), duration, start: captureStart, peaks });
      };
      detail.onprocessorerror = () => { if (id === operation.current) { stop(); setError('录音中断了，请再试一次。上一次录音还在。'); } };
      captured.getAudioTracks().forEach(track => { track.onended = () => {
        if (id === operation.current && !stopping) { stop(); setError('麦克风已断开，请连接后再试一次。'); }
      }; });
      const el = await readyVideo(line.start, true, false);
      if (id !== operation.current) return;
      // Acknowledge the first retained PCM frame before releasing the picture.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('录音准备较慢，请稍后再试。')), 8000);
        const finish = (error?: unknown) => {
          clearTimeout(timeout); detail.port.removeEventListener('message', ready); abort.signal.removeEventListener('abort', cancelled);
          error ? reject(error) : resolve();
        };
        const ready = (event: MessageEvent) => {
          if (event.data.type !== 'started') return;
          captureContextStart = event.data.time; finish();
        };
        const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
        detail.port.addEventListener('message', ready); abort.signal.addEventListener('abort', cancelled, { once: true });
        detail.port.postMessage('start');
      });
      if (id !== operation.current) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('视频定位较慢，请稍后再试。')), 8000);
        const finish = (error?: unknown) => {
          clearTimeout(timeout); el.removeEventListener('playing', playing); abort.signal.removeEventListener('abort', cancelled);
          error ? reject(error) : resolve();
        };
        const playing = () => {
          // Both the WAV and live peaks start at this exact audio-context frame.
          captureStart = el.currentTime - (ctx.currentTime - captureContextStart);
          setLiveStart(captureStart); finish();
        };
        const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
        el.addEventListener('playing', playing, { once: true }); abort.signal.addEventListener('abort', cancelled, { once: true });
        void el.play().catch(finish);
      });
      if (id !== operation.current) return;
      setPhase('recording');
      finishRecording.current = () => {
        if (stopping) return;
        stopping = true; cancelAnimationFrame(frame.current); el.pause(); setTime(el.currentTime); setPhase('saving');
        saveTimeout = setTimeout(() => { if (id === operation.current) { stop(); setError('录音中断了，请再试一次。上一次录音还在。'); } }, 8000);
        detail.port.postMessage('stop');
      };
      let shownPeaks = 0;
      const meter = () => {
        if (id !== operation.current || stopping) return;
        setTime(el.currentTime);
        if (el.ended || el.currentTime >= line.end) { finishRecording.current?.(); return; }
        if (ctx.state !== 'running' || el.paused || el.seeking || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || el.playbackRate !== 1) {
          stop(); setError('播放或录音暂时中断了，请再试一次。'); return;
        }
        if (peaks.length !== shownPeaks) {
          shownPeaks = peaks.length; setLivePeaks([...peaks]);
          setLevel(Math.min(1, (peaks.at(-1) ?? 0) * 3));
        }
        frame.current = requestAnimationFrame(meter);
      };
      frame.current = requestAnimationFrame(meter);
    } catch (e) { if (id === operation.current) { stop(); setError(message(e)); } }
  }

  async function replay(takes: Takes, line?: Line) {
    stop(); setError(''); setPhase('loading');
    const id = operation.current;
    const start = line?.start ?? 0;
    const end = line?.end ?? pack.duration;
    setTime(start);
    try {
      if (!pack.lines.some(line => takes[line.id])) {
        await readyVideo(start, false);
        if (id !== operation.current) return;
        setPhase(line ? 'listening' : 'replay'); watch(id, end); return;
      }
      context.current ??= new AudioContext();
      const ctx = context.current;
      await ctx.resume();
      const buffers = await Promise.all(pack.lines.filter(turn => takes[turn.id] && (!line || turn.id === line.id)).map(async line => ({
        line, buffer: await decodeTake(decodedTakes.current, ctx, takes[line.id].blob),
      })));
      if (buffers.length && pack.backing && !backing.current) {
        const response = await fetch(asset(pack, pack.backing));
        if (!response.ok) throw new Error('背景声音未加载成功，请再试一次。');
        backing.current = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      if (id !== operation.current) return;
      const el = await readyVideo(start, pack.lines.some(l => takes[l.id] && start >= l.start && start < l.end), false);
      if (id !== operation.current) return;
      // Schedule before starting the picture, so compensation never cuts the
      // opening syllable. One render quantum gives Web Audio its native lead.
      const startAt = ctx.currentTime + 128 / ctx.sampleRate;
      const base = startAt - start;
      if (buffers.length && backing.current) {
        const music = ctx.createBufferSource(); music.buffer = backing.current;
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime);
        for (const { line } of buffers) {
          gain.gain.setValueAtTime(0, base + line.start);
          gain.gain.linearRampToValueAtTime(1, base + line.start + 0.015);
          gain.gain.setValueAtTime(1, base + line.end - 0.015);
          gain.gain.linearRampToValueAtTime(0, base + line.end);
        }
        music.connect(gain).connect(ctx.destination); music.start(startAt, start);
        music.onended = () => gain.disconnect(); sources.current.push(music);
      }
      for (const { line, buffer } of buffers) {
        const takeStart = takes[line.id].start;
        const offset = Math.max(0, start - takeStart);
        const duration = Math.min(buffer.duration, line.end - takeStart) - offset;
        if (duration <= 0) continue;
        const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
        source.start(Math.max(startAt, base + takeStart), offset, duration);
        source.onended = () => source.disconnect(); sources.current.push(source);
      }
      replayClock.current = { context: ctx, start, startAt };
      // Start the prepared picture when that first sample reaches the output
      // device, rather than when it enters the render graph. The playing event
      // marks real startup; a delayed play() promise must not delay the watcher.
      await new Promise<void>((resolve, reject) => {
        let started = false;
        const delay = Math.max(0, (startAt - audibleContextTime(ctx)) * 1000);
        const cleanup = () => { clearTimeout(timer); clearTimeout(deadline); el.removeEventListener('playing', playing); el.removeEventListener('error', failed); if (pendingReplay.current === cancel) pendingReplay.current = null; };
        const playing = () => { started = true; cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('视频暂时无法播放，请重新加载片段。')); };
        const cancel = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        el.addEventListener('playing', playing, { once: true }); el.addEventListener('error', failed, { once: true });
        const timer = setTimeout(() => {
          if (id !== operation.current) { cancel(); return; }
          void el.play().catch(error => {
            if (!started) { cleanup(); reject(error); }
            else if (id === operation.current) { stop(); setError(message(error)); }
          });
        }, delay);
        const deadline = setTimeout(failed, delay + 120);
        pendingReplay.current = cancel;
      });
      if (id !== operation.current) return;
      setPhase(line ? 'listening' : 'replay'); watch(id, end, takes);
    } catch (e) { if (id === operation.current) { stop(); setError(message(e)); } }
  }

  return { phase, time, level, livePeaks, liveStart, error, setError, stop, preview, record, replay, listen, finish: () => finishRecording.current?.() };
}

function message(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return '麦克风还没开启。请在浏览器的网站设置里允许麦克风，再点录音。';
    if (error.name === 'NotFoundError') return '没有找到麦克风。请连接麦克风，再试一次。';
    if (error.name === 'NotReadableError') return '麦克风正被其他应用使用。关闭占用麦克风的应用，再试一次。';
  }
  return error instanceof Error ? error.message : '播放或录音暂时中断了，请再试一次。';
}
