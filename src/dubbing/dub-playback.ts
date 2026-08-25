import {
  DUB_DURATION_MS,
  DUB_LINES,
  type DubLine,
} from "./dub-script.ts";
import { getDubLineAudioUrl } from "./dub-api.ts";

type VoiceSource = Pick<AudioBufferSourceNode, "connect" | "start" | "stop">;

type ScheduleDubAudioOptions = {
  context: Pick<AudioContext, "currentTime">;
  lineSources: Map<string, VoiceSource>;
  output: AudioNode;
  startAt: number;
};

type StartDubPlaybackOptions = {
  AudioContext?: typeof globalThis.AudioContext;
  cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
  fetch?: typeof globalThis.fetch;
  onTick: (elapsedMs: number) => void;
  requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
  setTimeout?: typeof globalThis.setTimeout;
  signal?: AbortSignal;
};

export type DubLinePlaybackStage = "fetch" | "decode";

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
  const { lineSources, output, startAt } = options;
  const scheduled: VoiceSource[] = [];

  try {
    for (const line of DUB_LINES) {
      const source = lineSources.get(line.id);
      if (!source) continue;
      source.connect(output);
      source.start(startAt + line.cueMs / 1_000);
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
  output: AudioNode,
  startAt: number,
) {
  const beatSeconds = 60 / MUSIC_BPM;
  const noteCount = Math.ceil(DUB_DURATION_MS / 1_000 / beatSeconds);
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

export async function startDubPlayback({
  AudioContext: AudioContextClass = globalThis.AudioContext,
  cancelAnimationFrame: cancelFrame = globalThis.cancelAnimationFrame,
  fetch: request = globalThis.fetch,
  onTick,
  requestAnimationFrame: requestFrame = globalThis.requestAnimationFrame,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  signal,
}: StartDubPlaybackOptions): Promise<{ stop(): void }> {
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

    let firstLineFailure: DubLinePlaybackError | null = null;
    let rejectLineFailure!: (failure: DubLinePlaybackError) => void;
    const lineFailure = new Promise<never>((_, reject) => {
      rejectLineFailure = reject;
    });
    const failLine = (lineId: DubLine["id"], stage: DubLinePlaybackStage) => {
      const failure = new DubLinePlaybackError(lineId, stage);
      // The first observed line failure is the origin; later AbortErrors are
      // consequences of cancelling its sibling work.
      if (!firstLineFailure) {
        firstLineFailure = failure;
        rejectLineFailure(failure);
        loadController.abort();
      }
      return failure;
    };
    const lineLoads = DUB_LINES.map(async ({ id }) => {
      let response: Response;
      try {
        response = await request(getDubLineAudioUrl(id), {
          credentials: "same-origin",
          signal: loadController.signal,
        });
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw failLine(id, "fetch");
      }
      if (!response.ok) {
        if (signal?.aborted) throw createAbortError();
        throw failLine(id, "fetch");
      }
      let bytes: ArrayBuffer;
      try {
        bytes = await response.arrayBuffer();
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw failLine(id, "fetch");
      }
      let buffer: AudioBuffer;
      try {
        buffer = await context.decodeAudioData(bytes);
      } catch {
        if (signal?.aborted || loadController.signal.aborted) {
          throw createAbortError();
        }
        throw failLine(id, "decode");
      }
      return [id, buffer] as const;
    });
    const decodedLines = await Promise.race([
      Promise.all(lineLoads),
      lineFailure,
      startupAbort,
    ]);

    if (signal?.aborted) throw createAbortError();
    await Promise.race([context.resume(), startupAbort]);
    if (signal?.aborted) throw createAbortError();

    const master = context.createGain();
    master.gain.value = 0.95;
    master.connect(context.destination);
    const music = context.createGain();
    music.gain.value = 0.08;
    music.connect(master);

    const lineSources = new Map<string, AudioBufferSourceNode>();
    for (const [id, buffer] of decodedLines) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      lineSources.set(id, source);
    }

    const startAt = context.currentTime + 0.12;
    stopVoices = scheduleDubAudio({
      context,
      lineSources,
      output: master,
      startAt,
    });
    oscillators = scheduleDubMusic(context, music, startAt);

    const tick = () => {
      frameId = null;
      const elapsedMs = Math.max(0, (context.currentTime - startAt) * 1_000);
      onTick(Math.min(DUB_DURATION_MS, elapsedMs));
      if (stopped) return;
      if (elapsedMs >= DUB_DURATION_MS) {
        void stopPlayback();
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
    const cleanup = beginCleanup();
    try {
      if (signal?.aborted) throw createAbortError();
      const cleanupGrace = new Promise<void>((resolve) => {
        // One task turn lets an already-queued caller abort win without
        // allowing a non-cooperative AudioContext.close() to hang startup.
        scheduleTimeout(resolve, 0);
      });
      await Promise.race([cleanup, startupAbort, cleanupGrace]);
      if (signal?.aborted) throw createAbortError();
      throw error;
    } finally {
      removeAbortListener();
    }
  }
}
