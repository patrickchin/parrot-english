import {
  FIVE_LITTLE_DUCKS_DUB,
} from "./dub-script.ts";
import {
  dubConsentLossError,
} from "./dub-api.ts";
import type { DubDefinition, DubLine } from "./rhyme-catalog.ts";

type VoiceSource = Pick<AudioBufferSourceNode, "connect" | "start" | "stop">;

type ScheduleDubAudioOptions = {
  context: Pick<AudioContext, "currentTime">;
  cueOffsetMs?: number;
  definition?: DubDefinition;
  lines?: readonly DubLine[];
  lineSources: Map<string, VoiceSource>;
  output: AudioNode;
  startAt: number;
};

type StartDubPlaybackOptions = {
  AudioContext?: typeof globalThis.AudioContext;
  cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
  definition?: DubDefinition;
  fetch?: typeof globalThis.fetch;
  lines?: readonly DubLine[];
  onEnded?: () => void;
  onLineFallback?: (lineId: DubLine["id"], stage: DubLinePlaybackStage) => void;
  onLineUnavailable?: (lineId: DubLine["id"]) => void;
  onTick: (elapsedMs: number) => void;
  requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
  resolveAudioSource?: (line: DubLine) => DubAudioSource;
  setTimeout?: typeof globalThis.setTimeout;
  signal?: AbortSignal;
};

export type DubLinePlaybackStage = "fetch" | "decode";

export type DubAudioSource = {
  fallbackUrl?: string;
  preferredUrl: string;
};

export class DubLinePlaybackError extends Error {
  readonly lineId: DubLine["id"];
  readonly stage: DubLinePlaybackStage;

  constructor(lineId: DubLine["id"], stage: DubLinePlaybackStage) {
    super("Your saved dub could not be played. Try again.");
    this.name = "DubLinePlaybackError";
    this.lineId = lineId;
    this.stage = stage;
  }
}

const MUSIC_BPM = 92;
const MUSIC_NOTES = [60, 64, 67, 69, 67, 64, 62, 67] as const;

function stopNode(node: Pick<AudioScheduledSourceNode, "stop">) {
  try {
    node.stop();
  } catch {
    return;
  }
}

export function scheduleDubAudio(options: ScheduleDubAudioOptions) {
  const {
    cueOffsetMs = 0,
    definition = FIVE_LITTLE_DUCKS_DUB,
    lines = definition.lines,
    lineSources,
    output,
    startAt,
  } = options;
  const scheduled: VoiceSource[] = [];

  try {
    for (const line of lines) {
      const source = lineSources.get(line.id);
      if (!source) continue;
      source.connect(output);
      source.start(startAt + (line.cueMs - cueOffsetMs) / 1_000);
      scheduled.push(source);
    }
  } catch (error) {
    scheduled.forEach(stopNode);
    throw error;
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    scheduled.forEach(stopNode);
  };
}

function midiFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function scheduleDubMusic(
  context: AudioContext,
  durationMs: number,
  output: AudioNode,
  startAt: number,
) {
  const beatSeconds = 60 / MUSIC_BPM;
  const noteCount = Math.ceil(durationMs / 1_000 / beatSeconds);
  const oscillators: OscillatorNode[] = [];

  try {
    for (let index = 0; index < noteCount; index += 1) {
      const startsAt = startAt + index * beatSeconds;
      const melodyBeat = index % 2 === 0;
      const note = MUSIC_NOTES[index % MUSIC_NOTES.length];
      const oscillator = context.createOscillator();
      oscillators.push(oscillator);
      const envelope = context.createGain();
      oscillator.type = melodyBeat ? "sine" : "triangle";
      oscillator.frequency.value = midiFrequency(note);
      envelope.gain.setValueAtTime(0, startsAt);
      envelope.gain.linearRampToValueAtTime(1, startsAt + 0.02);
      envelope.gain.linearRampToValueAtTime(
        0,
        startsAt + beatSeconds * 0.82,
      );
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + beatSeconds * 0.82);
    }
  } catch (error) {
    oscillators.forEach(stopNode);
    throw error;
  }

  return oscillators;
}

function createAbortError() {
  const error = new Error("Dub playback was cancelled.");
  error.name = "AbortError";
  return error;
}

function getPlaybackScope(
  lines: readonly DubLine[],
  definition: DubDefinition = FIVE_LITTLE_DUCKS_DUB,
) {
  if (lines.length === 0) {
    throw new TypeError("Dub playback lines must be one non-empty authored range.");
  }
  const firstLineIndex = definition.lines.indexOf(lines[0]);
  const canonical = firstLineIndex >= 0 && lines.every(
    (line, index) => definition.lines[firstLineIndex + index] === line,
  );
  if (!canonical) {
    throw new TypeError("Dub playback lines must be one non-empty authored range.");
  }
  const endLineIndex = firstLineIndex + lines.length;
  const fullDub = firstLineIndex === 0 && endLineIndex === definition.lines.length;
  const cueOffsetMs = fullDub ? 0 : lines[0].cueMs;
  const authoredEndMs = definition.lines[endLineIndex]?.cueMs ?? definition.durationMs;
  return {
    authoredDurationMs: authoredEndMs - cueOffsetMs,
    cueOffsetMs,
    fullDub,
  };
}

export async function startDubPlayback({
  AudioContext: AudioContextClass = globalThis.AudioContext,
  cancelAnimationFrame: cancelFrame = globalThis.cancelAnimationFrame,
  definition = FIVE_LITTLE_DUCKS_DUB,
  fetch: request = globalThis.fetch,
  lines = definition.lines,
  onEnded,
  onLineFallback,
  onLineUnavailable,
  onTick,
  requestAnimationFrame: requestFrame = globalThis.requestAnimationFrame,
  resolveAudioSource = ({ id }) => ({
    preferredUrl: `/api/dubs/${definition.id}/lines/${encodeURIComponent(id)}/audio`,
  }),
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  signal,
}: StartDubPlaybackOptions): Promise<{ stop(): void }> {
  const { authoredDurationMs, cueOffsetMs, fullDub } = getPlaybackScope(lines, definition);
  const context = new AudioContextClass();
  const loadController = new AbortController();
  let frameId: number | null = null;
  let oscillators: OscillatorNode[] = [];
  let stopVoices: (() => void) | null = null;
  let stopped = false;
  let abortListenerRemoved = false;
  let closePromise: Promise<void> | null = null;
  let rejectStartupAbort!: (error: Error) => void;
  const startupAbort = new Promise<never>((_, reject) => {
    rejectStartupAbort = reject;
  });

  const removeAbortListener = () => {
    if (abortListenerRemoved) return;
    abortListenerRemoved = true;
    signal?.removeEventListener("abort", handleAbort);
  };
  const beginCleanup = () => {
    if (stopped) return closePromise ?? Promise.resolve();
    stopped = true;
    loadController.abort();
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
    stopVoices?.();
    oscillators.forEach(stopNode);
    try {
      closePromise = context.close().catch(() => undefined);
    } catch {
      closePromise = Promise.resolve();
    }
    return closePromise;
  };
  const stopPlayback = () => {
    removeAbortListener();
    return beginCleanup();
  };
  const handleAbort = () => {
    rejectStartupAbort(createAbortError());
    void stopPlayback();
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    if (signal?.aborted) throw createAbortError();

    const loadAndDecode = async (url: string, lineId: DubLine["id"]) => {
      let response: Response;
      try {
        response = await request(url, {
          credentials: "same-origin",
          signal: loadController.signal,
        });
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw new DubLinePlaybackError(lineId, "fetch");
      }
      if (!response.ok) {
        if (signal?.aborted) throw createAbortError();
        if (response.status === 403 || response.status === 409) {
          const consentLoss = await dubConsentLossError(response);
          if (consentLoss) throw consentLoss;
        }
        throw new DubLinePlaybackError(lineId, "fetch");
      }
      let bytes: ArrayBuffer;
      try {
        bytes = await response.arrayBuffer();
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw new DubLinePlaybackError(lineId, "fetch");
      }
      try {
        return await context.decodeAudioData(bytes);
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw new DubLinePlaybackError(lineId, "decode");
      }
    };
    const lineLoads = lines.map(async (line) => {
      let source: DubAudioSource;
      try {
        source = resolveAudioSource(line);
      } catch {
        onLineUnavailable?.(line.id);
        return null;
      }
      const { fallbackUrl, preferredUrl } = source;
      try {
        return [line, await loadAndDecode(preferredUrl, line.id)] as const;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        if (!(error instanceof DubLinePlaybackError)) throw error;
        if (!fallbackUrl) {
          onLineUnavailable?.(line.id);
          return null;
        }
        const stage = error instanceof DubLinePlaybackError ? error.stage : "fetch";
        onLineFallback?.(line.id, stage);
        try {
          return [line, await loadAndDecode(fallbackUrl, line.id)] as const;
        } catch (fallbackError) {
          if (fallbackError instanceof Error && fallbackError.name === "AbortError") {
            throw fallbackError;
          }
          if (!(fallbackError instanceof DubLinePlaybackError)) throw fallbackError;
          onLineUnavailable?.(line.id);
          return null;
        }
      }
    });
    const decodedLineResults = await Promise.race([
      Promise.all(lineLoads),
      startupAbort,
    ]);
    const decodedLines = decodedLineResults.filter((line): line is readonly [
      DubLine,
      AudioBuffer,
    ] => line !== null);

    if (signal?.aborted) throw createAbortError();
    const durationMs = fullDub
      ? definition.durationMs
      : Math.max(authoredDurationMs, ...decodedLines.map(([line, buffer]) =>
          line.cueMs - cueOffsetMs + buffer.duration * 1_000));
    await Promise.race([context.resume(), startupAbort]);
    if (signal?.aborted) throw createAbortError();

    const master = context.createGain();
    master.gain.value = 0.95;
    master.connect(context.destination);
    const music = context.createGain();
    music.gain.value = 0.08;
    music.connect(master);

    const lineSources = new Map<string, AudioBufferSourceNode>();
    for (const [line, buffer] of decodedLines) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      lineSources.set(line.id, source);
    }

    const startAt = context.currentTime + 0.12;
    stopVoices = scheduleDubAudio({
      context,
      cueOffsetMs,
      definition,
      lines,
      lineSources,
      output: master,
      startAt,
    });
    oscillators = scheduleDubMusic(context, durationMs, music, startAt);

    const tick = () => {
      frameId = null;
      const elapsedMs = Math.max(0, (context.currentTime - startAt) * 1_000);
      onTick(Math.min(durationMs, elapsedMs));
      if (stopped) return;
      if (elapsedMs >= durationMs) {
        void stopPlayback();
        onEnded?.();
        return;
      }
      frameId = requestFrame(tick);
    };
    frameId = requestFrame(tick);

    return {
      stop() {
        void stopPlayback();
      },
    };
  } catch (error) {
    void beginCleanup();
    try {
      if (signal?.aborted) throw createAbortError();
      const cleanupGrace = new Promise<void>((resolve) => {
        // One task turn lets an already-queued caller abort win without
        // allowing a non-cooperative AudioContext.close() to hang startup.
        scheduleTimeout(resolve, 0);
      });
      await Promise.race([startupAbort, cleanupGrace]);
      if (signal?.aborted) throw createAbortError();
      throw error;
    } finally {
      removeAbortListener();
    }
  }
}
