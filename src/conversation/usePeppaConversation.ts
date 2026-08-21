import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  finalizeConversation,
  finishConversation,
  loadConversation,
  startConversation,
  type ConversationTurn,
} from "./conversation-api";
import type {
  ConversationSurfaceStatus,
  ConversationSurfaceTurn,
} from "./ConversationSurface";
import {
  createLiveKitConversation,
  type ConversationTransportEvent,
  type LiveKitConversation,
} from "./livekit-conversation";
import { createResponseLatencyTimer } from "./response-latency";
import type { ConversationPurpose } from "../../lib/conversation-purpose";
import {
  DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  type TalkToPeppaPromptStyle,
} from "../../lib/talk-to-peppa-prompt-style";

const COMPLETED_DISCONNECT_REASONS = new Set([
  "ROOM_DELETED",
  "task_complete",
]);

export function selectLearnerProfileExperience(
  serverMode: "realtime" | "form",
  userSelectedForm: boolean,
) {
  return serverMode === "realtime" && !userSelectedForm ? "realtime" : "form";
}

export function mergeConversationTurns(
  liveTurns: ConversationSurfaceTurn[],
  storedTurns: Array<Pick<ConversationTurn, "id" | "role" | "text">>,
) {
  const storedIds = new Set(storedTurns.map((turn) => turn.id));
  return [
    ...storedTurns.map(({ id, role, text }) => ({ id, role, text })),
    ...liveTurns.filter((turn) => !storedIds.has(turn.id)),
  ];
}

function readableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The voice conversation could not continue.";
}

function readableMicrophoneError(
  error: unknown,
  enabled: boolean,
  microphoneChanged: boolean,
) {
  const message = readableError(error);
  if (/denied|notallowed|not allowed|permission/i.test(message)) {
    return "Ask a grown-up to turn on the microphone.";
  }
  if (enabled) return "The microphone did not start. Tap again.";
  if (!microphoneChanged) {
    return "The microphone did not stop. Tap “I’m done” again.";
  }
  return "Your words did not send. Please try again.";
}

type UsePeppaConversationOptions = {
  active: boolean;
  createTransport?: typeof createLiveKitConversation;
  now?: () => number;
  onBack: () => void;
  onCompleted: () => Promise<void>;
  purpose: ConversationPurpose;
};

type ConversationRuntime = {
  assistantSpeaking: boolean;
  awaitingResponse: boolean;
  completingConversationId: string | null;
  learnerTurnOpen: boolean;
  openingHeard: boolean;
  transportReady: boolean;
};

function createConversationRuntime(): ConversationRuntime {
  return {
    assistantSpeaking: false,
    awaitingResponse: false,
    completingConversationId: null,
    learnerTurnOpen: false,
    openingHeard: false,
    transportReady: false,
  };
}

export function usePeppaConversation({
  active,
  createTransport = createLiveKitConversation,
  now,
  onBack,
  onCompleted,
  purpose,
}: UsePeppaConversationOptions) {
  const [status, setStatus] =
    useState<ConversationSurfaceStatus>("ready");
  const [turns, setTurns] = useState<ConversationSurfaceTurn[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [turnReady, setTurnReady] = useState(false);
  const [responseLatencyMs, setResponseLatencyMs] = useState<number | null>(null);
  const [responseLatencyTimer] = useState(() =>
    createResponseLatencyTimer(now),
  );
  const [error, setError] = useState("");
  const [promptStyle, setPromptStyle] = useState<TalkToPeppaPromptStyle>(
    DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  );
  const conversationIdRef = useRef<string | null>(null);
  const transportRef = useRef<LiveKitConversation | null>(null);
  const operationRef = useRef(0);
  const autoStartRef = useRef(false);
  const microphoneBusyRef = useRef(false);
  const runtimeRef = useRef(createConversationRuntime());

  const isCurrent = useCallback((operation: number) => {
    return operationRef.current === operation;
  }, []);

  const resetResponseLatency = useCallback(() => {
    responseLatencyTimer.reset();
    setResponseLatencyMs(null);
  }, [responseLatencyTimer]);

  const finishResponseLatency = useCallback(() => {
    const elapsedMs = responseLatencyTimer.finish();
    if (elapsedMs !== null) setResponseLatencyMs(elapsedMs);
  }, [responseLatencyTimer]);

  const loadSummary = useCallback(
    async (id: string, operation = operationRef.current) => {
      if (runtimeRef.current.completingConversationId === id) return;
      runtimeRef.current.completingConversationId = id;
      try {
        const loaded = await loadConversation(id);
        if (!isCurrent(operation)) return;
        setTurns((current) =>
          mergeConversationTurns(current, loaded.conversation.turns ?? []),
        );
        setTurnReady(false);
        setStatus("saving");
        await finalizeConversation(id);
        if (!isCurrent(operation)) return;
        conversationIdRef.current = null;
        await onCompleted();
      } catch (summaryError) {
        if (!isCurrent(operation)) return;
        runtimeRef.current.completingConversationId = null;
        setError(readableError(summaryError));
        setStatus("error");
      }
    },
    [isCurrent, onCompleted],
  );

  const openLearnerTurn = useCallback(
    async (operation: number) => {
      if (
        !isCurrent(operation) ||
        !runtimeRef.current.transportReady ||
        !runtimeRef.current.openingHeard ||
        runtimeRef.current.learnerTurnOpen ||
        !transportRef.current
      ) {
        return;
      }
      runtimeRef.current.learnerTurnOpen = true;
      runtimeRef.current.awaitingResponse = false;
      setMicrophoneEnabled(false);
      setMicrophoneBusy(false);
      setTurnReady(true);
      setStatus("listening");
    },
    [isCurrent],
  );

  const handleTransportEvent = useCallback(
    (event: ConversationTransportEvent, id: string, operation: number) => {
      if (!isCurrent(operation)) return;
      if (event.type === "state") {
        const connectedTurnReady =
          event.state === "connected" &&
          runtimeRef.current.learnerTurnOpen &&
          !runtimeRef.current.awaitingResponse &&
          !runtimeRef.current.assistantSpeaking;
        setTurnReady(connectedTurnReady);
        setStatus(
          event.state === "connected"
            ? runtimeRef.current.assistantSpeaking
              ? "speaking"
              : runtimeRef.current.learnerTurnOpen
              ? runtimeRef.current.awaitingResponse
                ? "thinking"
                : "listening"
              : "connecting"
            : event.state,
        );
        return;
      }
      if (event.type === "disconnected") {
        runtimeRef.current.awaitingResponse = false;
        runtimeRef.current.learnerTurnOpen = false;
        runtimeRef.current.transportReady = false;
        microphoneBusyRef.current = false;
        setMicrophoneBusy(false);
        setMicrophoneEnabled(false);
        setTurnReady(false);
        const transport = transportRef.current;
        transportRef.current = null;
        void transport?.disconnect();
        if (!COMPLETED_DISCONNECT_REASONS.has(event.reason)) {
          setError(
            "The chat stopped before you finished.",
          );
          setStatus("error");
          return;
        }
        setError("");
        setStatus("saving");
        void loadSummary(id, operation);
        return;
      }
      if (event.type === "speech-started") {
        if (event.role === "assistant") {
          runtimeRef.current.assistantSpeaking = true;
          setTurnReady(false);
          if (runtimeRef.current.awaitingResponse) {
            runtimeRef.current.awaitingResponse = false;
            finishResponseLatency();
          }
          if (!runtimeRef.current.learnerTurnOpen) {
            runtimeRef.current.openingHeard = true;
          }
          setStatus("speaking");
        }
        return;
      }
      if (event.type === "speech-ended") {
        if (event.role === "assistant") {
          runtimeRef.current.assistantSpeaking = false;
          if (!runtimeRef.current.learnerTurnOpen) {
            if (runtimeRef.current.openingHeard) {
              void openLearnerTurn(operation);
            } else {
              setStatus("connecting");
            }
          } else {
            setTurnReady(!runtimeRef.current.awaitingResponse);
            setStatus(
              runtimeRef.current.awaitingResponse ? "thinking" : "listening",
            );
          }
        }
        return;
      }
      if (event.role === "user") setLiveTranscript(event.text);
      setTurns((current) => {
        const turn: ConversationSurfaceTurn = {
          id: event.id,
          role: event.role,
          text: event.text,
        };
        const index = current.findIndex((entry) => entry.id === event.id);
        if (index === -1) return [...current, turn];
        return current.map((entry, entryIndex) =>
          entryIndex === index ? turn : entry,
        );
      });
      if (event.role === "assistant") {
        if (runtimeRef.current.awaitingResponse) finishResponseLatency();
        runtimeRef.current.awaitingResponse = false;
        if (event.final) {
          if (!runtimeRef.current.learnerTurnOpen) {
            runtimeRef.current.openingHeard = true;
            if (!runtimeRef.current.assistantSpeaking) {
              void openLearnerTurn(operation);
            }
          } else if (!runtimeRef.current.assistantSpeaking) {
            setTurnReady(true);
            setStatus("listening");
          }
        } else {
          setTurnReady(false);
          setStatus("speaking");
        }
      } else if (event.final) {
        setTurnReady(!runtimeRef.current.awaitingResponse);
        setStatus(
          runtimeRef.current.awaitingResponse ? "thinking" : "listening",
        );
      }
    },
    [finishResponseLatency, isCurrent, loadSummary, openLearnerTurn],
  );

  const start = useCallback(async () => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    const previousConversationId = conversationIdRef.current;
    conversationIdRef.current = null;
    const previousTransport = transportRef.current;
    transportRef.current = null;
    microphoneBusyRef.current = false;
    setError("");
    setStatus("connecting");
    setTurns([]);
    setLiveTranscript("");
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    runtimeRef.current = createConversationRuntime();
    resetResponseLatency();
    void previousTransport?.disconnect();
    if (previousConversationId) {
      void finishConversation(previousConversationId, "restarted_after_error").catch(
        () => {},
      );
    }
    try {
      const started = await startConversation(
        purpose === "small-chat"
          ? { promptStyle, purpose }
          : { purpose },
      );
      if (!isCurrent(operation)) return;
      conversationIdRef.current = started.conversation.id;
      const transport = createTransport({
        token: started.livekit.participantToken,
        url: started.livekit.url,
      });
      transportRef.current = transport;
      transport.subscribe((event) =>
        handleTransportEvent(event, started.conversation.id, operation),
      );
      await transport.connect();
      if (!isCurrent(operation)) {
        await transport.disconnect();
        return;
      }
      await transport.setMicrophoneEnabled(false);
      if (!isCurrent(operation)) return;
      runtimeRef.current.transportReady = true;
      setMicrophoneEnabled(false);
      if (
        runtimeRef.current.openingHeard &&
        !runtimeRef.current.assistantSpeaking
      ) {
        await openLearnerTurn(operation);
      } else {
        setStatus("connecting");
      }
      if (runtimeRef.current.assistantSpeaking) setStatus("speaking");
    } catch (startError) {
      if (!isCurrent(operation)) return;
      setError(readableError(startError));
      setStatus("error");
    }
  }, [
    createTransport,
    handleTransportEvent,
    isCurrent,
    openLearnerTurn,
    promptStyle,
    purpose,
    resetResponseLatency,
  ]);

  const finish = useCallback(async () => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    const operation = operationRef.current;
    microphoneBusyRef.current = false;
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    setStatus("saving");
    setError("");
    try {
      await finishConversation(conversationId, "finished_by_learner");
      await transportRef.current?.disconnect();
      transportRef.current = null;
      await loadSummary(conversationId, operation);
    } catch (finishError) {
      if (!isCurrent(operation)) return;
      setError(readableError(finishError));
      setStatus("error");
    }
  }, [isCurrent, loadSummary]);

  const back = useCallback(() => {
    operationRef.current += 1;
    microphoneBusyRef.current = false;
    const id = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    resetResponseLatency();
    setLiveTranscript("");
    setMicrophoneBusy(false);
    setTurnReady(false);
    onBack();
    if (id) void finishConversation(id, "left_conversation").catch(() => {});
    void transport?.disconnect();
  }, [onBack, resetResponseLatency]);

  const toggleMicrophone = useCallback(async () => {
    if (
      !transportRef.current ||
      !runtimeRef.current.learnerTurnOpen ||
      runtimeRef.current.awaitingResponse ||
      runtimeRef.current.assistantSpeaking ||
      microphoneBusyRef.current
    ) {
      return;
    }
    const operation = operationRef.current;
    const transport = transportRef.current;
    const enabled = !microphoneEnabled;
    let microphoneChanged = false;
    microphoneBusyRef.current = true;
    setMicrophoneBusy(true);
    setError("");
    if (!enabled) {
      responseLatencyTimer.start();
      runtimeRef.current.awaitingResponse = true;
      setMicrophoneEnabled(false);
      setTurnReady(false);
      setStatus("thinking");
    } else {
      setLiveTranscript("");
      responseLatencyTimer.reset();
    }
    try {
      await transport.setMicrophoneEnabled(enabled);
      if (!isCurrent(operation) || transportRef.current !== transport) return;
      microphoneChanged = true;
      if (enabled && runtimeRef.current.assistantSpeaking) {
        await transport.setMicrophoneEnabled(false);
        return;
      }
      setMicrophoneEnabled(enabled);
      if (!enabled) {
        await transport.commitUserTurn();
      }
    } catch (microphoneError) {
      if (!isCurrent(operation) || transportRef.current !== transport) return;
      if (!enabled && !runtimeRef.current.awaitingResponse) return;
      if (!enabled) {
        runtimeRef.current.awaitingResponse = false;
        responseLatencyTimer.reset();
        setMicrophoneEnabled(!microphoneChanged);
        setTurnReady(true);
        setStatus("listening");
      } else {
        setMicrophoneEnabled(false);
        setTurnReady(true);
      }
      setError(
        readableMicrophoneError(
          microphoneError,
          enabled,
          microphoneChanged,
        ),
      );
    } finally {
      if (isCurrent(operation) && transportRef.current === transport) {
        microphoneBusyRef.current = false;
        setMicrophoneBusy(false);
      }
    }
  }, [isCurrent, microphoneEnabled, responseLatencyTimer]);

  const repeatAudio = useCallback(async () => {
    if (
      !transportRef.current ||
      microphoneBusyRef.current ||
      microphoneEnabled ||
      status !== "listening" ||
      !turns.some((turn) => turn.role === "assistant" && turn.text.trim())
    ) {
      return;
    }
    setError("");
    setTurnReady(false);
    setStatus("speaking");
    try {
      await transportRef.current.repeatLastAudio();
    } catch (repeatError) {
      setError(readableError(repeatError));
      setTurnReady(true);
      setStatus("listening");
    }
  }, [microphoneEnabled, status, turns]);

  useEffect(() => {
    if (!active || status !== "ready" || autoStartRef.current) return;
    if (purpose === "small-chat") return;
    autoStartRef.current = true;
    void start();
  }, [active, purpose, start, status]);

  useEffect(() => {
    if (active) return;
    operationRef.current += 1;
    autoStartRef.current = false;
    microphoneBusyRef.current = false;
    runtimeRef.current = createConversationRuntime();
    resetResponseLatency();
    const activeConversationId = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    setStatus("ready");
    setTurns([]);
    setLiveTranscript("");
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    setError("");
    void transport?.disconnect();
    if (activeConversationId) {
      void finishConversation(activeConversationId, "left_conversation").catch(
        () => {},
      );
    }
  }, [active, resetResponseLatency]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      autoStartRef.current = false;
      microphoneBusyRef.current = false;
      runtimeRef.current = createConversationRuntime();
      responseLatencyTimer.reset();
      const transport = transportRef.current;
      transportRef.current = null;
      void transport?.disconnect();
      const activeConversationId = conversationIdRef.current;
      conversationIdRef.current = null;
      if (activeConversationId) {
        void finishConversation(activeConversationId, "component_unmounted").catch(
          () => {},
        );
      }
    },
    [responseLatencyTimer],
  );

  return useMemo(
    () => ({
      canFinish: conversationIdRef.current !== null,
      error,
      liveTranscript,
      microphoneBusy,
      microphoneEnabled,
      onBack: back,
      onFinish: () => void finish(),
      onPromptStyleChange: setPromptStyle,
      onRepeatAudio: () => void repeatAudio(),
      onStart: () => void start(),
      onToggleMicrophone: () => void toggleMicrophone(),
      responseLatencyMs,
      purpose,
      promptStyle,
      status,
      turnReady,
      turns,
    }),
    [
      back,
      error,
      finish,
      liveTranscript,
      microphoneBusy,
      microphoneEnabled,
      repeatAudio,
      responseLatencyMs,
      purpose,
      promptStyle,
      start,
      status,
      toggleMicrophone,
      turnReady,
      turns,
    ],
  );
}
