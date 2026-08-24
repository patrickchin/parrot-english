import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DisconnectReason, RoomEvent } from "livekit-client";
import {
  createLiveKitConversation,
  LIVEKIT_CONVERSATION_EVENTS,
} from "../src/conversation/livekit-conversation.ts";

class FakeRoom {
  constructor(log) {
    this.log = log;
    this.listeners = new Map();
    this.localParticipant = {
      setMicrophoneEnabled: async (enabled) => {
        this.log.push(["microphone", enabled]);
      },
      sendText: async (text, options) => {
        this.log.push(["text", text, options]);
      },
    };
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event, listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event, ...args) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  async connect(url, token) {
    this.log.push(["connect", url, token]);
  }

  async disconnect() {
    this.log.push(["disconnect"]);
  }

  async startAudio() {
    this.log.push(["start-audio"]);
  }
}

class FakeAudioElement {
  constructor(log, name) {
    this.listeners = new Map();
    this.log = log;
    this.name = name;
  }

  addEventListener(event, listener) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  emit(event) {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }

  listenerCount(event) {
    return this.listeners.get(event)?.size ?? 0;
  }

  remove() {
    this.log.push(`remove:${this.name}`);
  }

  removeEventListener(event, listener) {
    this.listeners.get(event)?.delete(listener);
  }
}

function createE2eScenarioConversation(scenario) {
  const hadWindow = Object.hasOwn(globalThis, "window");
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: { href: `https://parrot.test/?parrotE2eConversation=${scenario}` },
  };
  try {
    return createLiveKitConversation({
      token: "parrot-e2e-participant-token",
      url: "wss://parrot-e2e.invalid",
    });
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
}

describe("LiveKit conversation adapter", () => {
  it("keeps the lazy adapter event names aligned with the pinned SDK", () => {
    assert.deepEqual(LIVEKIT_CONVERSATION_EVENTS, {
      activeSpeakers: RoomEvent.ActiveSpeakersChanged,
      audioPlayback: RoomEvent.AudioPlaybackStatusChanged,
      disconnected: RoomEvent.Disconnected,
      participantAttributes: RoomEvent.ParticipantAttributesChanged,
      reconnected: RoomEvent.Reconnected,
      reconnecting: RoomEvent.Reconnecting,
      trackSubscribed: RoomEvent.TrackSubscribed,
      trackUnsubscribed: RoomEvent.TrackUnsubscribed,
      transcription: RoomEvent.TranscriptionReceived,
    });
  });

  it("does not load the real-time SDK until a real room connects", async () => {
    const log = [];
    const room = new FakeRoom(log);
    let roomLoads = 0;
    const conversation = createLiveKitConversation({
      async loadRoom() {
        roomLoads += 1;
        return room;
      },
      token: "participant-token",
      url: "wss://livekit.example.test",
    });

    assert.equal(roomLoads, 0);
    assert.deepEqual(log, []);

    await conversation.connect();
    assert.equal(roomLoads, 1);
    assert.deepEqual(log, [
      ["connect", "wss://livekit.example.test", "participant-token"],
    ]);

    await conversation.connect();
    assert.equal(roomLoads, 1);
  });

  it("provides a deterministic greeting only for the Maestro marker credentials", async () => {
    const conversation = createLiveKitConversation({
      token: "parrot-e2e-participant-token",
      url: "wss://parrot-e2e.invalid",
    });
    const events = [];
    conversation.subscribe((event) => events.push(event));

    await conversation.connect();
    await conversation.setMicrophoneEnabled(true);
    await conversation.commitUserTurn();
    await conversation.sendText("I like pandas");
    await conversation.repeatLastAudio();
    await conversation.disconnect();

    assert.deepEqual(events.slice(0, 4), [
      { type: "state", state: "connecting" },
      { type: "state", state: "connected" },
      { type: "audio-playback", state: "started" },
      {
        type: "transcription",
        id: "e2e-agent-greeting",
        text: "Hello again! What's your name?",
        final: true,
        language: "en",
        role: "assistant",
      },
    ]);
    assert.deepEqual(events.slice(4).map((event) => event.type), [
      "transcription",
      "transcription",
      "speech-started",
      "audio-playback",
    ]);
  });

  it("models blocked and delayed E2E playback states", async () => {
    const blocked = createE2eScenarioConversation("audio-blocked");
    const blockedEvents = [];
    blocked.subscribe((event) => blockedEvents.push(event));

    await blocked.connect();
    assert.deepEqual(
      blockedEvents
        .filter((event) => event.type === "audio-playback")
        .map((event) => event.state),
      ["blocked"],
    );

    const startingAudio = blocked.startAudio();
    assert.deepEqual(
      blockedEvents
        .filter((event) => event.type === "audio-playback")
        .map((event) => event.state),
      ["blocked"],
    );
    await startingAudio;
    await blocked.startAudio();
    assert.deepEqual(
      blockedEvents
        .filter((event) => event.type === "audio-playback")
        .map((event) => event.state),
      ["blocked", "ready", "started"],
    );
    await blocked.disconnect();

    const delayed = createE2eScenarioConversation("audio-delayed");
    const delayedEvents = [];
    delayed.subscribe((event) => delayedEvents.push(event));
    await delayed.connect();
    assert.deepEqual(
      delayedEvents.filter((event) => event.type === "audio-playback"),
      [],
    );
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.deepEqual(
      delayedEvents.filter((event) => event.type === "audio-playback"),
      [{ type: "audio-playback", state: "started" }],
    );
    await delayed.disconnect();
  });

  it("connects before enabling the microphone and sends bounded chat text", async () => {
    const log = [];
    const room = new FakeRoom(log);
    const conversation = createLiveKitConversation({
      room,
      token: "participant-token",
      url: "wss://livekit.example.test",
    });

    await assert.rejects(
      conversation.startAudio(),
      /Connect before starting audio/,
    );
    await conversation.connect();
    const startingAudio = conversation.startAudio();
    assert.deepEqual(log, [
      ["connect", "wss://livekit.example.test", "participant-token"],
      ["start-audio"],
    ]);
    await startingAudio;
    await conversation.setMicrophoneEnabled(true);
    await conversation.sendText("I like pandas");
    await conversation.repeatLastAudio();
    await conversation.commitUserTurn();

    assert.deepEqual(log, [
      ["connect", "wss://livekit.example.test", "participant-token"],
      ["start-audio"],
      ["microphone", true],
      ["text", "I like pandas", { topic: "lk.chat" }],
      [
        "text",
        "__parrot_repeat_last_audio__",
        { topic: "lk.chat" },
      ],
      [
        "text",
        "__parrot_commit_user_turn__",
        { topic: "lk.chat" },
      ],
    ]);
    await assert.rejects(
      conversation.sendText(" "),
      /Type a short answer first/,
    );
  });

  it("normalizes connection, finalized transcription, and disconnect events", async () => {
    const room = new FakeRoom([]);
    const conversation = createLiveKitConversation({
      room,
      token: "participant-token",
      url: "wss://livekit.example.test",
    });
    const events = [];
    conversation.subscribe((event) => events.push(event));

    room.emit(LIVEKIT_CONVERSATION_EVENTS.audioPlayback, false);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.audioPlayback, false);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.audioPlayback, true);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.audioPlayback, true);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.reconnecting);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.reconnected);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.activeSpeakers, [
      { isLocal: true },
    ]);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.activeSpeakers, [
      { isLocal: false },
    ]);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.activeSpeakers, []);
    assert.deepEqual(events.slice(-1), [
      { type: "speech-started", role: "assistant" },
    ]);
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.participantAttributes,
      { "lk.agent.state": "speaking" },
      { isLocal: false },
    );
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.participantAttributes,
      { "lk.agent.state": "listening" },
      { isLocal: false },
    );
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.transcription,
      [
        { id: "partial", text: "My name", final: false, language: "en" },
        { id: "final", text: "My name is Mia", final: true, language: "en" },
      ],
      { isLocal: true },
    );
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.disconnected,
      DisconnectReason.SERVER_SHUTDOWN,
    );
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.disconnected,
      DisconnectReason.ROOM_DELETED,
    );

    assert.deepEqual(events, [
      { type: "audio-playback", state: "blocked" },
      { type: "audio-playback", state: "ready" },
      { type: "state", state: "reconnecting" },
      { type: "state", state: "connected" },
      { type: "speech-started", role: "assistant" },
      { type: "speech-ended", role: "assistant" },
      {
        type: "transcription",
        id: "partial",
        text: "My name",
        final: false,
        language: "en",
        role: "user",
      },
      {
        type: "transcription",
        id: "final",
        text: "My name is Mia",
        final: true,
        language: "en",
        role: "user",
      },
      { type: "disconnected", reason: "SERVER_SHUTDOWN" },
      { type: "disconnected", reason: "ROOM_DELETED" },
    ]);
  });

  it("de-duplicates mounted playback and cleans replaced and disconnected tracks", async () => {
    const room = new FakeRoom([]);
    const removed = [];
    const firstElement = new FakeAudioElement(removed, "first");
    const secondElement = new FakeAudioElement(removed, "second");
    const firstTrack = {
      kind: "audio",
      attach() {
        return firstElement;
      },
      detach() {
        removed.push("detach:first");
      },
    };
    const secondTrack = {
      kind: "audio",
      attach() {
        return secondElement;
      },
      detach() {
        removed.push("detach:second");
      },
    };
    const mounted = [];
    const events = [];
    const conversation = createLiveKitConversation({
      mountAudio: (element) => mounted.push(element),
      room,
      token: "participant-token",
      url: "wss://livekit.example.test",
    });
    const unsubscribe = conversation.subscribe(() => {});
    conversation.subscribe((event) => events.push(event));

    room.emit(LIVEKIT_CONVERSATION_EVENTS.trackSubscribed, firstTrack);
    room.emit(LIVEKIT_CONVERSATION_EVENTS.trackSubscribed, firstTrack);
    assert.deepEqual(mounted, [firstElement]);
    assert.equal(firstElement.listenerCount("playing"), 1);
    firstElement.emit("playing");
    firstElement.emit("playing");
    assert.deepEqual(events, [{ type: "audio-playback", state: "started" }]);

    room.emit(LIVEKIT_CONVERSATION_EVENTS.trackUnsubscribed, firstTrack);
    assert.deepEqual(removed, ["remove:first"]);
    assert.equal(firstElement.listenerCount("playing"), 0);
    assert.deepEqual(events, [
      { type: "audio-playback", state: "started" },
      { type: "audio-playback", state: "stopped" },
    ]);
    firstElement.emit("playing");

    room.emit(LIVEKIT_CONVERSATION_EVENTS.trackSubscribed, secondTrack);
    secondElement.emit("playing");
    unsubscribe();
    await conversation.disconnect();

    assert.deepEqual(removed, [
      "remove:first",
      "detach:second",
      "remove:second",
    ]);
    assert.equal(secondElement.listenerCount("playing"), 0);
    assert.deepEqual(events, [
      { type: "audio-playback", state: "started" },
      { type: "audio-playback", state: "stopped" },
      { type: "audio-playback", state: "started" },
      { type: "audio-playback", state: "stopped" },
    ]);
    secondElement.emit("playing");
    room.emit(LIVEKIT_CONVERSATION_EVENTS.audioPlayback, false);
    assert.equal(events.length, 4);
    assert.deepEqual(
      [...room.listeners.values()].map((listeners) => listeners.size),
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
    assert.deepEqual(room.log, [["disconnect"]]);
  });
});
