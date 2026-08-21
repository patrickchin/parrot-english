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
}

describe("LiveKit conversation adapter", () => {
  it("keeps the lazy adapter event names aligned with the pinned SDK", () => {
    assert.deepEqual(LIVEKIT_CONVERSATION_EVENTS, {
      activeSpeakers: RoomEvent.ActiveSpeakersChanged,
      disconnected: RoomEvent.Disconnected,
      participantAttributes: RoomEvent.ParticipantAttributesChanged,
      reconnected: RoomEvent.Reconnected,
      reconnecting: RoomEvent.Reconnecting,
      trackSubscribed: RoomEvent.TrackSubscribed,
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

    assert.deepEqual(events.slice(0, 3), [
      { type: "state", state: "connecting" },
      { type: "state", state: "connected" },
      {
        type: "transcription",
        id: "e2e-agent-greeting",
        text: "Hello again! What's your name?",
        final: true,
        language: "en",
        role: "assistant",
      },
    ]);
    assert.deepEqual(events.slice(3).map((event) => event.type), [
      "transcription",
      "transcription",
      "speech-started",
    ]);
  });

  it("connects before enabling the microphone and sends bounded chat text", async () => {
    const log = [];
    const room = new FakeRoom(log);
    const conversation = createLiveKitConversation({
      room,
      token: "participant-token",
      url: "wss://livekit.example.test",
    });

    await conversation.connect();
    await conversation.setMicrophoneEnabled(true);
    await conversation.sendText("I like pandas");
    await conversation.repeatLastAudio();
    await conversation.commitUserTurn();

    assert.deepEqual(log, [
      ["connect", "wss://livekit.example.test", "participant-token"],
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

  it("attaches remote audio and removes every listener and element on disconnect", async () => {
    const room = new FakeRoom([]);
    const removed = [];
    const audioElement = { remove: () => removed.push("audio") };
    const track = {
      kind: "audio",
      attach() {
        return audioElement;
      },
      detach() {
        removed.push("detached");
      },
    };
    const mounted = [];
    const conversation = createLiveKitConversation({
      mountAudio: (element) => mounted.push(element),
      room,
      token: "participant-token",
      url: "wss://livekit.example.test",
    });
    const listener = () => {};
    const unsubscribe = conversation.subscribe(listener);

    room.emit(LIVEKIT_CONVERSATION_EVENTS.trackSubscribed, track);
    assert.deepEqual(mounted, [audioElement]);
    unsubscribe();
    await conversation.disconnect();

    assert.deepEqual(removed, ["detached", "audio"]);
    assert.deepEqual(
      [...room.listeners.values()].map((listeners) => listeners.size),
      [0, 0, 0, 0, 0, 0, 0],
    );
    assert.deepEqual(room.log, [["disconnect"]]);
  });
});
