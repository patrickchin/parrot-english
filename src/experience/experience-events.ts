export const EXPERIENCE_EVENT_SCHEMA_VERSION = 1 as const;
export const MAX_EXPERIENCE_DURATION_MS = 5 * 60 * 1_000;

const CONVERSATION_AUDIO_PLAYBACK_OUTCOME_VALUES = [
  "ready",
  "blocked",
] as const;
const CONVERSATION_RESPONSE_OUTCOME_VALUES = [
  "assistant_signal",
  "disconnected",
  "microphone_stop_failed",
  "send_failed",
] as const;

export type ConversationAudioPlaybackOutcome =
  (typeof CONVERSATION_AUDIO_PLAYBACK_OUTCOME_VALUES)[number];
export type ConversationResponseOutcome =
  (typeof CONVERSATION_RESPONSE_OUTCOME_VALUES)[number];

export type ConversationExperienceSurface = "learner_profile" | "talk";

type ConversationStartReadyInput = {
  apiReadyMs: number;
  learnerTurnReadyMs: number;
  microphoneMutedMs: number;
  name: "conversation_start";
  outcome: "ready";
  roomReadyMs: number;
  surface: ConversationExperienceSurface;
};

type ConversationStartFailedInput = {
  durationMs: number;
  name: "conversation_start";
  outcome: "failed";
  stage: "api" | "microphone_mute" | "opening" | "room";
  surface: ConversationExperienceSurface;
};

type ConversationAudioPlaybackInput = {
  durationMs: number;
  name: "conversation_audio_playback";
  outcome: ConversationAudioPlaybackOutcome;
  surface: ConversationExperienceSurface;
};

type ConversationTurnResponseInput = {
  durationMs: number;
  name: "conversation_turn_response";
  outcome: ConversationResponseOutcome;
  surface: ConversationExperienceSurface;
};

type LessonMicrophoneInput = {
  durationMs: number;
  name: "lesson_microphone";
  outcome: "access_failed" | "failed" | "ready" | "unsupported";
};

type LessonSpeechCheckInput = {
  durationMs: number;
  name: "lesson_speech_check";
  outcome: "completed" | "failed";
};

export type ExperienceEventInput =
  | ConversationAudioPlaybackInput
  | ConversationStartFailedInput
  | ConversationStartReadyInput
  | ConversationTurnResponseInput
  | LessonMicrophoneInput
  | LessonSpeechCheckInput;

export type ExperienceEvent = Readonly<
  ExperienceEventInput & {
    schemaVersion: typeof EXPERIENCE_EVENT_SCHEMA_VERSION;
  }
>;

export type ExperienceEventSink = (
  event: ExperienceEvent,
) => PromiseLike<void> | void;

export type ExperienceTimeline = Readonly<{
  cancel: () => void;
  finish: () => number | null;
  mark: () => number | null;
}>;

type ExperienceClock = () => number;

type ExperienceEventsOptions = {
  now?: ExperienceClock;
  schedule?: (task: () => void) => void;
  sink?: ExperienceEventSink | null;
};

const CONVERSATION_SURFACES = new Set<ConversationExperienceSurface>([
  "learner_profile",
  "talk",
]);
const CONVERSATION_FAILURE_STAGES = new Set([
  "api",
  "microphone_mute",
  "opening",
  "room",
]);
const CONVERSATION_AUDIO_PLAYBACK_OUTCOMES = new Set<string>(
  CONVERSATION_AUDIO_PLAYBACK_OUTCOME_VALUES,
);
const CONVERSATION_RESPONSE_OUTCOMES = new Set<string>(
  CONVERSATION_RESPONSE_OUTCOME_VALUES,
);
const LESSON_MICROPHONE_OUTCOMES = new Set([
  "access_failed",
  "failed",
  "ready",
  "unsupported",
]);
const LESSON_SPEECH_CHECK_OUTCOMES = new Set(["completed", "failed"]);

const NOOP_TIMELINE: ExperienceTimeline = Object.freeze({
  cancel() {},
  finish: () => null,
  mark: () => null,
});

function browserNow() {
  return globalThis.performance.now();
}

function scheduleAfterInteraction(task: () => void) {
  globalThis.setTimeout(task, 0);
}

function hasExactKeys(record: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(record);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(record, key))
  );
}

function readPlainDataRecord(value: unknown): Record<string, unknown> | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) return null;

    const record: Record<string, unknown> = Object.create(null);
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function isDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_EXPERIENCE_DURATION_MS
  );
}

function isConversationSurface(
  value: unknown,
): value is ConversationExperienceSurface {
  return (
    typeof value === "string" &&
    CONVERSATION_SURFACES.has(value as ConversationExperienceSurface)
  );
}

function safeEvent(input: unknown): ExperienceEvent | null {
  const record = readPlainDataRecord(input);
  if (!record || typeof record.name !== "string") return null;

  if (record.name === "conversation_start" && record.outcome === "ready") {
    if (
      !hasExactKeys(record, [
        "apiReadyMs",
        "learnerTurnReadyMs",
        "microphoneMutedMs",
        "name",
        "outcome",
        "roomReadyMs",
        "surface",
      ]) ||
      !isConversationSurface(record.surface) ||
      !isDuration(record.apiReadyMs) ||
      !isDuration(record.roomReadyMs) ||
      !isDuration(record.microphoneMutedMs) ||
      !isDuration(record.learnerTurnReadyMs) ||
      record.apiReadyMs > record.roomReadyMs ||
      record.roomReadyMs > record.microphoneMutedMs ||
      record.microphoneMutedMs > record.learnerTurnReadyMs
    ) {
      return null;
    }
    return Object.freeze({
      apiReadyMs: record.apiReadyMs,
      learnerTurnReadyMs: record.learnerTurnReadyMs,
      microphoneMutedMs: record.microphoneMutedMs,
      name: "conversation_start",
      outcome: "ready",
      roomReadyMs: record.roomReadyMs,
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
      surface: record.surface,
    });
  }

  if (record.name === "conversation_start" && record.outcome === "failed") {
    if (
      !hasExactKeys(record, [
        "durationMs",
        "name",
        "outcome",
        "stage",
        "surface",
      ]) ||
      !isConversationSurface(record.surface) ||
      typeof record.stage !== "string" ||
      !CONVERSATION_FAILURE_STAGES.has(record.stage) ||
      !isDuration(record.durationMs)
    ) {
      return null;
    }
    return Object.freeze({
      durationMs: record.durationMs,
      name: "conversation_start",
      outcome: "failed",
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
      stage: record.stage as ConversationStartFailedInput["stage"],
      surface: record.surface,
    });
  }

  if (record.name === "conversation_audio_playback") {
    if (
      !hasExactKeys(record, ["durationMs", "name", "outcome", "surface"]) ||
      !isConversationSurface(record.surface) ||
      typeof record.outcome !== "string" ||
      !CONVERSATION_AUDIO_PLAYBACK_OUTCOMES.has(record.outcome) ||
      !isDuration(record.durationMs)
    ) {
      return null;
    }
    return Object.freeze({
      durationMs: record.durationMs,
      name: "conversation_audio_playback",
      outcome: record.outcome as ConversationAudioPlaybackInput["outcome"],
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
      surface: record.surface,
    });
  }

  if (record.name === "conversation_turn_response") {
    if (
      !hasExactKeys(record, ["durationMs", "name", "outcome", "surface"]) ||
      !isConversationSurface(record.surface) ||
      typeof record.outcome !== "string" ||
      !CONVERSATION_RESPONSE_OUTCOMES.has(record.outcome) ||
      !isDuration(record.durationMs)
    ) {
      return null;
    }
    return Object.freeze({
      durationMs: record.durationMs,
      name: "conversation_turn_response",
      outcome: record.outcome as ConversationTurnResponseInput["outcome"],
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
      surface: record.surface,
    });
  }

  if (record.name === "lesson_microphone") {
    if (
      !hasExactKeys(record, ["durationMs", "name", "outcome"]) ||
      typeof record.outcome !== "string" ||
      !LESSON_MICROPHONE_OUTCOMES.has(record.outcome) ||
      !isDuration(record.durationMs)
    ) {
      return null;
    }
    return Object.freeze({
      durationMs: record.durationMs,
      name: "lesson_microphone",
      outcome: record.outcome as LessonMicrophoneInput["outcome"],
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
    });
  }

  if (record.name === "lesson_speech_check") {
    if (
      !hasExactKeys(record, ["durationMs", "name", "outcome"]) ||
      typeof record.outcome !== "string" ||
      !LESSON_SPEECH_CHECK_OUTCOMES.has(record.outcome) ||
      !isDuration(record.durationMs)
    ) {
      return null;
    }
    return Object.freeze({
      durationMs: record.durationMs,
      name: "lesson_speech_check",
      outcome: record.outcome as LessonSpeechCheckInput["outcome"],
      schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
    });
  }

  return null;
}

export function createExperienceEvents({
  now = browserNow,
  schedule = scheduleAfterInteraction,
  sink: initialSink = null,
}: ExperienceEventsOptions = {}) {
  let sink = typeof initialSink === "function" ? initialSink : null;
  let sinkGeneration = 0;

  function installSink(nextSink: ExperienceEventSink) {
    if (typeof nextSink !== "function") return () => {};
    sink = nextSink;
    sinkGeneration += 1;
    const installedGeneration = sinkGeneration;
    let installed = true;
    return () => {
      if (!installed) return;
      installed = false;
      if (sink === nextSink && sinkGeneration === installedGeneration) {
        sink = null;
        sinkGeneration += 1;
      }
    };
  }

  function start(timelineNow: ExperienceClock = now): ExperienceTimeline {
    if (!sink) return NOOP_TIMELINE;
    const timelineSink = sink;
    const timelineGeneration = sinkGeneration;

    let startedAt: number;
    try {
      startedAt = timelineNow();
    } catch {
      return NOOP_TIMELINE;
    }
    if (!Number.isFinite(startedAt)) return NOOP_TIMELINE;

    let active = true;
    let previousDurationMs = 0;
    const readDuration = () => {
      if (!active) return null;
      if (
        sink !== timelineSink ||
        sinkGeneration !== timelineGeneration
      ) {
        active = false;
        return null;
      }
      try {
        const measured = timelineNow() - startedAt;
        if (!Number.isFinite(measured)) {
          active = false;
          return null;
        }
        const durationMs = Math.min(
          MAX_EXPERIENCE_DURATION_MS,
          Math.max(previousDurationMs, Math.max(0, Math.round(measured))),
        );
        previousDurationMs = durationMs;
        return durationMs;
      } catch {
        active = false;
        return null;
      }
    };

    return Object.freeze({
      cancel() {
        active = false;
      },
      finish() {
        const durationMs = readDuration();
        active = false;
        return durationMs;
      },
      mark: readDuration,
    });
  }

  function emit(input: ExperienceEventInput) {
    const currentSink = sink;
    if (!currentSink) return false;
    const currentGeneration = sinkGeneration;
    const event = safeEvent(input);
    if (!event) return false;

    try {
      schedule(() => {
        if (sink !== currentSink || sinkGeneration !== currentGeneration) {
          return;
        }
        try {
          const result = currentSink(event);
          if (result) void Promise.resolve(result).catch(() => {});
        } catch {
          // Experience measurement must never interrupt a learner action.
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ emit, installSink, start });
}

export const experienceEvents = createExperienceEvents();
