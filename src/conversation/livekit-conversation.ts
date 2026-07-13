import { Room, RoomEvent } from "livekit-client";
import { REPEAT_LAST_AUDIO_COMMAND } from "../../lib/conversation-audio.js";

export const LIVEKIT_CONVERSATION_EVENTS = {
  activeSpeakers: RoomEvent.ActiveSpeakersChanged,
  disconnected: RoomEvent.Disconnected,
  reconnected: RoomEvent.Reconnected,
  reconnecting: RoomEvent.Reconnecting,
  trackSubscribed: RoomEvent.TrackSubscribed,
  transcription: RoomEvent.TranscriptionReceived,
} as const;

export type ConversationTransportEvent =
  | { type: "state"; state: "connecting" | "connected" | "reconnecting" }
  | { type: "speech-started"; role: "assistant" }
  | {
      type: "transcription";
      id: string;
      text: string;
      final: boolean;
      language: string | null;
      role: "user" | "assistant";
    }
  | { type: "disconnected"; reason: string };

type Listener = (event: ConversationTransportEvent) => void;
type EventListener = (...args: unknown[]) => void;

type AudioElementLike = { remove(): void };
type TrackLike = {
  kind?: unknown;
  attach?: () => AudioElementLike;
  detach?: () => unknown;
};

type RoomLike = {
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  localParticipant: {
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>;
    sendText(text: string, options: { topic: string }): Promise<unknown>;
  };
  on(event: RoomEvent, listener: EventListener): unknown;
  off(event: RoomEvent, listener: EventListener): unknown;
};

type CreateLiveKitConversationOptions = {
  mountAudio?: (element: AudioElementLike) => void;
  room?: RoomLike;
  token: string;
  url: string;
};

const E2E_PARTICIPANT_TOKEN = "parrot-e2e-participant-token";
const E2E_LIVEKIT_URL = "wss://parrot-e2e.invalid";

function defaultMountAudio(element: AudioElementLike) {
  if (element instanceof HTMLMediaElement) {
    element.autoplay = true;
    element.dataset.conversationAudio = "true";
  }
  const browserDocument = (
    globalThis as unknown as {
      document: { body: { appendChild(node: unknown): void } };
    }
  ).document;
  browserDocument.body.appendChild(element);
}

function segmentRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (segment): segment is Record<string, unknown> =>
          segment !== null && typeof segment === "object" && !Array.isArray(segment),
      )
    : [];
}

function createE2eLiveKitConversation() {
  const listeners = new Set<Listener>();
  const transcriptTimers = new Set<ReturnType<typeof setTimeout>>();
  const greeting = "Hello again! What's your name?";
  let learnerTurnId: string | null = null;
  let learnerTurnSequence = 0;

  function publish(event: ConversationTransportEvent) {
    for (const listener of listeners) listener(event);
  }

  function clearTranscriptTimers() {
    for (const timer of transcriptTimers) clearTimeout(timer);
    transcriptTimers.clear();
  }

  function scheduleTranscript(text: string, delayMs: number) {
    const timer = setTimeout(() => {
      transcriptTimers.delete(timer);
      if (!learnerTurnId) return;
      publish({
        type: "transcription",
        id: learnerTurnId,
        text,
        final: false,
        language: "en",
        role: "user",
      });
    }, delayMs);
    transcriptTimers.add(timer);
  }

  return {
    async connect() {
      publish({ type: "state", state: "connecting" });
      await Promise.resolve();
      publish({ type: "state", state: "connected" });
      publish({
        type: "transcription",
        id: "e2e-agent-greeting",
        text: greeting,
        final: true,
        language: "en",
        role: "assistant",
      });
    },

    async setMicrophoneEnabled(enabled: boolean) {
      if (enabled) {
        clearTranscriptTimers();
        learnerTurnSequence += 1;
        learnerTurnId = `e2e-learner-${learnerTurnSequence}`;
        scheduleTranscript("My name", 40);
        scheduleTranscript("My name is Mia", 80);
        return;
      }
      if (!learnerTurnId) return;
      clearTranscriptTimers();
      publish({
        type: "transcription",
        id: learnerTurnId,
        text: "My name is Mia",
        final: true,
        language: "en",
        role: "user",
      });
      learnerTurnId = null;
    },

    async repeatLastAudio() {
      publish({ type: "speech-started", role: "assistant" });
      globalThis.setTimeout(() => {
        publish({
          type: "transcription",
          id: `e2e-agent-repeat-${Date.now()}`,
          text: greeting,
          final: true,
          language: "en",
          role: "assistant",
        });
      }, 1_000);
    },

    async sendText(text: string) {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Type a short answer first.");
      publish({
        type: "transcription",
        id: `e2e-user-${Date.now()}`,
        text: trimmed,
        final: true,
        language: "en",
        role: "user",
      });
    },

    async disconnect() {
      clearTranscriptTimers();
      learnerTurnId = null;
      listeners.clear();
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createLiveKitConversation({
  mountAudio = defaultMountAudio,
  room,
  token,
  url,
}: CreateLiveKitConversationOptions) {
  if (token === E2E_PARTICIPANT_TOKEN && url === E2E_LIVEKIT_URL) {
    return createE2eLiveKitConversation();
  }
  const activeRoom = room ?? (new Room() as unknown as RoomLike);
  const listeners = new Set<Listener>();
  const attachments = new Map<TrackLike, AudioElementLike>();
  let connected = false;
  let disconnected = false;

  function publish(event: ConversationTransportEvent) {
    for (const listener of listeners) listener(event);
  }

  const eventListeners = new Map<RoomEvent, EventListener>([
    [
      RoomEvent.ActiveSpeakersChanged,
      (participants) => {
        if (
          !Array.isArray(participants) ||
          !participants.some(
            (participant) =>
              participant !== null &&
              typeof participant === "object" &&
              (!("isLocal" in participant) || participant.isLocal !== true),
          )
        ) {
          return;
        }
        publish({ type: "speech-started", role: "assistant" });
      },
    ],
    [RoomEvent.Reconnecting, () => publish({ type: "state", state: "reconnecting" })],
    [RoomEvent.Reconnected, () => publish({ type: "state", state: "connected" })],
    [
      RoomEvent.Disconnected,
      (reason) =>
        publish({
          type: "disconnected",
          reason: typeof reason === "string" ? reason : String(reason ?? "unknown"),
        }),
    ],
    [
      RoomEvent.TranscriptionReceived,
      (segments, participant) => {
        const local =
          participant !== null &&
          typeof participant === "object" &&
          "isLocal" in participant &&
          participant.isLocal === true;
        for (const segment of segmentRecords(segments)) {
          if (typeof segment.id !== "string" || typeof segment.text !== "string") {
            continue;
          }
          publish({
            type: "transcription",
            id: segment.id,
            text: segment.text,
            final: segment.final === true,
            language: typeof segment.language === "string" ? segment.language : null,
            role: local ? "user" : "assistant",
          });
        }
      },
    ],
    [
      RoomEvent.TrackSubscribed,
      (candidate) => {
        const track = candidate as TrackLike;
        if (track.kind !== "audio" || typeof track.attach !== "function") return;
        const element = track.attach();
        attachments.set(track, element);
        mountAudio(element);
      },
    ],
  ]);

  for (const [event, listener] of eventListeners) activeRoom.on(event, listener);

  return {
    async connect() {
      if (connected) return;
      publish({ type: "state", state: "connecting" });
      await activeRoom.connect(url, token);
      connected = true;
      publish({ type: "state", state: "connected" });
    },

    async setMicrophoneEnabled(enabled: boolean) {
      if (!connected) throw new Error("Connect before changing the microphone.");
      await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
    },

    async repeatLastAudio() {
      if (!connected) throw new Error("Connect before repeating audio.");
      await activeRoom.localParticipant.sendText(REPEAT_LAST_AUDIO_COMMAND, {
        topic: "lk.chat",
      });
    },

    async sendText(text: string) {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Type a short answer first.");
      if (trimmed.length > 1_000) throw new Error("Please use 1000 characters or fewer.");
      if (!connected) throw new Error("Connect before sending an answer.");
      await activeRoom.localParticipant.sendText(trimmed, { topic: "lk.chat" });
    },

    async disconnect() {
      if (disconnected) return;
      disconnected = true;
      for (const [event, listener] of eventListeners) {
        activeRoom.off(event, listener);
      }
      for (const [track, element] of attachments) {
        track.detach?.();
        element.remove();
      }
      attachments.clear();
      listeners.clear();
      await activeRoom.disconnect();
      connected = false;
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type LiveKitConversation = ReturnType<typeof createLiveKitConversation>;
