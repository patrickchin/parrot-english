import { useEffect, useRef, useState, type RefObject } from 'react';
import { asset, type Pack, type Line } from './pack';

export type Take = { blob: Blob; url: string; duration: number; peaks: number[] };
export type Takes = Record<string, Take>;
type Phase = 'idle' | 'loading' | 'preview' | 'recording' | 'saving' | 'replay' | 'listening';

export function useDubbing(video: RefObject<HTMLVideoElement | null>, pack: Pack, onTake: (id: string, take: Take) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const operation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const context = useRef<AudioContext | null>(null);
  const waveformModule = useRef<Promise<void> | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const finishRecording = useRef<(() => void) | null>(null);
  const backing = useRef<AudioBuffer | null>(null);
  const lastTick = useRef(0);
  const captureCleanup = useRef<(() => void) | null>(null);
  const pendingSeek = useRef<AbortController | null>(null);

  function stop() {
    operation.current++;
    pendingSeek.current?.abort(); pendingSeek.current = null;
    if (timer.current) clearTimeout(timer.current);
    cancelAnimationFrame(frame.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    recorder.current = null;
    captureCleanup.current?.(); captureCleanup.current = null;
    finishRecording.current = null;
    for (const source of sources.current) { try { source.stop(); } catch { /* Already ended. */ } }
    sources.current = [];
    if (video.current) { video.current.pause(); video.current.muted = false; }
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

  async function readyVideo(start: number, muted: boolean) {
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
    await el.play();
    return el;
  }

  function watch(id: number, end: number, takes?: Takes) {
    const tick = () => {
      const el = video.current;
      if (id !== operation.current || !el) return;
      if (takes) el.muted = pack.lines.some(line => takes[line.id] && el.currentTime >= line.start && el.currentTime < line.end);
      if (el.currentTime - lastTick.current > 0.08 || el.currentTime < lastTick.current) {
        setTime(el.currentTime); lastTick.current = el.currentTime;
      }
      if (el.ended || el.currentTime >= end) { setTime(Math.min(el.currentTime, pack.duration)); stop(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function preview(line?: Line) {
    stop(); setError(''); setPhase('loading');
    const id = operation.current;
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('这个浏览器暂不支持录音。请用新版 Safari 或 Chrome 打开这个网址。'); return;
    }
    const id = operation.current;
    setPhase('loading');
    setLivePeaks([]); setTime(line.start);
    try {
      context.current ??= new AudioContext();
      // Request capture before waiting on Web Audio: Safari can keep a context
      // suspended until microphone permission is resolved.
      void context.current.resume().catch(() => {});
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (id !== operation.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(captured, mimeType ? { mimeType } : undefined);
      recorder.current = capture;
      const input = context.current.createMediaStreamSource(captured);
      waveformModule.current ??= context.current.audioWorklet.addModule(new URL('./capture-waveform.worklet.js?no-inline', import.meta.url));
      try { await waveformModule.current; } catch (error) { waveformModule.current = null; throw error; }
      if (id !== operation.current) { input.disconnect(); return; }
      const detail = new AudioWorkletNode(context.current, 'capture-waveform', { channelCount: 1 });
      input.connect(detail).connect(context.current.destination);
      const disconnectInput = () => { input.disconnect(); detail.disconnect(); detail.port.close(); };
      captureCleanup.current = disconnectInput;
      void context.current.resume().catch(() => {});
      let peak = 0;
      const peaks: number[] = [];
      detail.port.onmessage = event => {
        if (id !== operation.current || capture.state !== 'recording') return;
        for (const value of event.data as number[]) { peaks.push(value); peak = Math.max(peak, value); }
      };
      const chunks: Blob[] = [];
      let started = 0;
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => {
        disconnectInput();
        if (captureCleanup.current === disconnectInput) captureCleanup.current = null;
        if (id !== operation.current) return;
        if (timer.current) clearTimeout(timer.current);
        cancelAnimationFrame(frame.current);
        video.current?.pause();
        captured.getTracks().forEach(track => track.stop());
        stream.current = null; recorder.current = null; finishRecording.current = null;
        const blob = new Blob(chunks, { type: capture.mimeType });
        const duration = (performance.now() - started) / 1000;
        setLevel(0); setPhase('idle');
        if (!blob.size || duration < 0.3 || peak < 0.003) {
          setError('没听到清楚的声音。靠近麦克风，再试一次吧。'); return;
        }
        onTake(line.id, { blob, url: URL.createObjectURL(blob), duration, peaks });
      };
      capture.onerror = () => { if (id === operation.current) { stop(); setError('录音中断了，请再试一次。上一次录音还在。'); } };
      captured.getAudioTracks().forEach(track => { track.onended = () => {
        if (id === operation.current && capture.state === 'recording') { stop(); setError('麦克风已断开，请连接后再试一次。'); }
      }; });
      await readyVideo(line.start, true);
      if (id !== operation.current) return;
      started = performance.now(); detail.port.postMessage('start'); capture.start(); setPhase('recording');
      finishRecording.current = () => {
        if (capture.state === 'recording') { setPhase('saving'); capture.stop(); }
      };
      const meter = () => {
        if (id !== operation.current || capture.state !== 'recording') return;
        setLivePeaks([...peaks]);
        setLevel(Math.min(1, (peaks.at(-1) ?? 0) * 3));
        setTime(video.current?.currentTime ?? line.start);
        frame.current = requestAnimationFrame(meter);
      };
      frame.current = requestAnimationFrame(meter);
      timer.current = setTimeout(() => finishRecording.current?.(), (line.end - line.start) * 1000);
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
      const buffers = await Promise.all(pack.lines.filter(line => takes[line.id]).map(async line => ({
        line, buffer: await ctx.decodeAudioData(await takes[line.id].blob.arrayBuffer()),
      })));
      if (buffers.length && pack.backing && !backing.current) {
        const response = await fetch(asset(pack, pack.backing));
        if (!response.ok) throw new Error('背景声音未加载成功，请再试一次。');
        backing.current = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      if (id !== operation.current) return;
      const el = await readyVideo(start, pack.lines.some(l => takes[l.id] && start >= l.start && start < l.end));
      if (id !== operation.current) return;
      const base = ctx.currentTime - el.currentTime;
      if (buffers.length && backing.current) {
        const music = ctx.createBufferSource(); music.buffer = backing.current;
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime);
        for (const { line } of buffers) {
          gain.gain.setValueAtTime(0, base + line.start);
          gain.gain.linearRampToValueAtTime(1, base + line.start + 0.015);
          gain.gain.setValueAtTime(1, base + line.end - 0.015);
          gain.gain.linearRampToValueAtTime(0, base + line.end);
        }
        music.connect(gain).connect(ctx.destination); music.start(ctx.currentTime, Math.max(0, el.currentTime));
        music.onended = () => gain.disconnect(); sources.current.push(music);
      }
      for (const { line, buffer } of buffers) {
        const offset = Math.max(0, el.currentTime - line.start);
        const duration = Math.min(buffer.duration, line.end - line.start) - offset;
        if (duration <= 0) continue;
        const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
        source.start(Math.max(ctx.currentTime, base + line.start), offset, duration);
        source.onended = () => source.disconnect(); sources.current.push(source);
      }
      setPhase(line ? 'listening' : 'replay'); watch(id, end, takes);
    } catch (e) { if (id === operation.current) { stop(); setError(message(e)); } }
  }

  return { phase, time, level, livePeaks, error, setError, stop, preview, record, replay, listen, finish: () => finishRecording.current?.() };
}

function message(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') return '麦克风还没开启。请在浏览器的网站设置里允许麦克风，再点录音。';
    if (error.name === 'NotFoundError') return '没有找到麦克风。请连接麦克风，再试一次。';
    if (error.name === 'NotReadableError') return '麦克风正被其他应用使用。关闭占用麦克风的应用，再试一次。';
  }
  return error instanceof Error ? error.message : '播放或录音暂时中断了，请再试一次。';
}
