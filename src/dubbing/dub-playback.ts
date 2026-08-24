import { DUB_DURATION_MS, DUB_LINES } from "./dub-script.ts";
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
  signal?: AbortSignal;
};

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
  signal,
}: StartDubPlaybackOptions): Promise<{ stop(): void }> {
  const context = new AudioContextClass();
  let frameId: number | null = null;
  let oscillators: OscillatorNode[] = [];
  let stopVoices: (() => void) | null = null;
  let stopped = false;
  let closePromise: Promise<void> | null = null;

  const stopPlayback = () => {
    if (stopped) return closePromise ?? Promise.resolve();
    stopped = true;
    signal?.removeEventListener("abort", handleAbort);
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
  const handleAbort = () => {
    void stopPlayback();
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    if (signal?.aborted) throw createAbortError();

    const decodedLines = await Promise.all(
      DUB_LINES.map(async ({ id }) => {
        const response = await request(getDubLineAudioUrl(id), {
          credentials: "same-origin",
          signal,
        });
        if (!response.ok) {
          throw new Error("Your saved dub could not be played. Try again.");
        }
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return [id, buffer] as const;
      }),
    );

    if (signal?.aborted) throw createAbortError();
    await context.resume();
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
    await stopPlayback();
    throw error;
  }
}
