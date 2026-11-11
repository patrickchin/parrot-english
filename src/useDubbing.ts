import { useEffect, useRef, useState, type RefObject } from 'react';
import { asset, type Scene, type Line } from './scene';
import { waveformStep } from './waveform';
import { encodePcmWav } from './pcm-recording';
import { audibleContextTime, decodeTake, waitForAudioClock } from './audio-timing';
import { idleMedia, transitionMedia, type Activity, type MediaEvent } from './media-state';
import { waitForVideo } from './video-events';
import { lineWindow } from './line-window';

export type Take = { blob: Blob; duration: number; start: number; peaks: number[] };
export type Takes = Record<string, Take>;

export function useDubbing(video: RefObject<HTMLVideoElement | null>, scene: Scene, onTake: (id: string, take: Take) => void) {
  // Worklet callbacks and rendering share one machine, including before React
  // commits a render. This prevents a second capture lifecycle drifting from it.
  const machine = useRef(idleMedia);
  const [state, setState] = useState(idleMedia);
  function dispatch(event: MediaEvent) {
    machine.current = transitionMedia(machine.current, event);
    setState(machine.current);
  }
  const phase = state.phase;
  const error = state.phase === 'idle' ? state.error : '';
  const [time, setTime] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [liveStart, setLiveStart] = useState(0);
  const operation = useRef(0);
  const cancellation = useRef(new AbortController());
  const frame = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const waveformModule = useRef<Promise<void> | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const finishRecording = useRef<(() => void) | null>(null);
  const backing = useRef<AudioBuffer | null>(null);
  const decodedTakes = useRef(new WeakMap<Blob, Promise<AudioBuffer>>());
  const replayClock = useRef<{ context: AudioContext; start: number; startAt: number } | null>(null);
  const captureCleanup = useRef<(() => void) | null>(null);

  function release() {
    operation.current++;
    cancellation.current.abort(); cancellation.current = new AbortController();
    replayClock.current = null;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    captureCleanup.current?.(); captureCleanup.current = null;
    finishRecording.current = null;
    for (const source of sources.current) { try { source.stop(); } catch { /* Already ended. */ } }
    sources.current = [];
    if (video.current) { video.current.pause(); video.current.muted = false; setTime(video.current.currentTime); }
  }

  function stop(error?: string) {
    release();
    dispatch({ type: 'STOP', error });
  }

  function setError(error: string) {
    if (error) stop(error); else dispatch({ type: 'CLEAR_ERROR' });
  }
  function begin(activity: Activity) {
    stop();
    const id = operation.current;
    dispatch({ type: 'START', operation: id, activity });
    return id;
  }
  function advance(type: Exclude<MediaEvent['type'], 'START' | 'STOP' | 'CLEAR_ERROR'>, id: number) {
    dispatch({ type, operation: id });
  }
  function fail(id: number, error: unknown) { if (id === operation.current) stop(message(error)); }
  function playVideo(el: HTMLVideoElement, id: number, options: Parameters<typeof waitForVideo>[3] = {}) {
    if (id !== operation.current) throw new DOMException('Cancelled', 'AbortError');
    return waitForVideo(el, 'playing', cancellation.current.signal, {
      start: () => el.play(), onLateError: error => fail(id, error), ...options,
    });
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
      void context.current?.close();
      context.current = null; waveformModule.current = null;
    };
  }, []);

  async function readyVideo(start: number, muted: boolean) {
    const el = video.current;
    if (!el || el.error) throw new Error("errors.videoPlayback");
    const id = operation.current, signal = cancellation.current.signal;
    el.muted = muted;
    if (Math.abs(el.currentTime - start) > 0.025) {
      await waitForVideo(el, 'seeked', signal, { start: () => { el.currentTime = start; } });
    } else if (el.seeking) {
      // currentTime changes before a seek settles, including a reset to zero.
      await waitForVideo(el, 'seeked', signal);
    }
    signal.throwIfAborted();
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await waitForVideo(el, 'canplay', signal);
    signal.throwIfAborted();
    advance('VIDEO_READY', id);
    return el;
  }

  function watch(id: number, end: number, takes?: Takes) {
    const tick = () => {
      const el = video.current;
      if (id !== operation.current || !el) return;
      if (!el.ended && el.currentTime < end && (el.paused || el.seeking || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || el.playbackRate !== 1)) {
        stop("errors.mediaInterrupted"); return;
      }
      const clock = replayClock.current;
      if (clock && !el.ended && el.currentTime < end) {
        const audible = clock.start + audibleContextTime(clock.context) - clock.startAt;
        // Stop rather than silently accepting a shifted dub after an output
        // device change or a picture startup/stall outside the sync tolerance.
        if (clock.context.state !== 'running' || Math.abs(audible - el.currentTime) > 0.12) {
          stop("errors.mediaInterrupted"); return;
        }
      }
      if (takes) el.muted = scene.lines.some(line => takes[line.id] && el.currentTime >= line.start && el.currentTime < line.end);
      // Follow the media clock on every paint; throttling this made the playhead step.
      setTime(el.currentTime);
      if (el.ended || el.currentTime >= end) { setTime(Math.min(el.currentTime, scene.duration)); stop(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function preview(line?: Line) {
    const id = begin('preview');
    setTime(line?.start ?? 0);
    try {
      const el = await readyVideo(line?.start ?? 0, false);
      await playVideo(el, id);
      if (id !== operation.current) return;
      advance('PLAYING', id); watch(id, line?.end ?? scene.duration);
    } catch (e) { fail(id, e); }
  }

  async function listen(take: Take, line: Line) {
    await replay({ [line.id]: take }, line);
  }

  async function record(line: Line) {
    const id = begin('recording');
    const window = lineWindow(scene, line);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setError("errors.recordingUnsupported"); return;
    }
    setLivePeaks([]); setLiveStart(window.start); setTime(window.start);
    try {
      context.current ??= new AudioContext();
      const ctx = context.current;
      // Safari can keep a context suspended until microphone permission resolves.
      void ctx.resume().catch(() => {});
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (id !== operation.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured; advance('MICROPHONE_GRANTED', id);
      const input = ctx.createMediaStreamSource(captured);
      captureCleanup.current = () => input.disconnect();
      waveformModule.current ??= ctx.audioWorklet.addModule(new URL('./capture-waveform.worklet.js?no-inline', import.meta.url));
      try { await waveformModule.current; } catch (error) { waveformModule.current = null; throw error; }
      if (id !== operation.current) { input.disconnect(); return; }
      advance('WORKLET_READY', id);
      const detail = new AudioWorkletNode(ctx, 'capture-waveform', { channelCount: 1, channelCountMode: 'explicit' });
      input.connect(detail).connect(ctx.destination);
      const signal = cancellation.current.signal;
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;
      const disconnectInput = () => {
        clearTimeout(saveTimeout);
        input.disconnect(); detail.disconnect(); detail.port.close();
      };
      captureCleanup.current = disconnectInput;
      await ctx.resume();
      if (id !== operation.current) return;
      advance('AUDIO_READY', id);
      const chunks: Float32Array[] = [], peaks: number[] = [];
      let captureContextStart = 0, captureStart = window.start;
      detail.port.onmessage = event => {
        if (id !== operation.current) return;
        const data = event.data;
        if (data.type === 'data') { chunks.push(data.samples); peaks.push(...data.peaks); }
        if (data.type !== 'stopped' || machine.current.phase !== 'saving') return;
        // The audio thread sends its final partial block before this acknowledgement.
        disconnectInput();
        if (captureCleanup.current === disconnectInput) captureCleanup.current = null;
        captured.getTracks().forEach(track => track.stop());
        stream.current = null; finishRecording.current = null;
        const frames = chunks.reduce((total, chunk) => total + chunk.length, 0);
        const duration = frames / ctx.sampleRate;
        const preroll = Math.max(0, window.voiceStart - captureStart);
        const peak = peaks.slice(Math.ceil(preroll / waveformStep), Math.ceil((window.voiceEnd - captureStart) / waveformStep)).reduce((max, value) => Math.max(max, value), 0);
        if (duration - preroll < 0.3 || peak < 0.003) {
          setError("errors.quietRecording"); return;
        }
        const blob = encodePcmWav(chunks, ctx.sampleRate);
        onTake(line.id, { blob, duration, start: captureStart, peaks });
        release();
        advance('SAVED', id);
      };
      detail.onprocessorerror = () => { if (id === operation.current) stop("errors.recordingInterrupted"); };
      captured.getAudioTracks().forEach(track => { track.onended = () => {
        if (id === operation.current && (machine.current.phase === 'loading' || machine.current.phase === 'recording')) stop("errors.microphoneDisconnected");
      }; });
      const el = await readyVideo(window.start, window.start >= line.start);
      if (id !== operation.current) return;
      // Acknowledge the first retained PCM frame before releasing the picture.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error("errors.microphoneTimeout")), 8000);
        const finish = (error?: unknown) => {
          clearTimeout(timeout); detail.port.removeEventListener('message', ready); signal.removeEventListener('abort', cancelled);
          error ? reject(error) : resolve();
        };
        const ready = (event: MessageEvent) => {
          if (event.data.type !== 'started') return;
          captureContextStart = event.data.time; finish();
        };
        const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
        detail.port.addEventListener('message', ready); signal.addEventListener('abort', cancelled, { once: true });
        detail.port.postMessage('start');
      });
      if (id !== operation.current) return;
      advance('CAPTURE_READY', id);
      await playVideo(el, id, { onReady: () => {
        // Both the WAV and live peaks start at this exact audio-context frame.
        captureStart = el.currentTime - (ctx.currentTime - captureContextStart);
        setLiveStart(captureStart);
      } });
      if (id !== operation.current) return;
      advance('PLAYING', id);
      finishRecording.current = () => {
        if (machine.current.phase !== 'recording') return;
        cancelAnimationFrame(frame.current); el.pause(); setTime(el.currentTime); advance('FINISH', id);
        saveTimeout = setTimeout(() => { if (id === operation.current) stop("errors.recordingInterrupted"); }, 8000);
        detail.port.postMessage('stop');
      };
      let shownPeaks = 0;
      const meter = () => {
        if (id !== operation.current || machine.current.phase !== 'recording') return;
        setTime(el.currentTime);
        if (el.ended || el.currentTime >= window.end) { finishRecording.current?.(); return; }
        if (ctx.state !== 'running' || el.paused || el.seeking || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || el.playbackRate !== 1) {
          stop("errors.mediaInterrupted"); return;
        }
        el.muted = el.currentTime >= line.start && el.currentTime < line.end;
        if (peaks.length !== shownPeaks) {
          shownPeaks = peaks.length; setLivePeaks([...peaks]);
        }
        frame.current = requestAnimationFrame(meter);
      };
      frame.current = requestAnimationFrame(meter);
    } catch (e) { fail(id, e); }
  }

  async function replay(takes: Takes, line?: Line) {
    const id = begin(line ? 'listening' : 'replay');
    const window = line && lineWindow(scene, line);
    const start = window?.start ?? 0;
    const end = window?.end ?? scene.duration;
    setTime(start);
    try {
      if (!scene.lines.some(line => takes[line.id])) {
        advance('USE_ORIGINAL', id);
        const el = await readyVideo(start, false);
        await playVideo(el, id);
        if (id !== operation.current) return;
        advance('PLAYING', id); watch(id, end); return;
      }
      context.current ??= new AudioContext();
      const ctx = context.current;
      await ctx.resume();
      if (id !== operation.current) return;
      // Keep the output clock running through the lead-in, even when the first
      // voice starts later. A fresh WebKit context can otherwise park at sample 128.
      const output = ctx.createBufferSource(); output.buffer = ctx.createBuffer(1, 128, ctx.sampleRate); output.loop = true;
      output.connect(ctx.destination); output.start();
      output.onended = () => output.disconnect(); sources.current.push(output);
      await waitForAudioClock(ctx, cancellation.current.signal);
      if (id !== operation.current) return;
      advance('AUDIO_READY', id);
      const buffers = await Promise.all(scene.lines.filter(turn => takes[turn.id] && (!line || turn.id === line.id)).map(async line => ({
        line, buffer: await decodeTake(decodedTakes.current, ctx, takes[line.id].blob),
      })));
      if (id !== operation.current) return;
      advance('TAKES_READY', id);
      if (buffers.length && scene.backing && !backing.current) {
        const response = await fetch(asset(scene, scene.backing), { signal: cancellation.current.signal });
        if (!response.ok) throw new Error("errors.backingLoad");
        const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
        if (id !== operation.current) return;
        backing.current = decoded;
      }
      if (id !== operation.current) return;
      advance('BACKING_READY', id);
      const el = await readyVideo(start, scene.lines.some(l => takes[l.id] && start >= l.start && start < l.end));
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
        const window = lineWindow(scene, line);
        const voiceStart = Math.max(start, window.voiceStart, takeStart);
        const offset = voiceStart - takeStart;
        const duration = Math.min(buffer.duration, window.voiceEnd - takeStart) - offset;
        if (duration <= 0) continue;
        const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
        source.start(base + voiceStart, offset, duration);
        source.onended = () => source.disconnect(); sources.current.push(source);
      }
      replayClock.current = { context: ctx, start, startAt };
      // Start the prepared picture when that first sample reaches the output
      // device, rather than when it enters the render graph. The playing event
      // marks real startup; a delayed play() promise must not delay the watcher.
      await playVideo(el, id, {
        delay: Math.max(0, (startAt - audibleContextTime(ctx)) * 1000),
        timeout: 120, timeoutMessage: "errors.videoPlayback",
      });
      if (id !== operation.current) return;
      advance('PLAYING', id); watch(id, end, takes);
    } catch (e) { fail(id, e); }
  }

  return { phase, time, livePeaks, liveStart, error, setError, stop: () => stop(), preview, record, replay, listen, finish: () => finishRecording.current?.() };
}

function message(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return "errors.microphoneDenied";
    if (error.name === 'NotFoundError') return "errors.microphoneMissing";
    if (error.name === 'NotReadableError') return "errors.microphoneBusy";
  }
  return error instanceof Error ? error.message : "errors.mediaInterrupted";
}
