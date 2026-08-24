import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPERIENCE_EVENT_SCHEMA_VERSION,
  MAX_EXPERIENCE_DURATION_MS,
  createExperienceEvents,
} from "../src/experience/experience-events.ts";

function createQueuedBoundary(options = {}) {
  const delivered = [];
  const tasks = [];
  const boundary = createExperienceEvents({
    schedule: (task) => tasks.push(task),
    sink: (event) => delivered.push(event),
    ...options,
  });
  return { boundary, delivered, tasks };
}

const acceptedEvents = [
  {
    apiReadyMs: 120,
    learnerTurnReadyMs: 450,
    microphoneMutedMs: 360,
    name: "conversation_start",
    outcome: "ready",
    roomReadyMs: 300,
    surface: "talk",
  },
  {
    durationMs: 340,
    name: "conversation_start",
    outcome: "failed",
    stage: "room",
    surface: "learner_profile",
  },
  {
    durationMs: 1_240,
    name: "conversation_turn_response",
    outcome: "assistant_signal",
    surface: "talk",
  },
  {
    durationMs: 850,
    name: "lesson_microphone",
    outcome: "access_failed",
  },
  {
    durationMs: 975,
    name: "lesson_speech_check",
    outcome: "completed",
  },
  {
    durationMs: 1_240,
    name: "conversation_audio_playback",
    outcome: "ready",
    surface: "learner_profile",
  },
];

describe("privacy-safe experience events", () => {
  it("reconstructs, freezes, and asynchronously delivers every allowlisted shape", () => {
    const { boundary, delivered, tasks } = createQueuedBoundary();

    for (const candidate of acceptedEvents) {
      const input = { ...candidate };
      assert.equal(boundary.emit(input), true);
      input.injectedAfterValidation = "child transcript";
    }

    assert.deepEqual(delivered, []);
    assert.equal(tasks.length, acceptedEvents.length);
    tasks.forEach((task) => task());

    assert.equal(delivered.length, acceptedEvents.length);
    for (const event of delivered) {
      assert.equal(event.schemaVersion, EXPERIENCE_EVENT_SCHEMA_VERSION);
      assert.equal(Object.isFrozen(event), true);
      assert.doesNotMatch(JSON.stringify(event), /child transcript/);
    }
    assert.deepEqual(
      delivered.map((event) => Object.keys(event).sort()),
      [
        [
          "apiReadyMs",
          "learnerTurnReadyMs",
          "microphoneMutedMs",
          "name",
          "outcome",
          "roomReadyMs",
          "schemaVersion",
          "surface",
        ],
        ["durationMs", "name", "outcome", "schemaVersion", "stage", "surface"],
        ["durationMs", "name", "outcome", "schemaVersion", "surface"],
        ["durationMs", "name", "outcome", "schemaVersion"],
        ["durationMs", "name", "outcome", "schemaVersion"],
        ["durationMs", "name", "outcome", "schemaVersion", "surface"],
      ],
    );
  });

  it("accepts the blocked playback outcome without adding diagnostic fields", () => {
    const { boundary, delivered, tasks } = createQueuedBoundary();

    assert.equal(
      boundary.emit({
        durationMs: 640,
        name: "conversation_audio_playback",
        outcome: "blocked",
        surface: "talk",
      }),
      true,
    );
    tasks.forEach((task) => task());

    assert.deepEqual(delivered, [
      {
        durationMs: 640,
        name: "conversation_audio_playback",
        outcome: "blocked",
        schemaVersion: EXPERIENCE_EVENT_SCHEMA_VERSION,
        surface: "talk",
      },
    ]);
  });

  it("rejects unknown, extra, identifying, malformed, and inconsistent fields", () => {
    const symbol = Symbol("hidden-child-data");
    const nonEnumerable = {
      durationMs: 10,
      name: "lesson_microphone",
      outcome: "ready",
    };
    Object.defineProperty(nonEnumerable, "learnerName", {
      enumerable: false,
      value: "Mia",
    });
    const getter = {
      durationMs: 10,
      name: "lesson_microphone",
      get outcome() {
        throw new Error("should not read child data getter");
      },
    };
    class EventLike {
      durationMs = 10;
      name = "lesson_microphone";
      outcome = "ready";
    }

    const invalid = [
      null,
      [],
      { durationMs: 10, name: "unknown", outcome: "ready" },
      { durationMs: 10, name: "lesson_microphone" },
      {
        durationMs: 10,
        learnerName: "Mia",
        name: "lesson_microphone",
        outcome: "ready",
      },
      {
        durationMs: 10,
        name: "lesson_microphone",
        outcome: "ready",
        transcript: "My name is Mia",
      },
      { durationMs: -1, name: "lesson_microphone", outcome: "ready" },
      { durationMs: 1.5, name: "lesson_microphone", outcome: "ready" },
      { durationMs: Number.NaN, name: "lesson_microphone", outcome: "ready" },
      { durationMs: Infinity, name: "lesson_microphone", outcome: "ready" },
      {
        durationMs: MAX_EXPERIENCE_DURATION_MS + 1,
        name: "lesson_microphone",
        outcome: "ready",
      },
      { durationMs: 10, name: "lesson_microphone", outcome: "denied" },
      {
        apiReadyMs: 300,
        learnerTurnReadyMs: 500,
        microphoneMutedMs: 400,
        name: "conversation_start",
        outcome: "ready",
        roomReadyMs: 200,
        surface: "talk",
      },
      {
        apiReadyMs: 100,
        learnerTurnReadyMs: 200,
        microphoneMutedMs: 150,
        name: "conversation_start",
        outcome: "ready",
        roomReadyMs: 300,
        surface: "talk",
      },
      {
        apiReadyMs: 100,
        learnerTurnReadyMs: 400,
        microphoneMutedMs: 150,
        name: "conversation_start",
        outcome: "ready",
        roomReadyMs: 200,
        surface: "talk",
      },
      {
        apiReadyMs: 100,
        learnerTurnReadyMs: 200,
        microphoneMutedMs: 300,
        name: "conversation_start",
        outcome: "ready",
        roomReadyMs: 150,
        surface: "talk",
      },
      {
        durationMs: 10,
        name: "conversation_audio_playback",
        outcome: "started",
        surface: "talk",
      },
      {
        durationMs: 10,
        name: "conversation_audio_playback",
        outcome: "blocked",
        surface: "/talk-to-peppa?learner=Mia",
      },
      {
        conversationId: "conversation-Mia",
        durationMs: 10,
        name: "conversation_audio_playback",
        outcome: "ready",
        surface: "talk",
      },
      {
        durationMs: 10,
        name: "conversation_audio_playback",
        outcome: "ready",
        surface: "talk",
        transcript: "Hello Mia",
      },
      {
        durationMs: MAX_EXPERIENCE_DURATION_MS + 1,
        name: "conversation_audio_playback",
        outcome: "blocked",
        surface: "talk",
      },
      {
        durationMs: 10,
        name: "conversation_turn_response",
        outcome: "assistant_signal",
        surface: "/lessons/my/child-title",
      },
      Object.assign(
        { durationMs: 10, name: "lesson_microphone", outcome: "ready" },
        { [symbol]: "secret" },
      ),
      nonEnumerable,
      getter,
      new EventLike(),
      new Proxy(
        { durationMs: 10, name: "lesson_microphone", outcome: "ready" },
        {
          ownKeys() {
            throw new Error("hostile proxy");
          },
        },
      ),
    ];
    const { boundary, tasks } = createQueuedBoundary();

    for (const input of invalid) assert.equal(boundary.emit(input), false);
    assert.deepEqual(tasks, []);
  });

  it("does not read the clock or schedule work while no sink is installed", () => {
    let clockReads = 0;
    let scheduled = 0;
    const boundary = createExperienceEvents({
      now() {
        clockReads += 1;
        return 100;
      },
      schedule() {
        scheduled += 1;
      },
    });

    const timeline = boundary.start();
    assert.equal(timeline.mark(), null);
    assert.equal(timeline.finish(), null);
    assert.equal(boundary.emit(acceptedEvents[0]), false);
    assert.equal(clockReads, 0);
    assert.equal(scheduled, 0);
  });

  it("uses one monotonic origin, rounds, bounds, and cancels a timeline", () => {
    let now = 100;
    const { boundary } = createQueuedBoundary({ now: () => now });
    const timeline = boundary.start();

    now = 80;
    assert.equal(timeline.mark(), 0);
    now = 125.6;
    assert.equal(timeline.mark(), 26);
    now = 120;
    assert.equal(timeline.mark(), 26);
    now = MAX_EXPERIENCE_DURATION_MS + 1_000;
    assert.equal(timeline.finish(), MAX_EXPERIENCE_DURATION_MS);
    assert.equal(timeline.mark(), null);
    assert.equal(timeline.finish(), null);

    const cancelled = boundary.start();
    cancelled.cancel();
    assert.equal(cancelled.mark(), null);
  });

  it("does not resurrect a removed sink when removers run out of order", () => {
    const tasks = [];
    const first = [];
    const second = [];
    const boundary = createExperienceEvents({
      schedule: (task) => tasks.push(task),
    });
    const restoreFirst = boundary.installSink((event) => first.push(event));
    const restoreSecond = boundary.installSink((event) => second.push(event));

    assert.equal(boundary.emit(acceptedEvents[3]), true);
    tasks.shift()();
    restoreFirst();
    restoreSecond();
    assert.equal(boundary.emit(acceptedEvents[4]), false);
    tasks.forEach((task) => task());

    assert.deepEqual(second.map((event) => event.name), ["lesson_microphone"]);
    assert.deepEqual(first, []);
  });

  it("drops queued delivery when its sink has been removed", () => {
    const tasks = [];
    const delivered = [];
    const boundary = createExperienceEvents({
      schedule: (task) => tasks.push(task),
    });
    const restore = boundary.installSink((event) => delivered.push(event));

    assert.equal(boundary.emit(acceptedEvents[3]), true);
    restore();
    tasks.forEach((task) => task());

    assert.deepEqual(delivered, []);
    assert.equal(boundary.emit(acceptedEvents[4]), false);
  });

  it("invalidates an in-flight timeline when its sink is replaced", () => {
    let now = 100;
    const first = [];
    const second = [];
    const boundary = createExperienceEvents({
      now: () => now,
      schedule: (task) => task(),
    });
    const removeFirst = boundary.installSink((event) => first.push(event));
    const timeline = boundary.start();

    now = 150;
    removeFirst();
    boundary.installSink((event) => second.push(event));

    assert.equal(timeline.mark(), null);
    assert.equal(timeline.finish(), null);
    assert.deepEqual(first, []);
    assert.deepEqual(second, []);
  });

  it("isolates scheduler, synchronous sink, and rejected sink failures", async () => {
    const schedulerFailure = createExperienceEvents({
      schedule() {
        throw new Error("scheduler failed");
      },
      sink() {},
    });
    assert.equal(schedulerFailure.emit(acceptedEvents[3]), false);

    const syncSinkFailure = createExperienceEvents({
      schedule: (task) => task(),
      sink() {
        throw new Error("sink failed");
      },
    });
    assert.equal(syncSinkFailure.emit(acceptedEvents[3]), true);

    const rejectedSink = createExperienceEvents({
      schedule: (task) => task(),
      sink: () => Promise.reject(new Error("async sink failed")),
    });
    assert.equal(rejectedSink.emit(acceptedEvents[3]), true);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  });
});
