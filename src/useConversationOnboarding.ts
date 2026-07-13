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

export function selectOnboardingExperience(
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

type UseConversationOnboardingOptions = {
  active: boolean;
  createTransport?: typeof createLiveKitConversation;
  now?: () => number;
  onBack: () => void;
  onCompleted: () => Promise<void>;
};

type ConversationRuntime = {
  awaitingResponse: boolean;
  completingConversationId: string | null;
  learnerTurnOpen: boolean;
  openingHeard: boolean;
  transportReady: boolean;
};

function createConversationRuntime(): ConversationRuntime {
  return {
    awaitingResponse: false,
    completingConversationId: null,
    learnerTurnOpen: false,
    openingHeard: false,
    transportReady: false,
  };
}

export function useConversationOnboarding({
  active,
  createTransport = createLiveKitConversation,
  now,
  onBack,
  onCompleted,
}: UseConversationOnboardingOptions) {
  const [status, setStatus] =
    useState<ConversationSurfaceStatus>("ready");
  const [turns, setTurns] = useState<ConversationSurfaceTurn[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [responseLatencyMs, setResponseLatencyMs] = useState<number | null>(null);
  const [responseLatencyTimer] = useState(() =>
    createResponseLatencyTimer(now),
  );
  const [error, setError] = useState("");
  const conversationIdRef = useRef<string | null>(null);
  const transportRef = useRef<LiveKitConversation | null>(null);
  const operationRef = useRef(0);
  const autoStartRef = useRef(false);
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
      setStatus("listening");
    },
    [isCurrent],
  );

  const handleTransportEvent = useCallback(
    (event: ConversationTransportEvent, id: string, operation: number) => {
      if (!isCurrent(operation)) return;
      if (event.type === "state") {
        setStatus(
          event.state === "connected"
            ? runtimeRef.current.learnerTurnOpen
              ? runtimeRef.current.awaitingResponse
                ? "thinking"
                : "listening"
              : "connecting"
            : event.state,
        );
        return;
      }
      if (event.type === "disconnected") {
        void loadSummary(id, operation);
        return;
      }
      if (event.type === "speech-started") {
        if (event.role === "assistant") {
          if (runtimeRef.current.awaitingResponse) {
            runtimeRef.current.awaitingResponse = false;
            finishResponseLatency();
          }
          if (runtimeRef.current.learnerTurnOpen) setStatus("speaking");
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
            void openLearnerTurn(operation);
          } else {
            setStatus("listening");
          }
        } else if (runtimeRef.current.learnerTurnOpen) {
          setStatus("speaking");
        }
      } else if (event.final) {
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
    setError("");
    setStatus("connecting");
    setTurns([]);
    setLiveTranscript("");
    setMicrophoneEnabled(false);
    runtimeRef.current = createConversationRuntime();
    resetResponseLatency();
    try {
      const started = await startConversation();
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
      setStatus("connecting");
      await openLearnerTurn(operation);
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
    resetResponseLatency,
  ]);

  const finish = useCallback(async () => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    const operation = operationRef.current;
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
    const id = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    resetResponseLatency();
    setLiveTranscript("");
    onBack();
    if (id) void finishConversation(id, "left_conversation").catch(() => {});
    void transport?.disconnect();
  }, [onBack, resetResponseLatency]);

  const toggleMicrophone = useCallback(async () => {
    if (
      !transportRef.current ||
      !runtimeRef.current.learnerTurnOpen ||
      runtimeRef.current.awaitingResponse
    ) {
      return;
    }
    const enabled = !microphoneEnabled;
    if (!enabled) {
      responseLatencyTimer.start();
      setResponseLatencyMs(null);
      runtimeRef.current.awaitingResponse = true;
      setStatus("thinking");
    } else {
      setLiveTranscript("");
      resetResponseLatency();
    }
    try {
      await transportRef.current.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
      if (!enabled) {
        setLiveTranscript("");
        await transportRef.current.commitUserTurn();
      }
    } catch (microphoneError) {
      if (!enabled && runtimeRef.current.awaitingResponse) {
        runtimeRef.current.awaitingResponse = false;
        resetResponseLatency();
        setStatus("listening");
      }
      setError(readableError(microphoneError));
    }
  }, [microphoneEnabled, resetResponseLatency, responseLatencyTimer]);

  const repeatAudio = useCallback(async () => {
    if (
      !transportRef.current ||
      microphoneEnabled ||
      status !== "listening" ||
      !turns.some((turn) => turn.role === "assistant" && turn.text.trim())
    ) {
      return;
    }
    setError("");
    setStatus("speaking");
    try {
      await transportRef.current.repeatLastAudio();
    } catch (repeatError) {
      setError(readableError(repeatError));
      setStatus("listening");
    }
  }, [microphoneEnabled, status, turns]);

  useEffect(() => {
    if (!active || status !== "ready" || autoStartRef.current) return;
    autoStartRef.current = true;
    void start();
  }, [active, start, status]);

  useEffect(() => {
    if (active) return;
    operationRef.current += 1;
    autoStartRef.current = false;
    runtimeRef.current = createConversationRuntime();
    resetResponseLatency();
    const activeConversationId = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    setStatus("ready");
    setTurns([]);
    setLiveTranscript("");
    setMicrophoneEnabled(false);
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
      error,
      liveTranscript,
      microphoneEnabled,
      onBack: back,
      onFinish: () => void finish(),
      onRepeatAudio: () => void repeatAudio(),
      onStart: () => void start(),
      onToggleMicrophone: () => void toggleMicrophone(),
      responseLatencyMs,
      status,
      turns,
    }),
    [
      back,
      error,
      finish,
      liveTranscript,
      microphoneEnabled,
      repeatAudio,
      responseLatencyMs,
      start,
      status,
      toggleMicrophone,
      turns,
    ],
  );
}
