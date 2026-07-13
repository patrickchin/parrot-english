import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  finishConversation,
  loadConversation,
  reviewConversation,
  startConversation,
  type ConversationFact,
  type ConversationReviewDecision,
  type ConversationTurn,
} from "./conversation-api";
import type {
  ConversationSurfaceCandidate,
  ConversationSurfaceStatus,
  ConversationSurfaceTurn,
} from "./ConversationSurface";
import {
  createLiveKitConversation,
  type ConversationTransportEvent,
  type LiveKitConversation,
} from "./livekit-conversation";

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

export function updateConversationCandidateStatus<
  Candidate extends { id: string; status: "accepted" | "edited" | "rejected" },
>(
  candidates: Candidate[],
  id: string,
  nextStatus: Candidate["status"],
) {
  return candidates.map((candidate) =>
    candidate.id === id
      ? {
          ...candidate,
          status: nextStatus === "accepted" ? "edited" : nextStatus,
        }
      : candidate,
  );
}

export async function completeConversationReview({
  conversationId,
  decisions,
  refresh,
  review = reviewConversation,
}: {
  conversationId: string;
  decisions: ConversationReviewDecision[];
  refresh: () => Promise<void>;
  review?: typeof reviewConversation;
}) {
  const result = await review(conversationId, decisions);
  await refresh();
  return result;
}

function readableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The voice conversation could not continue.";
}

function candidateFromFact(fact: ConversationFact): ConversationSurfaceCandidate {
  const topic = typeof fact.value.topic === "string" ? fact.value.topic : "interest";
  return {
    factKey: fact.factKey,
    id: fact.id,
    label:
      fact.factKey === "name"
        ? "Name"
        : fact.factKey === "age"
          ? "Age"
          : `Likes — ${topic}`,
    status:
      fact.status === "edited"
        ? "edited"
        : fact.status === "rejected"
          ? "rejected"
          : "accepted",
    value: String(fact.value.value),
  };
}

export function candidateFromControllerState(
  state: Record<string, unknown>,
): ConversationSurfaceCandidate | null {
  if (typeof state.profileSummary !== "string" || !state.profileSummary.trim()) {
    return null;
  }
  const storedStatus = state.summaryStatus;
  const status =
    storedStatus === "edited" || storedStatus === "rejected"
      ? storedStatus
      : "accepted";
  return {
    factKey: "summary",
    id: "profile-summary",
    label: "About this learner",
    status,
    value: state.profileSummary.trim(),
  };
}

type UseConversationOnboardingOptions = {
  active: boolean;
  createTransport?: typeof createLiveKitConversation;
  onBack: () => void;
  onCompleted: () => Promise<void>;
};

export function useConversationOnboarding({
  active,
  createTransport = createLiveKitConversation,
  onBack,
  onCompleted,
}: UseConversationOnboardingOptions) {
  const [status, setStatus] =
    useState<ConversationSurfaceStatus>("ready");
  const [turns, setTurns] = useState<ConversationSurfaceTurn[]>([]);
  const [candidates, setCandidates] = useState<ConversationSurfaceCandidate[]>([]);
  const [typedValue, setTypedValue] = useState("");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const transportRef = useRef<LiveKitConversation | null>(null);
  const operationRef = useRef(0);
  const autoStartRef = useRef(false);
  const completingConversationRef = useRef<string | null>(null);
  const transportReadyRef = useRef(false);
  const openingHeardRef = useRef(false);
  const learnerTurnOpenRef = useRef(false);
  const awaitingResponseRef = useRef(false);

  const isCurrent = useCallback((operation: number) => {
    return operationRef.current === operation;
  }, []);

  const loadSummary = useCallback(
    async (id: string, operation = operationRef.current) => {
      if (completingConversationRef.current === id) return;
      completingConversationRef.current = id;
      try {
        const loaded = await loadConversation(id);
        if (!isCurrent(operation)) return;
        const proseProfile = candidateFromControllerState(
          loaded.conversation.controllerState,
        );
        setCandidates(
          proseProfile
            ? [proseProfile]
            : (loaded.conversation.facts ?? []).map(candidateFromFact),
        );
        setTurns((current) =>
          mergeConversationTurns(current, loaded.conversation.turns ?? []),
        );
        setStatus("saving");
        await reviewConversation(
          id,
          proseProfile
            ? [{ factId: proseProfile.id, status: "accepted" }]
            : [],
        );
        if (!isCurrent(operation)) return;
        conversationIdRef.current = null;
        setConversationId(null);
        await onCompleted();
      } catch (summaryError) {
        if (!isCurrent(operation)) return;
        completingConversationRef.current = null;
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
        !transportReadyRef.current ||
        !openingHeardRef.current ||
        learnerTurnOpenRef.current ||
        !transportRef.current
      ) {
        return;
      }
      learnerTurnOpenRef.current = true;
      awaitingResponseRef.current = false;
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
            ? learnerTurnOpenRef.current
              ? awaitingResponseRef.current
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
        awaitingResponseRef.current = false;
        if (event.final) {
          if (!learnerTurnOpenRef.current) {
            openingHeardRef.current = true;
            void openLearnerTurn(operation);
          } else {
            setStatus("listening");
          }
        } else if (learnerTurnOpenRef.current) {
          setStatus("speaking");
        }
      } else if (event.final) {
        setStatus(awaitingResponseRef.current ? "thinking" : "listening");
      }
    },
    [isCurrent, loadSummary, openLearnerTurn],
  );

  const start = useCallback(async () => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setError("");
    setStatus("connecting");
    setTurns([]);
    setCandidates([]);
    setMicrophoneEnabled(false);
    completingConversationRef.current = null;
    transportReadyRef.current = false;
    openingHeardRef.current = false;
    learnerTurnOpenRef.current = false;
    awaitingResponseRef.current = false;
    try {
      const started = await startConversation();
      if (!isCurrent(operation)) return;
      setConversationId(started.conversation.id);
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
      transportReadyRef.current = true;
      setMicrophoneEnabled(false);
      setStatus("connecting");
      await openLearnerTurn(operation);
    } catch (startError) {
      if (!isCurrent(operation)) return;
      setError(readableError(startError));
      setStatus("error");
    }
  }, [createTransport, handleTransportEvent, isCurrent, openLearnerTurn]);

  const finish = useCallback(async () => {
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
  }, [conversationId, isCurrent, loadSummary]);

  const back = useCallback(() => {
    operationRef.current += 1;
    const id = conversationId;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    onBack();
    if (id) void finishConversation(id, "left_conversation").catch(() => {});
    void transport?.disconnect();
  }, [conversationId, onBack]);

  const sendText = useCallback(async () => {
    const value = typedValue.trim();
    if (!value || !transportRef.current || !learnerTurnOpenRef.current) return;
    try {
      await transportRef.current.sendText(value);
      awaitingResponseRef.current = true;
      setTurns((current) => [
        ...current,
        { id: `typed-${Date.now()}`, role: "user", text: value },
      ]);
      setTypedValue("");
      setStatus("thinking");
    } catch (sendError) {
      setError(readableError(sendError));
    }
  }, [typedValue]);

  const toggleMicrophone = useCallback(async () => {
    if (
      !transportRef.current ||
      !learnerTurnOpenRef.current ||
      awaitingResponseRef.current
    ) {
      return;
    }
    const enabled = !microphoneEnabled;
    if (!enabled) {
      awaitingResponseRef.current = true;
      setStatus("thinking");
    }
    try {
      await transportRef.current.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
    } catch (microphoneError) {
      if (!enabled && awaitingResponseRef.current) {
        awaitingResponseRef.current = false;
        setStatus("listening");
      }
      setError(readableError(microphoneError));
    }
  }, [microphoneEnabled]);

  const updateCandidate = useCallback((id: string, value: string) => {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              status: candidate.status === "rejected" ? "rejected" : "edited",
              value,
            }
          : candidate,
      ),
    );
  }, []);

  const updateCandidateStatus = useCallback(
    (id: string, nextStatus: ConversationSurfaceCandidate["status"]) => {
      setCandidates((current) =>
        updateConversationCandidateStatus(current, id, nextStatus),
      );
    },
    [],
  );

  const submitReview = useCallback(async () => {
    if (!conversationId) return;
    setError("");
    try {
      const decisions: ConversationReviewDecision[] = candidates.map(
        (candidate) => {
          if (candidate.status === "rejected") {
            return { factId: candidate.id, status: "rejected" };
          }
          const value =
            candidate.factKey === "age"
              ? Number.parseInt(candidate.value, 10)
              : candidate.value.trim();
          if (
            (candidate.factKey === "age" && !Number.isInteger(value)) ||
            value === ""
          ) {
            throw new Error(`Please check ${candidate.label.toLowerCase()}.`);
          }
          return {
            factId: candidate.id,
            status: candidate.status,
            value,
          };
        },
      );
      await completeConversationReview({
        conversationId,
        decisions,
        refresh: onCompleted,
      });
      conversationIdRef.current = null;
    } catch (reviewError) {
      setError(readableError(reviewError));
    }
  }, [candidates, conversationId, onCompleted]);

  useEffect(() => {
    if (!active || status !== "ready" || autoStartRef.current) return;
    autoStartRef.current = true;
    void start();
  }, [active, start, status]);

  useEffect(() => {
    if (active) return;
    operationRef.current += 1;
    autoStartRef.current = false;
    completingConversationRef.current = null;
    transportReadyRef.current = false;
    openingHeardRef.current = false;
    learnerTurnOpenRef.current = false;
    awaitingResponseRef.current = false;
    const activeConversationId = conversationIdRef.current;
    conversationIdRef.current = null;
    const transport = transportRef.current;
    transportRef.current = null;
    setConversationId(null);
    setStatus("ready");
    setTurns([]);
    setCandidates([]);
    setTypedValue("");
    setMicrophoneEnabled(false);
    setError("");
    void transport?.disconnect();
    if (activeConversationId) {
      void finishConversation(activeConversationId, "left_conversation").catch(
        () => {},
      );
    }
  }, [active]);

  useEffect(
    () => () => {
      operationRef.current += 1;
      autoStartRef.current = false;
      completingConversationRef.current = null;
      transportReadyRef.current = false;
      openingHeardRef.current = false;
      learnerTurnOpenRef.current = false;
      awaitingResponseRef.current = false;
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
    [],
  );

  return useMemo(
    () => ({
      candidates,
      error,
      microphoneEnabled,
      onBack: back,
      onCandidateChange: updateCandidate,
      onCandidateStatusChange: updateCandidateStatus,
      onFinish: () => void finish(),
      onSendText: () => void sendText(),
      onStart: () => void start(),
      onSubmitReview: () => void submitReview(),
      onToggleMicrophone: () => void toggleMicrophone(),
      onTypedValueChange: setTypedValue,
      status,
      turns,
      typedValue,
    }),
    [
      candidates,
      back,
      error,
      finish,
      microphoneEnabled,
      sendText,
      start,
      status,
      submitReview,
      toggleMicrophone,
      turns,
      typedValue,
      updateCandidate,
      updateCandidateStatus,
    ],
  );
}
