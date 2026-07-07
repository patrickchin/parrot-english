import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLiveKitConversation,
  LIVEKIT_CONVERSATION_EVENTS,
} from "../src/livekit-conversation.ts";

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

    assert.deepEqual(log, [
      ["connect", "wss://livekit.example.test", "participant-token"],
      ["microphone", true],
      ["text", "I like pandas", { topic: "lk.chat" }],
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
    room.emit(
      LIVEKIT_CONVERSATION_EVENTS.transcription,
      [
        { id: "partial", text: "My name", final: false, language: "en" },
        { id: "final", text: "My name is Mia", final: true, language: "en" },
      ],
      { isLocal: true },
    );
    room.emit(LIVEKIT_CONVERSATION_EVENTS.disconnected, "server_shutdown");

    assert.deepEqual(events, [
      { type: "state", state: "reconnecting" },
      { type: "state", state: "connected" },
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
      { type: "disconnected", reason: "server_shutdown" },
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
      [0, 0, 0, 0, 0],
    );
    assert.deepEqual(room.log, [["disconnect"]]);
  });
});
