import {
  dubConsentLossError,
} from "./dub-api.ts";
import {
  FIVE_LITTLE_DUCKS_DUB,
  getDubLineMusicPhrase,
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog.ts";

export const DUB_COUNT_CLICK_DURATION_MS = 200;

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

export type PreparedDubLineBacking = {
  durationMs: number;
  start(): void;
  stop(): void;
};

type PrepareDubLineBackingOptions = {
  AudioContext?: typeof globalThis.AudioContext;
  cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
  definition?: DubDefinition;
  line: DubLine;
  onEnded?: () => void;
  onFailure?: (error: unknown) => void;
  onTick?: (elapsedMs: number) => void;
  requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
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

function scheduleTone(
  context: AudioContext,
  output: AudioNode,
  oscillators: OscillatorNode[],
  {
    durationMs,
    gain,
    midi,
    startsAt,
    type,
  }: {
    durationMs: number;
    gain: number;
    midi: number;
    startsAt: number;
    type: OscillatorType;
  },
) {
  const oscillator = context.createOscillator();
  oscillators.push(oscillator);
  const envelope = context.createGain();
  const endsAt = startsAt + durationMs / 1_000;
  oscillator.type = type;
  oscillator.frequency.value = midiFrequency(midi);
  envelope.gain.setValueAtTime(0, startsAt);
  envelope.gain.linearRampToValueAtTime(gain, startsAt + 0.02);
  envelope.gain.linearRampToValueAtTime(0, endsAt);
  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(startsAt);
  oscillator.stop(endsAt);
}

function scheduleDubMusic(
  context: AudioContext,
  definition: DubDefinition,
  lines: readonly DubLine[],
  cueOffsetMs: number,
  durationMs: number,
  output: AudioNode,
  startAt: number,
) {
  const oscillators: OscillatorNode[] = [];
  const getPhrase = (line: DubLine) => getDubLineMusicPhrase(definition, line);

  try {
    const fullDub = cueOffsetMs === 0
      && lines.length === definition.lines.length
      && lines[0] === definition.lines[0];
    if (fullDub) {
      for (let beat = 0; beat < definition.countInBeats; beat += 1) {
        scheduleTone(context, output, oscillators, {
          durationMs: DUB_COUNT_CLICK_DURATION_MS,
          gain: 0.35,
          midi: definition.countInMidi,
          startsAt: startAt + beat * definition.music.countInBeatMs / 1_000,
          type: "sine",
        });
      }
    }

    for (const line of lines) {
      const phrase = getPhrase(line);
      const phraseStartsMs = line.cueMs - cueOffsetMs;
      for (const note of phrase.playbackNotes) {
        const melody = note.role === "melody";
        scheduleTone(context, output, oscillators, {
          durationMs: note.durationMs,
          gain: melody ? 0.78 : 0.24,
          midi: note.midi,
          startsAt: startAt + (phraseStartsMs + note.atMs) / 1_000,
          type: melody ? "triangle" : "sine",
        });
      }
    }

    const playbackEndMs = cueOffsetMs + durationMs;
    for (const note of definition.music.outroNotes) {
      if (note.atMs < cueOffsetMs || note.atMs >= playbackEndMs) continue;
      const melody = note.role === "melody";
      scheduleTone(context, output, oscillators, {
        durationMs: note.durationMs,
        gain: melody ? 0.78 : 0.24,
        midi: note.midi,
        startsAt: startAt + (note.atMs - cueOffsetMs) / 1_000,
        type: melody ? "triangle" : "sine",
      });
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
  const authoredEndMs = fullDub
    ? definition.durationMs
    : definition.lines[endLineIndex]?.cueMs
      ?? lines.at(-1)!.cueMs + definition.finalCueTailMs;
  return {
    authoredDurationMs: authoredEndMs - cueOffsetMs,
    cueOffsetMs,
    fullDub,
  };
}

export async function prepareDubLineBacking({
  AudioContext: AudioContextClass = globalThis.AudioContext,
  cancelAnimationFrame: cancelFrame = globalThis.cancelAnimationFrame,
  definition = FIVE_LITTLE_DUCKS_DUB,
  line,
  onEnded,
  onFailure,
  onTick = () => {},
  requestAnimationFrame: requestFrame = globalThis.requestAnimationFrame,
  signal,
}: PrepareDubLineBackingOptions): Promise<PreparedDubLineBacking> {
  const phrase = getDubLineMusicPhrase(definition, line);
  const context = new AudioContextClass();
  let frameId: number | null = null;
  let oscillators: OscillatorNode[] = [];
  let terminal: OscillatorNode | null = null;
  let started = false;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const terminalNode = terminal;
    terminal = null;
    if (terminalNode) terminalNode.onended = null;
    if (frameId !== null) {
      const pendingFrameId = frameId;
      frameId = null;
      try {
        cancelFrame(pendingFrameId);
      } catch {
        // Presentation cleanup must not strand the audio graph.
      }
    }
    oscillators.forEach(stopNode);
    if (terminalNode) stopNode(terminalNode);
    try {
      signal?.removeEventListener("abort", stop);
    } catch {
      // Continue closing the audio context.
    }
    try {
      void context.close().catch(() => undefined);
    } catch {
      return;
    }
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    stop();
    onFailure?.(error);
  };
  const end = () => {
    if (stopped) return;
    stop();
    onEnded?.();
  };

  signal?.addEventListener("abort", stop, { once: true });
  try {
    if (signal?.aborted) throw createAbortError();
    await context.resume();
    if (signal?.aborted) throw createAbortError();
  } catch (error) {
    stop();
    throw error;
  }

  return {
    durationMs: phrase.durationMs,
    start() {
      if (started || stopped) throw new Error("Dub line backing is not startable.");
      started = true;
      try {
        const master = context.createGain();
        master.gain.value = 0.95;
        master.connect(context.destination);
        const music = context.createGain();
        music.gain.value = definition.music.volume;
        music.connect(master);
        const startAt = context.currentTime;
        oscillators = scheduleDubMusic(
          context,
          definition,
          [line],
          line.cueMs,
          phrase.durationMs,
          music,
          startAt,
        );
        terminal = context.createOscillator();
        terminal.onended = end;
        terminal.start(startAt);
        terminal.stop(startAt + phrase.durationMs / 1_000);
        const tick = () => {
          frameId = null;
          if (stopped) return;
          try {
            const elapsedMs = Math.min(
              phrase.durationMs,
              Math.max(0, (context.currentTime - startAt) * 1_000),
            );
            onTick(elapsedMs);
            if (!stopped) frameId = requestFrame(tick);
          } catch (error) {
            fail(error);
          }
        };
        onTick(0);
        if (!stopped) frameId = requestFrame(tick);
      } catch (error) {
        stop();
        throw error;
      }
    },
    stop,
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
  const { authoredDurationMs, cueOffsetMs } = getPlaybackScope(lines, definition);
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
    const durationMs = Math.max(
      authoredDurationMs,
      ...decodedLines.map(([line, buffer]) =>
        line.cueMs - cueOffsetMs + buffer.duration * 1_000),
    );
    await Promise.race([context.resume(), startupAbort]);
    if (signal?.aborted) throw createAbortError();

    const master = context.createGain();
    master.gain.value = 0.95;
    master.connect(context.destination);
    const music = context.createGain();
    music.gain.value = definition.music.volume;
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
    oscillators = scheduleDubMusic(
      context,
      definition,
      lines,
      cueOffsetMs,
      durationMs,
      music,
      startAt,
    );

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
