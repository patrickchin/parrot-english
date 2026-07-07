import { Room, RoomEvent } from "livekit-client";

export const LIVEKIT_CONVERSATION_EVENTS = {
  disconnected: RoomEvent.Disconnected,
  reconnected: RoomEvent.Reconnected,
  reconnecting: RoomEvent.Reconnecting,
  trackSubscribed: RoomEvent.TrackSubscribed,
  transcription: RoomEvent.TranscriptionReceived,
} as const;

export type ConversationTransportEvent =
  | { type: "state"; state: "connecting" | "connected" | "reconnecting" }
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

export function createLiveKitConversation({
  mountAudio = defaultMountAudio,
  room = new Room() as unknown as RoomLike,
  token,
  url,
}: CreateLiveKitConversationOptions) {
  const listeners = new Set<Listener>();
  const attachments = new Map<TrackLike, AudioElementLike>();
  let connected = false;
  let disconnected = false;

  function publish(event: ConversationTransportEvent) {
    for (const listener of listeners) listener(event);
  }

  const eventListeners = new Map<RoomEvent, EventListener>([
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

  for (const [event, listener] of eventListeners) room.on(event, listener);

  return {
    async connect() {
      if (connected) return;
      publish({ type: "state", state: "connecting" });
      await room.connect(url, token);
      connected = true;
      publish({ type: "state", state: "connected" });
    },

    async setMicrophoneEnabled(enabled: boolean) {
      if (!connected) throw new Error("Connect before changing the microphone.");
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },

    async sendText(text: string) {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Type a short answer first.");
      if (trimmed.length > 1_000) throw new Error("Please use 1000 characters or fewer.");
      if (!connected) throw new Error("Connect before sending an answer.");
      await room.localParticipant.sendText(trimmed, { topic: "lk.chat" });
    },

    async disconnect() {
      if (disconnected) return;
      disconnected = true;
      for (const [event, listener] of eventListeners) room.off(event, listener);
      for (const [track, element] of attachments) {
        track.detach?.();
        element.remove();
      }
      attachments.clear();
      listeners.clear();
      await room.disconnect();
      connected = false;
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type LiveKitConversation = ReturnType<typeof createLiveKitConversation>;
