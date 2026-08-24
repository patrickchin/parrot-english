import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  finalizeConversation,
  finishConversation,
  loadConversation,
  startConversation,
  type ConversationTurn,
} from "./conversation-api";
import type {
  ConversationRecoveryPhase,
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

type ConversationLifecycleOwner = symbol;
type ConversationStartRequest = symbol;

// Start responses can outlive one hook instance, while the server may reuse a
// fresh active conversation ID. Keep only claimable requests in this shared
// registry so a late response neither retires a remounted chat nor blocks every
// later retry when its request never settles.
const conversationClaims = new Map<ConversationLifecycleOwner, string>();
const pendingConversationStarts = new Map<
  ConversationStartRequest,
  ConversationLifecycleOwner
>();
const pendingConversationStartWaiters = new Set<() => void>();
const staleConversationStarts = new Set<string>();
const conversationRetirementPromises = new Map<string, Promise<void>>();

function conversationIsClaimed(conversationId: string) {
  return [...conversationClaims.values()].includes(conversationId);
}

function claimConversation(
  owner: ConversationLifecycleOwner,
  conversationId: string,
) {
  conversationClaims.set(owner, conversationId);
  staleConversationStarts.delete(conversationId);
}

function releaseConversationClaim(
  owner: ConversationLifecycleOwner,
  conversationId?: string,
) {
  if (
    conversationId === undefined ||
    conversationClaims.get(owner) === conversationId
  ) {
    conversationClaims.delete(owner);
  }
}

async function waitForPendingConversationStarts() {
  while (pendingConversationStarts.size > 0) {
    await new Promise<void>((resolve) => {
      pendingConversationStartWaiters.add(resolve);
    });
  }
}

function notifyConversationStartsSettled() {
  if (pendingConversationStarts.size > 0) return;
  for (const resolve of pendingConversationStartWaiters) resolve();
  pendingConversationStartWaiters.clear();
}

function detachConversationStarts(owner: ConversationLifecycleOwner) {
  for (const [request, requestOwner] of pendingConversationStarts) {
    if (requestOwner === owner) pendingConversationStarts.delete(request);
  }
  notifyConversationStartsSettled();
  void flushStaleConversationStarts();
}

function runConversationRetirement(conversationId: string, reason: string) {
  const activeRetirement = conversationRetirementPromises.get(conversationId);
  if (activeRetirement) return activeRetirement;
  const retirement = finishConversation(conversationId, reason)
    .then(() => {})
    .finally(() => {
      conversationRetirementPromises.delete(conversationId);
    });
  conversationRetirementPromises.set(conversationId, retirement);
  return retirement;
}

async function flushStaleConversationStarts() {
  if (pendingConversationStarts.size === 0) {
    for (const conversationId of staleConversationStarts) {
      staleConversationStarts.delete(conversationId);
      if (
        conversationIsClaimed(conversationId) ||
        conversationRetirementPromises.has(conversationId)
      ) {
        continue;
      }
      void runConversationRetirement(
        conversationId,
        "superseded_start",
      ).catch(() => {});
    }
  }
  await Promise.all(
    [...conversationRetirementPromises.values()].map((retirement) =>
      retirement.catch(() => {}),
    ),
  );
}

function beginConversationStart(owner: ConversationLifecycleOwner) {
  const request = Symbol("conversation-start");
  pendingConversationStarts.set(request, owner);
  return request;
}

function settleConversationStart({
  conversationId,
  currentOwner,
  request,
}: {
  conversationId: string | null;
  currentOwner: ConversationLifecycleOwner | null;
  request: ConversationStartRequest;
}) {
  pendingConversationStarts.delete(request);
  notifyConversationStartsSettled();
  if (conversationId) {
    if (currentOwner) {
      claimConversation(currentOwner, conversationId);
    } else if (!conversationIsClaimed(conversationId)) {
      staleConversationStarts.add(conversationId);
    }
  }
  void flushStaleConversationStarts();
}

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

function childFacingConversationError(
  phase: "disconnect" | "finish" | "repeat" | "start",
  purpose: ConversationPurpose,
) {
  if (phase === "start") return "Peppa cannot talk now. Tap Try again.";
  if (phase === "disconnect") return "The chat stopped. Tap Try again.";
  if (phase === "repeat") {
    return "Peppa could not say that again. Keep talking.";
  }
  if (purpose === "onboarding") {
    return "Your answers did not save. Tap Save and finish again.";
  }
  if (purpose === "profile-edit") {
    return "Your changes did not save. Tap Save changes again.";
  }
  return "The chat did not finish. Tap Finish chat again.";
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
  onChooseLesson: () => void;
  onCompleted: () => Promise<void>;
  purpose: ConversationPurpose;
};

type ConversationRuntime = {
  assistantOutputBeforePlaybackReady: boolean;
  assistantSpeaking: boolean;
  audioPlaybackBlocked: boolean;
  audioPlaybackReady: boolean;
  awaitingResponse: boolean;
  completingConversationId: string | null;
  learnerTurnOpen: boolean;
  openingComplete: boolean;
  openingSignalSeen: boolean;
  playbackInterruptionObserved: boolean;
  repeatAfterInterruptedSpeech: boolean;
  transportReady: boolean;
};

function createConversationRuntime(): ConversationRuntime {
  return {
    assistantOutputBeforePlaybackReady: false,
    assistantSpeaking: false,
    audioPlaybackBlocked: false,
    audioPlaybackReady: false,
    awaitingResponse: false,
    completingConversationId: null,
    learnerTurnOpen: false,
    openingComplete: false,
    openingSignalSeen: false,
    playbackInterruptionObserved: false,
    repeatAfterInterruptedSpeech: false,
    transportReady: false,
  };
}

export function usePeppaConversation({
  active,
  createTransport = createLiveKitConversation,
  now,
  onBack,
  onChooseLesson,
  onCompleted,
  purpose,
}: UsePeppaConversationOptions) {
  const [status, setStatus] =
    useState<ConversationSurfaceStatus>("ready");
  const [turns, setTurns] = useState<ConversationSurfaceTurn[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [audioPlaybackBusy, setAudioPlaybackBusy] = useState(false);
  const [audioPlaybackError, setAudioPlaybackError] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const [turnReady, setTurnReady] = useState(false);
  const [waitCycle, setWaitCycle] = useState(0);
  const [responseLatencyMs, setResponseLatencyMs] = useState<number | null>(null);
  const [responseLatencyTimer] = useState(() =>
    createResponseLatencyTimer(now),
  );
  const [error, setError] = useState("");
  const [recoveryPhase, setRecoveryPhase] =
    useState<ConversationRecoveryPhase>(null);
  const [voiceRetryUsed, setVoiceRetryUsed] = useState(false);
  const [promptStyle, setPromptStyle] = useState<TalkToPeppaPromptStyle>(
    DEFAULT_TALK_TO_PEPPA_PROMPT_STYLE,
  );
  const [conversationLifecycleOwner] = useState<ConversationLifecycleOwner>(
    () => Symbol("conversation-owner"),
  );
  const conversationIdRef = useRef<string | null>(null);
  const transportRef = useRef<LiveKitConversation | null>(null);
  const operationRef = useRef(0);
  const autoStartRef = useRef(false);
  const audioPlaybackBusyRef = useRef(false);
  const audioPlaybackRequestRef = useRef(0);
  const microphoneBusyRef = useRef(false);
  const retirementReasonsRef = useRef(new Map<string, string>());
  const runtimeRef = useRef(createConversationRuntime());
  const voiceRetryUsedRef = useRef(false);

  const isCurrent = useCallback((operation: number) => {
    return operationRef.current === operation;
  }, []);

  const updateVoiceRetryUsed = useCallback((used: boolean) => {
    voiceRetryUsedRef.current = used;
    setVoiceRetryUsed(used);
  }, []);

  const queueConversationRetirement = useCallback(
    (conversationId: string, reason: string) => {
      if (!retirementReasonsRef.current.has(conversationId)) {
        retirementReasonsRef.current.set(conversationId, reason);
      }
    },
    [],
  );

  const retireQueuedConversations = useCallback(async () => {
    while (retirementReasonsRef.current.size > 0) {
      const [conversationId, reason] = retirementReasonsRef.current.entries()
        .next().value as [string, string];
      await waitForPendingConversationStarts();
      // A concurrently mounted replacement may have adopted the reusable ID.
      if (conversationIsClaimed(conversationId)) {
        retirementReasonsRef.current.delete(conversationId);
        continue;
      }
      await runConversationRetirement(conversationId, reason);
      retirementReasonsRef.current.delete(conversationId);
    }
  }, []);

  const resetResponseLatency = useCallback(() => {
    responseLatencyTimer.reset();
    setResponseLatencyMs(null);
  }, [responseLatencyTimer]);

  const settleResponseLatency = useCallback((
    outcome:
      | "assistant_signal"
      | "disconnected"
      | "microphone_stop_failed"
      | "send_failed",
  ) => {
    const elapsedMs = responseLatencyTimer.finish();
    if (elapsedMs === null) return;
    if (outcome === "assistant_signal") setResponseLatencyMs(elapsedMs);
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
        releaseConversationClaim(conversationLifecycleOwner, id);
        conversationIdRef.current = null;
        await onCompleted();
      } catch {
        if (!isCurrent(operation)) return;
        runtimeRef.current.completingConversationId = null;
        setError(childFacingConversationError("finish", purpose));
        setRecoveryPhase("finish");
        setStatus("error");
      }
    },
    [conversationLifecycleOwner, isCurrent, onCompleted, purpose],
  );

  const openLearnerTurn = useCallback(
    async (operation: number) => {
      if (
        !isCurrent(operation) ||
        !runtimeRef.current.transportReady ||
        !runtimeRef.current.openingComplete ||
        !runtimeRef.current.audioPlaybackReady ||
        runtimeRef.current.audioPlaybackBlocked ||
        runtimeRef.current.repeatAfterInterruptedSpeech ||
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

  const repeatPossiblyInterruptedAudio = useCallback(
    async (operation: number, transport: LiveKitConversation) => {
      if (!isCurrent(operation) || transportRef.current !== transport) return;
      runtimeRef.current.repeatAfterInterruptedSpeech = false;
      runtimeRef.current.assistantOutputBeforePlaybackReady = false;
      runtimeRef.current.playbackInterruptionObserved = false;
      setTurnReady(false);
      setStatus("speaking");
      setError("");
      try {
        await transport.repeatLastAudio();
        if (!isCurrent(operation) || transportRef.current !== transport) return;
      } catch {
        if (!isCurrent(operation) || transportRef.current !== transport) return;
        setError(childFacingConversationError("repeat", purpose));
        if (!runtimeRef.current.learnerTurnOpen) {
          void openLearnerTurn(operation);
        } else {
          setTurnReady(true);
          setStatus("listening");
        }
      }
    },
    [isCurrent, openLearnerTurn, purpose],
  );

  const markAudioPlaybackReady = useCallback(
    (operation: number, transport: LiveKitConversation) => {
      if (!isCurrent(operation) || transportRef.current !== transport) return;
      if (
        runtimeRef.current.audioPlaybackReady &&
        !runtimeRef.current.audioPlaybackBlocked
      ) {
        return;
      }
      const shouldReplay =
        runtimeRef.current.playbackInterruptionObserved &&
        runtimeRef.current.assistantOutputBeforePlaybackReady;
      runtimeRef.current.audioPlaybackBlocked = false;
      runtimeRef.current.audioPlaybackReady = true;
      runtimeRef.current.assistantOutputBeforePlaybackReady = false;
      runtimeRef.current.playbackInterruptionObserved = false;
      audioPlaybackBusyRef.current = false;
      audioPlaybackRequestRef.current += 1;
      setAudioPlaybackBlocked(false);
      setAudioPlaybackBusy(false);
      setAudioPlaybackError("");
      if (shouldReplay) {
        if (runtimeRef.current.assistantSpeaking) {
          runtimeRef.current.repeatAfterInterruptedSpeech = true;
        } else {
          void repeatPossiblyInterruptedAudio(operation, transport);
        }
        return;
      }
      if (
        runtimeRef.current.openingComplete &&
        !runtimeRef.current.learnerTurnOpen
      ) {
        void openLearnerTurn(operation);
      } else if (
        runtimeRef.current.learnerTurnOpen &&
        !runtimeRef.current.awaitingResponse &&
        !runtimeRef.current.assistantSpeaking
      ) {
        setTurnReady(true);
        setStatus("listening");
      }
    },
    [isCurrent, openLearnerTurn, repeatPossiblyInterruptedAudio],
  );

  const handleTransportEvent = useCallback(
    (event: ConversationTransportEvent, id: string, operation: number) => {
      if (!isCurrent(operation)) return;
      if (event.type === "audio-playback") {
        if (event.state === "blocked") {
          runtimeRef.current.audioPlaybackBlocked = true;
          runtimeRef.current.audioPlaybackReady = false;
          runtimeRef.current.playbackInterruptionObserved = true;
          runtimeRef.current.assistantOutputBeforePlaybackReady ||=
            runtimeRef.current.assistantSpeaking;
          runtimeRef.current.repeatAfterInterruptedSpeech = false;
          audioPlaybackBusyRef.current = false;
          audioPlaybackRequestRef.current += 1;
          setAudioPlaybackBlocked(true);
          setAudioPlaybackBusy(false);
          setAudioPlaybackError("");
          setTurnReady(false);
          return;
        }
        if (event.state === "stopped") {
          runtimeRef.current.playbackInterruptionObserved ||=
            runtimeRef.current.assistantSpeaking;
          runtimeRef.current.assistantOutputBeforePlaybackReady ||=
            runtimeRef.current.assistantSpeaking;
          runtimeRef.current.audioPlaybackBlocked = false;
          runtimeRef.current.audioPlaybackReady = false;
          runtimeRef.current.repeatAfterInterruptedSpeech = false;
          audioPlaybackBusyRef.current = false;
          audioPlaybackRequestRef.current += 1;
          setAudioPlaybackBlocked(false);
          setAudioPlaybackBusy(false);
          setAudioPlaybackError("");
          setTurnReady(false);
          setWaitCycle((current) => current + 1);
          setStatus("connecting");
          return;
        }
        if (event.state === "ready") {
          const transport = transportRef.current;
          if (runtimeRef.current.audioPlaybackBlocked && transport) {
            // A known false→true LiveKit transition is recovery readiness.
            // An initial true signal is intentionally ignored above this path.
            markAudioPlaybackReady(operation, transport);
          }
          return;
        }
        const transport = transportRef.current;
        if (transport) markAudioPlaybackReady(operation, transport);
        return;
      }
      if (event.type === "state") {
        if (event.state === "reconnecting") {
          setWaitCycle((current) => current + 1);
        }
        const connectedTurnReady =
          event.state === "connected" &&
          runtimeRef.current.learnerTurnOpen &&
          runtimeRef.current.audioPlaybackReady &&
          !runtimeRef.current.audioPlaybackBlocked &&
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
        if (runtimeRef.current.awaitingResponse) {
          settleResponseLatency("disconnected");
        }
        runtimeRef.current.awaitingResponse = false;
        runtimeRef.current.learnerTurnOpen = false;
        runtimeRef.current.transportReady = false;
        audioPlaybackBusyRef.current = false;
        audioPlaybackRequestRef.current += 1;
        microphoneBusyRef.current = false;
        setAudioPlaybackBlocked(false);
        setAudioPlaybackBusy(false);
        setAudioPlaybackError("");
        setMicrophoneBusy(false);
        setMicrophoneEnabled(false);
        setTurnReady(false);
        const transport = transportRef.current;
        transportRef.current = null;
        void transport?.disconnect();
        if (!COMPLETED_DISCONNECT_REASONS.has(event.reason)) {
          setError(childFacingConversationError("disconnect", purpose));
          setRecoveryPhase("restart");
          setStatus("error");
          return;
        }
        setError("");
        setWaitCycle((current) => current + 1);
        setStatus("saving");
        void loadSummary(id, operation);
        return;
      }
      if (event.type === "speech-started") {
        if (event.role === "assistant") {
          runtimeRef.current.assistantSpeaking = true;
          if (!runtimeRef.current.audioPlaybackReady) {
            runtimeRef.current.assistantOutputBeforePlaybackReady = true;
          }
          setTurnReady(false);
          if (runtimeRef.current.awaitingResponse) {
            runtimeRef.current.awaitingResponse = false;
            updateVoiceRetryUsed(false);
            settleResponseLatency("assistant_signal");
          }
          if (!runtimeRef.current.learnerTurnOpen) {
            runtimeRef.current.openingSignalSeen = true;
          }
          setStatus("speaking");
        }
        return;
      }
      if (event.type === "speech-ended") {
        if (event.role === "assistant") {
          runtimeRef.current.assistantSpeaking = false;
          if (runtimeRef.current.repeatAfterInterruptedSpeech) {
            const transport = transportRef.current;
            runtimeRef.current.repeatAfterInterruptedSpeech = false;
            if (transport) {
              void repeatPossiblyInterruptedAudio(operation, transport);
            }
            return;
          }
          if (!runtimeRef.current.learnerTurnOpen) {
            if (runtimeRef.current.openingSignalSeen) {
              runtimeRef.current.openingComplete = true;
              void openLearnerTurn(operation);
            } else {
              setStatus("connecting");
            }
          } else {
            const canListen =
              !runtimeRef.current.awaitingResponse &&
              runtimeRef.current.audioPlaybackReady &&
              !runtimeRef.current.audioPlaybackBlocked;
            setTurnReady(canListen);
            setStatus(
              runtimeRef.current.awaitingResponse
                ? "thinking"
                : canListen
                  ? "listening"
                  : "connecting",
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
        if (!runtimeRef.current.audioPlaybackReady) {
          runtimeRef.current.assistantOutputBeforePlaybackReady = true;
        }
        if (runtimeRef.current.awaitingResponse) {
          updateVoiceRetryUsed(false);
          settleResponseLatency("assistant_signal");
        }
        runtimeRef.current.awaitingResponse = false;
        if (event.final) {
          if (!runtimeRef.current.learnerTurnOpen) {
            runtimeRef.current.openingSignalSeen = true;
            if (!runtimeRef.current.assistantSpeaking) {
              runtimeRef.current.openingComplete = true;
              void openLearnerTurn(operation);
            }
          } else if (!runtimeRef.current.assistantSpeaking) {
            const canListen =
              runtimeRef.current.audioPlaybackReady &&
              !runtimeRef.current.audioPlaybackBlocked;
            setTurnReady(canListen);
            setStatus(canListen ? "listening" : "connecting");
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
    [
      isCurrent,
      loadSummary,
      markAudioPlaybackReady,
      openLearnerTurn,
      purpose,
      repeatPossiblyInterruptedAudio,
      settleResponseLatency,
      updateVoiceRetryUsed,
    ],
  );

  const start = useCallback(async () => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    detachConversationStarts(conversationLifecycleOwner);
    let startRequest: ConversationStartRequest | null = null;
    let returnedConversationId: string | null = null;
    const previousConversationId = conversationIdRef.current;
    conversationIdRef.current = null;
    if (previousConversationId) {
      releaseConversationClaim(
        conversationLifecycleOwner,
        previousConversationId,
      );
      queueConversationRetirement(
        previousConversationId,
        "restarted_after_error",
      );
    }
    const previousTransport = transportRef.current;
    transportRef.current = null;
    audioPlaybackBusyRef.current = false;
    audioPlaybackRequestRef.current += 1;
    microphoneBusyRef.current = false;
    setError("");
    setRecoveryPhase(null);
    setAudioPlaybackBlocked(false);
    setAudioPlaybackBusy(false);
    setAudioPlaybackError("");
    setWaitCycle((current) => current + 1);
    setStatus("connecting");
    setTurns([]);
    setLiveTranscript("");
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    runtimeRef.current = createConversationRuntime();
    resetResponseLatency();
    void previousTransport?.disconnect();
    try {
      await retireQueuedConversations();
      await flushStaleConversationStarts();
      if (!isCurrent(operation)) return;
      startRequest = beginConversationStart(conversationLifecycleOwner);
      const started = await startConversation(
        purpose === "small-chat"
          ? { promptStyle, purpose }
          : { purpose },
      );
      const conversationId = started?.conversation?.id;
      returnedConversationId =
        typeof conversationId === "string" && conversationId
          ? conversationId
          : null;
      if (!isCurrent(operation)) {
        settleConversationStart({
          conversationId: returnedConversationId,
          currentOwner: null,
          request: startRequest,
        });
        startRequest = null;
        return;
      }
      const participantToken = started?.livekit?.participantToken;
      const livekitUrl = started?.livekit?.url;
      if (
        typeof conversationId !== "string" ||
        !conversationId ||
        typeof participantToken !== "string" ||
        !participantToken ||
        typeof livekitUrl !== "string" ||
        !livekitUrl
      ) {
        throw new Error("Invalid conversation start response");
      }
      conversationIdRef.current = conversationId;
      settleConversationStart({
        conversationId,
        currentOwner: conversationLifecycleOwner,
        request: startRequest,
      });
      startRequest = null;
      const transport = createTransport({
        token: participantToken,
        url: livekitUrl,
      });
      // The production adapter always reports playback. Preserve dependency-
      // injected legacy transports that predate that contract.
      if (
        typeof (transport as { startAudio?: unknown }).startAudio !== "function"
      ) {
        runtimeRef.current.audioPlaybackReady = true;
      }
      transportRef.current = transport;
      transport.subscribe((event) =>
        handleTransportEvent(event, conversationId, operation),
      );
      await transport.connect();
      if (
        !isCurrent(operation) ||
        transportRef.current !== transport
      ) {
        await transport.disconnect();
        return;
      }
      await transport.setMicrophoneEnabled(false);
      if (
        !isCurrent(operation) ||
        transportRef.current !== transport
      ) {
        await transport.disconnect();
        return;
      }
      runtimeRef.current.transportReady = true;
      setMicrophoneEnabled(false);
      if (
        runtimeRef.current.openingComplete &&
        runtimeRef.current.audioPlaybackReady &&
        !runtimeRef.current.audioPlaybackBlocked &&
        !runtimeRef.current.assistantSpeaking
      ) {
        await openLearnerTurn(operation);
      } else {
        setStatus("connecting");
      }
      if (runtimeRef.current.assistantSpeaking) setStatus("speaking");
    } catch {
      if (startRequest) {
        settleConversationStart({
          conversationId: returnedConversationId,
          currentOwner: null,
          request: startRequest,
        });
      }
      if (!isCurrent(operation)) return;
      setError(childFacingConversationError("start", purpose));
      setRecoveryPhase("restart");
      setStatus("error");
    }
  }, [
    conversationLifecycleOwner,
    createTransport,
    handleTransportEvent,
    isCurrent,
    openLearnerTurn,
    promptStyle,
    purpose,
    queueConversationRetirement,
    resetResponseLatency,
    retireQueuedConversations,
  ]);

  const retryVoice = useCallback(() => {
    if (purpose !== "small-chat") {
      void start();
      return;
    }
    if (voiceRetryUsedRef.current) return;
    updateVoiceRetryUsed(true);
    void start();
  }, [purpose, start, updateVoiceRetryUsed]);

  const finish = useCallback(async () => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    detachConversationStarts(conversationLifecycleOwner);
    const transport = transportRef.current;
    resetResponseLatency();
    audioPlaybackBusyRef.current = false;
    audioPlaybackRequestRef.current += 1;
    microphoneBusyRef.current = false;
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    setAudioPlaybackBlocked(false);
    setAudioPlaybackBusy(false);
    setAudioPlaybackError("");
    setWaitCycle((current) => current + 1);
    setStatus("saving");
    setError("");
    setRecoveryPhase(null);
    if (transportRef.current === transport) transportRef.current = null;
    const disconnectPromise = transport?.disconnect().catch(() => {});
    try {
      await finishConversation(conversationId, "finished_by_learner");
      if (!isCurrent(operation)) return;
      await disconnectPromise;
      if (!isCurrent(operation)) return;
      await loadSummary(conversationId, operation);
    } catch {
      if (!isCurrent(operation)) return;
      setError(childFacingConversationError("finish", purpose));
      setRecoveryPhase("finish");
      setStatus("error");
    }
  }, [
    conversationLifecycleOwner,
    isCurrent,
    loadSummary,
    purpose,
    resetResponseLatency,
  ]);

  const leaveConversation = useCallback((onLeave: () => void) => {
    operationRef.current += 1;
    detachConversationStarts(conversationLifecycleOwner);
    audioPlaybackBusyRef.current = false;
    audioPlaybackRequestRef.current += 1;
    microphoneBusyRef.current = false;
    const id = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    resetResponseLatency();
    setLiveTranscript("");
    setAudioPlaybackBlocked(false);
    setAudioPlaybackBusy(false);
    setAudioPlaybackError("");
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    setRecoveryPhase(null);
    updateVoiceRetryUsed(false);
    if (id) {
      releaseConversationClaim(conversationLifecycleOwner, id);
      queueConversationRetirement(id, "left_conversation");
    } else {
      releaseConversationClaim(conversationLifecycleOwner);
    }
    void retireQueuedConversations().catch(() => {});
    void transport?.disconnect();
    onLeave();
  }, [
    conversationLifecycleOwner,
    queueConversationRetirement,
    resetResponseLatency,
    retireQueuedConversations,
    updateVoiceRetryUsed,
  ]);

  const back = useCallback(() => {
    leaveConversation(onBack);
  }, [leaveConversation, onBack]);

  const chooseLesson = useCallback(() => {
    leaveConversation(onChooseLesson);
  }, [leaveConversation, onChooseLesson]);

  const toggleMicrophone = useCallback(async () => {
    if (
      !transportRef.current ||
      !runtimeRef.current.learnerTurnOpen ||
      runtimeRef.current.awaitingResponse ||
      runtimeRef.current.assistantSpeaking ||
      (runtimeRef.current.audioPlaybackBlocked && !microphoneEnabled) ||
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
      setWaitCycle((current) => current + 1);
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
        settleResponseLatency(
          microphoneChanged ? "send_failed" : "microphone_stop_failed",
        );
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
  }, [isCurrent, microphoneEnabled, purpose, responseLatencyTimer, settleResponseLatency]);

  const startAudioPlayback = useCallback(async () => {
    const operation = operationRef.current;
    const transport = transportRef.current;
    if (
      !transport ||
      !runtimeRef.current.audioPlaybackBlocked ||
      audioPlaybackBusyRef.current
    ) {
      return;
    }
    const request = audioPlaybackRequestRef.current + 1;
    audioPlaybackRequestRef.current = request;
    audioPlaybackBusyRef.current = true;
    setAudioPlaybackBusy(true);
    setAudioPlaybackError("");
    try {
      await transport.startAudio();
      if (
        !isCurrent(operation) ||
        transportRef.current !== transport ||
        audioPlaybackRequestRef.current !== request
      ) {
        return;
      }
      // LiveKit's fulfilled gesture-bound request establishes only room/browser
      // playback readiness. It does not claim non-silent output or hearing.
      markAudioPlaybackReady(operation, transport);
    } catch {
      if (
        !isCurrent(operation) ||
        transportRef.current !== transport ||
        audioPlaybackRequestRef.current !== request
      ) {
        return;
      }
      if (
        runtimeRef.current.audioPlaybackReady ||
        !runtimeRef.current.audioPlaybackBlocked
      ) {
        return;
      }
      audioPlaybackBusyRef.current = false;
      audioPlaybackRequestRef.current += 1;
      setAudioPlaybackBusy(false);
      setAudioPlaybackBlocked(true);
      setAudioPlaybackError("Sound did not start. Tap again.");
    }
  }, [isCurrent, markAudioPlaybackReady]);

  const repeatAudio = useCallback(async () => {
    const operation = operationRef.current;
    const transport = transportRef.current;
    if (
      !transport ||
      audioPlaybackBusyRef.current ||
      runtimeRef.current.audioPlaybackBlocked ||
      !runtimeRef.current.audioPlaybackReady ||
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
      await transport.repeatLastAudio();
      if (!isCurrent(operation) || transportRef.current !== transport) return;
    } catch {
      if (!isCurrent(operation) || transportRef.current !== transport) return;
      setError(childFacingConversationError("repeat", purpose));
      setTurnReady(true);
      setStatus("listening");
    }
  }, [isCurrent, microphoneEnabled, purpose, status, turns]);

  useEffect(() => {
    if (!active || status !== "ready" || autoStartRef.current) return;
    if (purpose === "small-chat") return;
    autoStartRef.current = true;
    void start();
  }, [active, purpose, start, status]);

  useEffect(() => {
    if (active) return;
    operationRef.current += 1;
    detachConversationStarts(conversationLifecycleOwner);
    autoStartRef.current = false;
    audioPlaybackBusyRef.current = false;
    audioPlaybackRequestRef.current += 1;
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
    setAudioPlaybackBlocked(false);
    setAudioPlaybackBusy(false);
    setAudioPlaybackError("");
    setMicrophoneBusy(false);
    setMicrophoneEnabled(false);
    setTurnReady(false);
    setError("");
    setRecoveryPhase(null);
    updateVoiceRetryUsed(false);
    void transport?.disconnect();
    if (activeConversationId) {
      releaseConversationClaim(
        conversationLifecycleOwner,
        activeConversationId,
      );
      queueConversationRetirement(activeConversationId, "left_conversation");
    } else {
      releaseConversationClaim(conversationLifecycleOwner);
    }
    void retireQueuedConversations().catch(() => {});
  }, [
    active,
    conversationLifecycleOwner,
    queueConversationRetirement,
    resetResponseLatency,
    retireQueuedConversations,
    updateVoiceRetryUsed,
  ]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      detachConversationStarts(conversationLifecycleOwner);
      autoStartRef.current = false;
      audioPlaybackBusyRef.current = false;
      audioPlaybackRequestRef.current += 1;
      microphoneBusyRef.current = false;
      runtimeRef.current = createConversationRuntime();
      voiceRetryUsedRef.current = false;
      responseLatencyTimer.reset();
      const transport = transportRef.current;
      transportRef.current = null;
      void transport?.disconnect();
      const activeConversationId = conversationIdRef.current;
      conversationIdRef.current = null;
      if (activeConversationId) {
        releaseConversationClaim(
          conversationLifecycleOwner,
          activeConversationId,
        );
        queueConversationRetirement(
          activeConversationId,
          "component_unmounted",
        );
      } else {
        releaseConversationClaim(conversationLifecycleOwner);
      }
      void retireQueuedConversations().catch(() => {});
    },
    [
      conversationLifecycleOwner,
      queueConversationRetirement,
      responseLatencyTimer,
      retireQueuedConversations,
    ],
  );

  return useMemo(
    () => ({
      audioPlaybackBlocked,
      audioPlaybackBusy,
      audioPlaybackError,
      canFinish: conversationIdRef.current !== null,
      error,
      liveTranscript,
      microphoneBusy,
      microphoneEnabled,
      onBack: back,
      onChooseLesson: chooseLesson,
      onStartAudio: () => void startAudioPlayback(),
      onFinish: () => void finish(),
      onPromptStyleChange: setPromptStyle,
      onRepeatAudio: () => void repeatAudio(),
      onRetryVoice: retryVoice,
      onStart: () => void start(),
      onToggleMicrophone: () => void toggleMicrophone(),
      recoveryPhase,
      responseLatencyMs,
      purpose,
      promptStyle,
      status,
      turnReady,
      turns,
      voiceRetryUsed,
      waitCycle,
    }),
    [
      audioPlaybackBlocked,
      audioPlaybackBusy,
      audioPlaybackError,
      back,
      chooseLesson,
      error,
      finish,
      liveTranscript,
      microphoneBusy,
      microphoneEnabled,
      repeatAudio,
      recoveryPhase,
      responseLatencyMs,
      purpose,
      promptStyle,
      retryVoice,
      start,
      startAudioPlayback,
      status,
      toggleMicrophone,
      turnReady,
      turns,
      voiceRetryUsed,
      waitCycle,
    ],
  );
}
