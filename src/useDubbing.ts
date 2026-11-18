import { useEffect, useRef, useState, type RefObject } from 'react';
import { asset, type Scene, type Line } from './scene';
import { waveformStep, type WaveformTimeline } from './waveform';
import { encodePcmWav } from './pcm-recording';
import { audibleContextTime, decodeTake, sustainedDrift, waitForAudioClock } from './audio-timing';
import { waitForVideo } from './video-events';
import { lineWindow } from './line-window';
import { mediaSnapshot } from './media-diagnostics';

export type Take = { blob: Blob; duration: number; start: number; peaks: number[] };
export type Takes = Record<string, Take>;
type Activity = 'preview' | 'recording' | 'replay' | 'listening';
type Preparation = 'microphone' | 'worklet' | 'audio' | 'decoding' | 'backing' | 'video' | 'capture' | 'playing';
type MediaState =
  | { phase: 'idle'; error: string }
  | { phase: 'loading'; activity: Activity; stage: Preparation }
  | { phase: Activity | 'saving' };
const idleMedia: MediaState = { phase: 'idle', error: '' };

export function useDubbing(video: RefObject<HTMLVideoElement | null>, scene: Scene, onTake: (id: string, take: Take) => void) {
  // WebKit's MediaElementAudioSourceNode misreports the media element clock
  // (WebKit #204228). Keep its native output; Chromium shares one audio graph.
  const sharedOutput = /(?:Chrome|Chromium)\//.test(navigator.userAgent);
  // Native callbacks need the current phase before React commits a render.
  // Startup order lives in the async functions; one signal cancels each attempt.
  const currentState = useRef(idleMedia);
  const [state, setState] = useState(idleMedia);
  function setMedia(next: MediaState) {
    currentState.current = next; setState(next);
  }
  const phase = state.phase;
  const error = state.phase === 'idle' ? state.error : '';
  const [diagnostic, setDiagnostic] = useState('');
  const [videoKey, setVideoKey] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const bufferingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function clearBuffering() {
    clearTimeout(bufferingTimeout.current); bufferingTimeout.current = undefined;
    setBuffering(false);
  }
  const [time, setTime] = useState(0);
  const timeline = useRef<WaveformTimeline>({ time: 0, capture: null });
  const playbackProgress = useRef<HTMLProgressElement>(null);
  const displayedTime = useRef(0);
  function updateTime(value: number, immediate = false) {
    timeline.current.time = value;
    if (playbackProgress.current) playbackProgress.current.value = value;
    // Captions change at their exact boundaries; elapsed text needs only 4 Hz.
    // The waveform reads the frame clock directly, without rendering the player.
    const previous = displayedTime.current;
    if (immediate || Math.floor(previous * 4) !== Math.floor(value * 4) ||
      scene.lines.some(line => (previous < line.start) !== (value < line.start) || (previous < line.end) !== (value < line.end))) {
      displayedTime.current = value; setTime(value);
    }
  }
  const cancellation = useRef(new AbortController());
  const frame = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const originalGain = useRef<GainNode | null>(null);
  const resetVideo = useRef(false);
  function muteOriginal(muted: boolean) {
    if (originalGain.current) originalGain.current.gain.value = muted ? 0 : 1;
    else if (video.current) video.current.muted = muted;
  }
  const waveformModule = useRef<Promise<void> | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const finishRecording = useRef<(() => void) | null>(null);
  const backing = useRef<AudioBuffer | null>(null);
  const decodedTakes = useRef(new WeakMap<Blob, Promise<AudioBuffer>>());
  const captureCleanup = useRef<(() => void) | null>(null);
  const trace = useRef<(ReturnType<typeof mediaSnapshot> & { event: string; details: Record<string, unknown> })[]>([]);
  function log(event: string, details: Record<string, unknown> = {}) {
    trace.current.push({ ...mediaSnapshot(video.current, context.current), event, details: { ...details, originalGain: originalGain.current?.gain.value } });
    if (trace.current.length > 24) trace.current.shift();
  }

  function release() {
    clearBuffering();
    cancellation.current.abort(); cancellation.current = new AbortController();
    timeline.current.capture = null;
    cancelAnimationFrame(frame.current);
    captureCleanup.current?.(); captureCleanup.current = null;
    finishRecording.current = null;
    for (const source of sources.current) { try { source.stop(); } catch { /* Already ended. */ } }
    sources.current = [];
    muteOriginal(false);
    if (video.current) { video.current.pause(); updateTime(video.current.currentTime, true); }
  }

  function stop(error?: string, reason = error, details: Record<string, unknown> = {}) {
    if (error) {
      log(reason ?? 'error', details);
      const report = JSON.stringify({ revision: __APP_REVISION__, when: new Date().toISOString(),
        browser: navigator.userAgent, output: sharedOutput ? 'shared' : 'native', visibility: document.visibilityState, phase: currentState.current.phase,
        preparation: currentState.current.phase === 'loading' ? { activity: currentState.current.activity, stage: currentState.current.stage } : undefined,
        error: /^errors\.[A-Za-z]+$/.test(error) ? error : 'unexpected', events: trace.current }, null, 2);
      setDiagnostic(report);
      console.warn('Parrotbook media failure', report);
    }
    release();
    if (resetVideo.current) {
      resetVideo.current = false;
      setVideoKey(key => key + 1);
    }
    setMedia({ phase: 'idle', error: error ?? (currentState.current.phase === 'idle' ? currentState.current.error : '') });
  }

  function setError(error: string) {
    if (error) stop(error); else if (currentState.current.phase === 'idle') setMedia(idleMedia);
  }
  function begin(activity: Activity) {
    stop();
    trace.current = []; setDiagnostic(''); log('start', { activity });
    setMedia({ phase: 'loading', activity, stage: activity === 'recording' ? 'microphone' : activity === 'preview' ? 'video' : 'audio' });
    return cancellation.current.signal;
  }
  function preparing(stage: Preparation, signal: AbortSignal) {
    signal.throwIfAborted();
    if (currentState.current.phase === 'loading') setMedia({ ...currentState.current, stage });
    log(stage);
  }
  function playing(signal: AbortSignal) {
    signal.throwIfAborted();
    if (currentState.current.phase === 'loading') setMedia({ phase: currentState.current.activity });
    log('PLAYING');
  }
  function fail(signal: AbortSignal, error: unknown) {
    if (!signal.aborted) stop(error instanceof Error ? error.message : "errors.mediaInterrupted",
      error instanceof Error && typeof error.cause === 'string' ? error.cause : 'exception',
      { exception: error instanceof Error ? error.name : typeof error });
  }
  function readyAudio(ctx: AudioContext, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const deadline = setTimeout(() => finish(new Error("errors.mediaInterrupted", { cause: 'audio-resume-timeout' })), 8000);
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(deadline); signal.removeEventListener('abort', cancelled);
        if (error) {
          log('audio-resume-failed');
          // A media element can belong to only one AudioContext. Replace it
          // together with a failed context so the next tap can retry cleanly.
          if (originalGain.current?.context === ctx) { originalGain.current = null; resetVideo.current = true; }
          // A stuck mobile audio session must not be reused by the next attempt.
          if (context.current === ctx) { context.current = null; waveformModule.current = null; }
          void ctx.close().catch(() => {});
          reject(error);
        } else resolve();
      };
      const cancelled = () => finish(new DOMException('Cancelled', 'AbortError'));
      signal.addEventListener('abort', cancelled, { once: true });
      ctx.resume().then(() => {
        if (settled) return;
        if (ctx.state !== 'running') throw new Error("errors.mediaInterrupted", { cause: 'audio-resume-state' });
        if (sharedOutput && !originalGain.current) {
          // One output for the picture, original voices, and recorded voices.
          // Independent Android media sinks change clocks when the original is
          // muted, making otherwise healthy capture/replay appear out of sync.
          const source = ctx.createMediaElementSource(video.current!);
          const gain = ctx.createGain();
          source.connect(gain).connect(ctx.destination); originalGain.current = gain;
        }
        finish();
      }).catch(finish);
    });
  }
  function playVideo(el: HTMLVideoElement, signal: AbortSignal, options: Parameters<typeof waitForVideo>[3] = {}) {
    signal.throwIfAborted();
    return waitForVideo(el, 'playing', signal, {
      progress: true, timeoutMessage: "errors.videoPlayback",
      start: () => el.play().catch(error => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') throw new Error("errors.videoPlayback");
        throw error;
      }), onLateError: error => fail(signal, error), ...options,
    });
  }

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    const el = video.current;
    const events = ['play', 'playing', 'canplay', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'error', 'ended'];
    const observed = (event: Event) => {
      log('video.' + event.type);
      if (event.type === 'seeked' && el && currentState.current.phase === 'idle') updateTime(el.currentTime, true);
      if (event.type === 'playing' || event.type === 'canplay') clearBuffering();
      if (event.type === 'waiting' && ['preview', 'recording', 'replay', 'listening'].includes(currentState.current.phase)) {
        setBuffering(true);
        bufferingTimeout.current ??= setTimeout(() => stop('errors.videoBuffering'), 8000);
      }
    };
    document.addEventListener('visibilitychange', hidden);
    events.forEach(event => el?.addEventListener(event, observed));
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      events.forEach(event => el?.removeEventListener(event, observed));
      stop();
      void context.current?.close();
      context.current = null; waveformModule.current = null;
    };
  }, [videoKey]);

  function prepareVideo() {
    const el = video.current;
    // iOS may preload metadata only. Request the remaining media while this
    // user's tap is still active, before waiting for canplay or microphone access.
    if (el && !el.error && el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) el.load();
  }

  async function readyVideo(start: number, muted: boolean, signal: AbortSignal) {
    const el = video.current;
    if (!el || el.error) throw new Error("errors.videoPlayback");
    signal.throwIfAborted();
    muteOriginal(muted);
    if (Math.abs(el.currentTime - start) > 0.025) {
      await waitForVideo(el, 'seeked', signal, { start: () => { el.currentTime = start; } });
    } else if (el.seeking) {
      // currentTime changes before a seek settles, including a reset to zero.
      await waitForVideo(el, 'seeked', signal);
    }
    signal.throwIfAborted();
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) await waitForVideo(el, 'canplay', signal);
    signal.throwIfAborted();
    preparing(currentState.current.phase === 'loading' && currentState.current.activity === 'recording' ? 'capture' : 'playing', signal);
    return el;
  }

  // Recording and playback share cancellation, end handling, and sync checks.
  function watch(signal: AbortSignal, end: number, { audio, mute, onEnd = () => stop() }: {
    audio?: { context: AudioContext; position: () => number; reason: 'capture-drift' | 'replay-drift' };
    mute?: (time: number) => boolean;
    onEnd?: () => void;
  } = {}) {
    const drifted = sustainedDrift();
    const tick = () => {
      const el = video.current;
      if (signal.aborted || !el || currentState.current.phase === 'saving') return;
      if (el.ended || el.currentTime >= end) { onEnd(); return; }
      if (el.paused || el.seeking || el.playbackRate !== 1) {
        stop("errors.mediaInterrupted", el.paused ? 'video-paused' : el.seeking ? 'video-seeking' : 'video-rate'); return;
      }
      if (audio) {
        const drift = audio.position() - el.currentTime;
        if (audio.context.state !== 'running' || drifted(drift)) {
          stop("errors.mediaInterrupted", audio.context.state !== 'running' ? 'audio-state' : audio.reason, { drift }); return;
        }
      }
      if (mute) muteOriginal(mute(el.currentTime));
      updateTime(el.currentTime);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function preview(line?: Line) {
    const signal = begin('preview');
    updateTime(line?.start ?? 0, true);
    try {
      prepareVideo();
      if (sharedOutput) { context.current ??= new AudioContext(); await readyAudio(context.current, signal); }
      if (signal.aborted) return;
      const el = await readyVideo(line?.start ?? 0, false, signal);
      await playVideo(el, signal);
      playing(signal); watch(signal, line?.end ?? scene.duration);
    } catch (e) { fail(signal, e); }
  }

  function listen(take: Take, line: Line) {
    return replay({ [line.id]: take }, line);
  }

  async function record(line: Line) {
    const signal = begin('recording');
    const window = lineWindow(scene, line);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setError("errors.recordingUnsupported"); return;
    }
    updateTime(window.start, true);
    try {
      prepareVideo();
      context.current ??= new AudioContext();
      const ctx = context.current;
      // Safari can keep a context suspended until microphone permission resolves.
      void ctx.resume().catch(() => {});
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
        .catch(error => { throw new Error(microphoneMessage(error)); });
      if (signal.aborted) { captured.getTracks().forEach(track => track.stop()); return; }
      captureCleanup.current = () => captured.getTracks().forEach(track => track.stop());
      preparing('worklet', signal);
      const input = ctx.createMediaStreamSource(captured);
      captureCleanup.current = () => { input.disconnect(); captured.getTracks().forEach(track => track.stop()); };
      waveformModule.current ??= ctx.audioWorklet.addModule(new URL('./capture-waveform.worklet.js?no-inline', import.meta.url));
      try { await waveformModule.current; } catch (error) { waveformModule.current = null; throw error; }
      preparing('audio', signal);
      const detail = new AudioWorkletNode(ctx, 'capture-waveform', { channelCount: 1, channelCountMode: 'explicit' });
      input.connect(detail).connect(ctx.destination);
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;
      const disconnectInput = () => {
        clearTimeout(saveTimeout);
        input.disconnect(); detail.disconnect(); detail.port.close();
        captured.getTracks().forEach(track => track.stop());
      };
      captureCleanup.current = disconnectInput;
      await readyAudio(ctx, signal);
      preparing('video', signal);
      const chunks: Float32Array[] = [], peaks: number[] = [];
      const live = { start: window.start, peaks };
      timeline.current.capture = live;
      let captureContextStart = 0, captureStart = window.start;
      detail.port.onmessage = event => {
        if (signal.aborted) return;
        const data = event.data;
        if (data.type === 'data') { chunks.push(data.samples); peaks.push(...data.peaks); }
        if (data.type !== 'stopped' || currentState.current.phase !== 'saving') return;
        // The audio thread sends its final partial block before this acknowledgement.
        disconnectInput();
        if (captureCleanup.current === disconnectInput) captureCleanup.current = null;
        const frames = chunks.reduce((total, chunk) => total + chunk.length, 0);
        const duration = frames / ctx.sampleRate;
        const preroll = Math.max(0, window.voiceStart - captureStart);
        const peak = peaks.slice(Math.ceil(preroll / waveformStep), Math.ceil((window.voiceEnd - captureStart) / waveformStep)).reduce((max, value) => Math.max(max, value), 0);
        if (duration - preroll < 0.3 || peak < 0.003) {
          setError("errors.quietRecording"); return;
        }
        const blob = encodePcmWav(chunks, ctx.sampleRate);
        onTake(line.id, { blob, duration, start: captureStart, peaks });
        stop();
      };
      detail.onprocessorerror = () => { if (!signal.aborted) stop("errors.recordingInterrupted"); };
      captured.getAudioTracks().forEach(track => { track.onended = () => {
        if (!signal.aborted && (currentState.current.phase === 'loading' || currentState.current.phase === 'recording')) stop("errors.microphoneDisconnected");
      }; });
      const el = await readyVideo(window.start, window.start >= line.start, signal);
      if (signal.aborted) return;
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
      if (signal.aborted) return;
      // A started worklet can acknowledge its first quantum before the native
      // audio clock parks during device startup. Keep the picture paused until
      // capture is advancing, just as replay waits for its output clock.
      await waitForAudioClock(ctx, signal);
      preparing('playing', signal);
      await playVideo(el, signal, { onReady: () => {
        // Both the WAV and live peaks start at this exact audio-context frame.
        captureStart = el.currentTime - (ctx.currentTime - captureContextStart);
        live.start = captureStart;
        log('capture-started', { captureStart, captureContextStart });
      } });
      playing(signal);
      finishRecording.current = () => {
        if (currentState.current.phase !== 'recording') return;
        cancelAnimationFrame(frame.current); el.pause(); updateTime(el.currentTime, true); setMedia({ phase: 'saving' });
        saveTimeout = setTimeout(() => { if (!signal.aborted) stop("errors.recordingInterrupted"); }, 8000);
        detail.port.postMessage('stop');
      };
      watch(signal, window.end, {
        audio: { context: ctx, position: () => captureStart + ctx.currentTime - captureContextStart, reason: 'capture-drift' },
        mute: time => time >= line.start && time < line.end,
        onEnd: finishRecording.current,
      });
    } catch (e) { fail(signal, e); }
  }

  async function replay(takes: Takes, line?: Line) {
    const signal = begin(line ? 'listening' : 'replay');
    const window = line && lineWindow(scene, line);
    const start = window?.start ?? 0;
    const end = window?.end ?? scene.duration;
    updateTime(start, true);
    try {
      prepareVideo();
      context.current ??= new AudioContext();
      const ctx = context.current;
      await readyAudio(ctx, signal);
      if (signal.aborted) return;
      if (!scene.lines.some(line => takes[line.id])) {
        preparing('video', signal);
        const el = await readyVideo(start, false, signal);
        await playVideo(el, signal);
        playing(signal); watch(signal, end); return;
      }
      // Keep the output clock running through the lead-in, even when the first
      // voice starts later. A fresh WebKit context can otherwise park at sample 128.
      const output = ctx.createBufferSource(); output.buffer = ctx.createBuffer(1, 128, ctx.sampleRate); output.loop = true;
      output.connect(ctx.destination); output.start();
      output.onended = () => output.disconnect(); sources.current.push(output);
      await waitForAudioClock(ctx, signal);
      preparing('decoding', signal);
      const buffers = await Promise.all(scene.lines.filter(turn => takes[turn.id] && (!line || turn.id === line.id)).map(async line => ({
        line, buffer: await decodeTake(decodedTakes.current, ctx, takes[line.id].blob),
      })));
      preparing('backing', signal);
      if (buffers.length && scene.backing && !backing.current) {
        const response = await fetch(asset(scene, scene.backing), { signal });
        if (!response.ok) throw new Error("errors.backingLoad");
        const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
        if (signal.aborted) return;
        backing.current = decoded;
      }
      preparing('video', signal);
      const el = await readyVideo(start, scene.lines.some(l => takes[l.id] && start >= l.start && start < l.end), signal);
      if (signal.aborted) return;
      // Wait for real picture startup before scheduling any voice. A healthy
      // native play() can take hundreds of milliseconds after canplay; starting
      // Web Audio first made that delay audible and imposed a brittle 120 ms limit.
      await playVideo(el, signal);
      if (signal.aborted) return;
      let base = audibleContextTime(ctx) - el.currentTime;
      const firstVoice = Math.min(...buffers.map(({ line }) => Math.max(start, lineWindow(scene, line).voiceStart, takes[line.id].start)));
      const needsLeadIn = ctx.currentTime - (base + firstVoice) > 0.12;
      if (needsLeadIn) {
        // The picture is warm now, but this output device cannot render the
        // opening voice in time. Rewind and queue its full opening ahead of the
        // speaker, then start the picture when those samples reach the output.
        el.pause();
        await readyVideo(start, scene.lines.some(l => takes[l.id] && start >= l.start && start < l.end), signal);
        if (signal.aborted) return;
        base = ctx.currentTime + 0.06 - start;
      }
      if (buffers.length && backing.current) {
        const music = ctx.createBufferSource(); music.buffer = backing.current;
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime);
        for (const { line } of buffers) {
          gain.gain.setValueAtTime(0, Math.max(0, base + line.start));
          gain.gain.linearRampToValueAtTime(1, Math.max(0, base + line.start + 0.015));
          gain.gain.setValueAtTime(1, Math.max(0, base + line.end - 0.015));
          gain.gain.linearRampToValueAtTime(0, Math.max(0, base + line.end));
        }
        const musicStart = Math.max(ctx.currentTime, base + start);
        music.connect(gain).connect(ctx.destination); music.start(musicStart, musicStart - base);
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
        source.start(Math.max(0, base + voiceStart), offset, duration);
        source.onended = () => source.disconnect(); sources.current.push(source);
      }
      log('replay-scheduled', { base, start, end, firstVoice, needsLeadIn });
      if (needsLeadIn) await playVideo(el, signal, { delay: Math.max(0, (base + start - audibleContextTime(ctx)) * 1000) });
      playing(signal);
      watch(signal, end, {
        audio: { context: ctx, position: () => audibleContextTime(ctx) - base, reason: 'replay-drift' },
        mute: time => scene.lines.some(line => takes[line.id] && time >= line.start && time < line.end),
      });
    } catch (e) { fail(signal, e); }
  }

  return { phase, buffering, time, timeline, playbackProgress, videoKey, error, diagnostic, setError, prepareVideo, stop: () => stop(), preview, record, replay, listen, finish: () => finishRecording.current?.() };
}

function microphoneMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return "errors.microphoneDenied";
    if (error.name === 'NotFoundError') return "errors.microphoneMissing";
    if (error.name === 'NotReadableError') return "errors.microphoneBusy";
  }
  return error instanceof Error ? error.message : "errors.mediaInterrupted";
}
