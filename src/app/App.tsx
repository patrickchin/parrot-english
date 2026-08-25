"use client";

import { ChevronLeft } from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  getLessonAudioLine,
  getLessonJoinInAudioLine,
  getLessonSpeechLine,
} from "../../lib/lesson-audio";
import { getLessonProgressLabel } from "../../lib/lesson-progress";
import {
  createLessonRouteActivityGuard,
  createLessonRouteExitRegistry,
  exitLessonRouteActivity,
  invalidateLessonRouteActivity,
} from "../../lib/lesson-route-activity";
import {
  consumeLessonHistoryPopToken,
  createLessonHistoryPopToken,
  getLessonEventTargetSceneIndex,
  getLessonRouteReconciliationEvent,
} from "../../lib/lesson-route-transition";
import { getLessonScenePresentation } from "../../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  getCurrentStep,
  reduceLessonState,
} from "../../lib/lesson-state";
import {
  isAbortError,
  playAudioLine,
  waitForAbortableDelay,
  type PlaybackControl,
} from "../media/audio-playback";
import {
  getGateRouteKind,
  getGuardianPath,
  getLessonScenePath,
  getLoginPath,
  getLearnerProfilePath,
  getProfilePath,
  getRedoLearnerProfilePath,
  getRequestedProtectedTarget,
  getSafeReturnTo,
  getStoryPagePath,
  getStoryShelfPath,
  isRedoLearnerProfileRequest,
  isGuardianRoute,
  isTalkToPeppaRoute,
  resolveMyLessonRouteDecision,
  resolveParrotLessonRouteDecision,
  resolveStoryRouteDecision,
  type LessonRouteDecision,
  type LessonSource,
  type StoryRouteDecision,
} from "./app-routes";
import { AuthGate } from "../auth/AuthGate";
import { useAccountExperience } from "../auth/account-actions";
import { HeaderButton, RouteHeader } from "./AppHeader";
import { RouteFocusManager } from "./RouteFocusManager";
import { FeaturePlaceholder } from "./FeaturePlaceholder";
import { HomeMenu } from "./HomeMenu";
import { LearnerProfileGate } from "../learner-profile/LearnerProfileGate";
import {
  VISUAL_CATALOG,
  type Lesson,
  type LessonCatalogEntry,
} from "../lessons/lesson-catalog";
import { LessonList } from "../lessons/LessonList";
import { GuardianLessonManager } from "../lessons/GuardianLessonManager";
import {
  FULL_SCENE_LESSONS,
  type FullSceneImage,
} from "../lessons/full-scene-lessons";
import {
  BoxedFullSceneStage,
  BoxedLessonSceneLayout,
  LessonCharacters,
  LessonCompletion,
  LessonErrorBanner,
  LessonHud,
  LessonIntroduction,
  LessonJoinInPrompt,
  LessonPlaybackControls,
  LessonSpeech,
  LessonStage,
} from "../lessons/LessonPlayerUi";
import { playDeviceSpeech } from "../media/device-speech";
import { loadMyLesson } from "../lessons/my-lessons-api";
import {
  requestMicrophoneAccess,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { createPlaybackOperation } from "../lessons/playback-operation";
import {
  loadLessonRecordingConsent,
  saveLessonRecording,
} from "../lessons/lesson-recording-api";
import { createLessonRecordingQueue } from "../lessons/lesson-recording-queue";
import { usePersonalizedStoryArt } from "../stories/usePersonalizedStoryArt";
import { GuardianDashboard } from "./GuardianDashboard";
import {
  GuardianModeBoundary,
  LearnerModeBoundary,
} from "./ModeRouteBoundaries";

const LessonCreator = import.meta.env.SSR
  ? (await import("../lessons/LessonCreator")).LessonCreator
  : lazy(() =>
      import("../lessons/LessonCreator").then(({ LessonCreator }) => ({
        default: LessonCreator,
      })),
    );

const APPLICATION_ROUTE_PATTERNS = [
  "/",
  "/guardian",
  "/guardian/lessons",
  "/guardian/stories",
  "/talk-to-peppa",
  "/lessons",
  "/lessons/my/create",
  "/lessons/my/:lessonId/edit",
  "/lessons/parrot/:lessonId",
  "/lessons/parrot/:lessonId/scenes/:sceneNumber",
  "/lessons/my/:lessonId",
  "/lessons/my/:lessonId/scenes/:sceneNumber",
  "/progress",
  "/stories",
  "/dubs/five-little-ducks",
  "/stories/:storyId",
  "/stories/:storyId/pages/:pageNumber",
  "/login",
  "/profile/setup",
  "/profile",
];

function isDeclaredApplicationRoute(pathname: string) {
  return APPLICATION_ROUTE_PATTERNS.some((path) =>
    matchPath({ end: true, path }, pathname),
  );
}

const LessonEditor = import.meta.env.SSR
  ? (await import("../lessons/LessonEditor")).LessonEditor
  : lazy(() =>
      import("../lessons/LessonEditor").then(({ LessonEditor }) => ({
        default: LessonEditor,
      })),
    );
const StoryList = import.meta.env.SSR
  ? (await import("../stories/StoryList")).StoryList
  : lazy(() =>
      import("../stories/StoryList").then(({ StoryList }) => ({
        default: StoryList,
      })),
    );
const GuardianStorySettings = import.meta.env.SSR
  ? (await import("../stories/GuardianStorySettings")).GuardianStorySettings
  : lazy(() =>
      import("../stories/GuardianStorySettings").then(
        ({ GuardianStorySettings }) => ({ default: GuardianStorySettings }),
      ),
    );
const StoryReader = import.meta.env.SSR
  ? (await import("../stories/StoryReader")).StoryReader
  : lazy(() =>
      import("../stories/StoryReader").then(({ StoryReader }) => ({
        default: StoryReader,
      })),
    );
const DuckDub = import.meta.env.SSR
  ? (await import("../dubbing/DuckDub")).DuckDub
  : lazy(() =>
      import("../dubbing/DuckDub").then(({ DuckDub }) => ({
        default: DuckDub,
      })),
    );

const JOIN_IN_TAIL_MS = 250;
const JOIN_IN_FAILURE_DISPLAY_MS = 700;
const MICROPHONE_NOTICE =
  "The microphone is unavailable, but the story will keep going.";
const LESSON_AUDIO_ERROR_MESSAGE =
  "The sound stopped. Try it again or skip this sound.";

export type LessonEvent =
  | { type: "PLAY_SCENE" }
  | { type: "PAUSE_SCENE" }
  | { type: "SCENE_PREVIOUS" }
  | { type: "SCENE_NEXT" }
  | { type: "REPLAY_LESSON" }
  | { type: "SELECT_SCENE"; sceneIndex: number }
  | { type: "LINE_DONE" }
  | { type: "JOIN_IN_DONE" }
  | { type: "RESET" };

type LessonPlayerProps = {
  fullSceneArtwork?: FullSceneImage[];
  lesson: Lesson;
  lessonId: string;
  onBack: () => void;
  onNavigateScene: (sceneIndex: number) => void;
  routedLocationKey: string;
  routedSceneIndex: number;
  source: LessonSource;
};

type RegisterLessonRouteExitBarrier = (
  barrier: () => void,
) => () => void;

const LessonRouteExitBarrierContext =
  createContext<RegisterLessonRouteExitBarrier>(() => () => {});

export function LessonPlayer({
  fullSceneArtwork,
  lesson: currentLesson,
  lessonId,
  onBack,
  onNavigateScene,
  routedLocationKey,
  routedSceneIndex,
  source,
}: LessonPlayerProps) {
  const registerLessonRouteExitBarrier = useContext(
    LessonRouteExitBarrierContext,
  );
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent,
    ) => reduceLessonState(currentState, event, currentLesson),
    { ...createInitialLessonState(), sceneIndex: routedSceneIndex },
  );
  const [error, setError] = useState("");
  const [microphoneNotice, setMicrophoneNotice] = useState("");
  const [joinInRecording, setJoinInRecording] = useState(false);
  const [historyPopSequence, setHistoryPopSequence] = useState(0);
  const [audioRetrySequence, setAudioRetrySequence] = useState(0);
  const [decodedArtworkSources, setDecodedArtworkSources] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [failedArtworkSrc, setFailedArtworkSrc] = useState("");
  const stateRef = useRef(state);
  const playbackControllerRef = useRef<AbortController | null>(null);
  const playbackControlRef = useRef<PlaybackControl | null>(null);
  const playbackGenerationRef = useRef(0);
  const preflightControllerRef = useRef<AbortController | null>(null);
  const recordingRef = useRef<SpeechRecordingSession | null>(null);
  const recordingPermissionRef = useRef(false);
  const startPendingRef = useRef(false);
  const consentPromiseRef = useRef<Promise<boolean> | null>(null);
  const recordingQueueRef = useRef<
    ReturnType<typeof createLessonRecordingQueue> | null
  >(null);
  const startActionRef = useRef<HTMLButtonElement | null>(null);
  const routeActivityGuardRef = useRef(createLessonRouteActivityGuard());
  const routedSceneRef = useRef(routedSceneIndex);
  const historyPopSequenceRef = useRef(0);
  const pendingHistoryPopTokenRef = useRef<{
    destinationKey: string;
    sequence: number;
  } | null>(null);
  const pendingRoutedEventRef = useRef<{
    event: LessonEvent;
    sceneIndex: number;
  } | null>(null);

  if (!recordingQueueRef.current) {
    recordingQueueRef.current = createLessonRecordingQueue({
      save: async (blob, slot) => {
        const result = await saveLessonRecording(blob, slot);
        if (!result.saved) recordingPermissionRef.current = false;
        return result;
      },
    });
  }
  const recordingQueue = recordingQueueRef.current;
  const recordingSnapshot = useSyncExternalStore(
    recordingQueue.subscribe,
    recordingQueue.snapshot,
    recordingQueue.snapshot,
  );

  const loadConsentOnce = useCallback(() => {
    if (!consentPromiseRef.current) {
      consentPromiseRef.current = loadLessonRecordingConsent()
        .then(({ enabled }) => enabled === true)
        .catch(() => false);
    }
    return consentPromiseRef.current;
  }, []);

  useEffect(() => {
    void loadConsentOnce();
  }, [loadConsentOnce]);

  const handleArtworkDecoded = useCallback((src: string) => {
    setDecodedArtworkSources((decodedSources) => {
      if (decodedSources.has(src)) return decodedSources;
      const nextSources = new Set(decodedSources);
      nextSources.add(src);
      return nextSources;
    });
    setFailedArtworkSrc((failedSrc) => (failedSrc === src ? "" : failedSrc));
  }, []);
  const handleArtworkFailed = useCallback((src: string) => {
    setFailedArtworkSrc(src);
  }, []);
  const handleArtworkRetry = useCallback((src: string) => {
    setFailedArtworkSrc((failedSrc) => (failedSrc === src ? "" : failedSrc));
  }, []);
  const showMicrophoneNotice = useCallback(() => {
    setMicrophoneNotice((current) => current || MICROPHONE_NOTICE);
  }, []);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cancelPendingWork = useCallback(() => {
    playbackGenerationRef.current += 1;
    startPendingRef.current = false;
    preflightControllerRef.current?.abort();
    preflightControllerRef.current = null;
    playbackControllerRef.current?.abort();
    playbackControllerRef.current = null;
    playbackControlRef.current = null;
    recordingRef.current?.cancel();
    recordingRef.current = null;
    setJoinInRecording(false);
  }, []);

  const invalidateRouteActivity = useCallback(() => {
    invalidateLessonRouteActivity(
      routeActivityGuardRef.current,
      cancelPendingWork,
    );
  }, [cancelPendingWork]);

  const exitRouteActivity = useCallback(() => {
    exitLessonRouteActivity(
      pendingRoutedEventRef,
      routeActivityGuardRef.current,
      cancelPendingWork,
    );
  }, [cancelPendingWork]);

  useLayoutEffect(() => {
    if (routedSceneRef.current === routedSceneIndex) return;
    routedSceneRef.current = routedSceneIndex;
    invalidateRouteActivity();
  }, [invalidateRouteActivity, routedSceneIndex]);

  useLayoutEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const token = createLessonHistoryPopToken(
        historyPopSequenceRef.current,
        event.state,
        window.history.state,
      );
      historyPopSequenceRef.current = token.sequence;
      pendingHistoryPopTokenRef.current = token;
      setHistoryPopSequence(token.sequence);
      exitRouteActivity();
    };
    window.addEventListener("popstate", handlePopState, true);
    return () =>
      window.removeEventListener("popstate", handlePopState, true);
  }, [exitRouteActivity]);

  useLayoutEffect(() => {
    const unregister = registerLessonRouteExitBarrier(exitRouteActivity);
    return () => {
      exitRouteActivity();
      unregister();
    };
  }, [exitRouteActivity, registerLessonRouteExitBarrier]);

  const handleBack = useCallback(() => {
    exitRouteActivity();
    onBack();
  }, [exitRouteActivity, onBack]);

  const dispatchLessonEvent = useCallback(
    (event: LessonEvent, { cancel = false }: { cancel?: boolean } = {}) => {
      const currentState = stateRef.current;
      const targetSceneIndex = getLessonEventTargetSceneIndex(
        currentState,
        event,
        currentLesson,
      );
      if (targetSceneIndex !== null) {
        invalidateRouteActivity();
        setError("");
        pendingHistoryPopTokenRef.current = null;
        pendingRoutedEventRef.current = {
          event,
          sceneIndex: targetSceneIndex,
        };
        onNavigateScene(targetSceneIndex);
        return;
      }

      if (cancel) {
        cancelPendingWork();
        setError("");
      }
      dispatch(event);
    },
    [
      cancelPendingWork,
      currentLesson,
      invalidateRouteActivity,
      onNavigateScene,
    ],
  );

  useEffect(() => {
    const pendingRoutedEvent = pendingRoutedEventRef.current;
    const popReconciliation = consumeLessonHistoryPopToken(
      pendingHistoryPopTokenRef.current,
      routedLocationKey,
    );
    pendingHistoryPopTokenRef.current = popReconciliation.pendingToken;
    const reconciliationEvent = getLessonRouteReconciliationEvent(
      pendingRoutedEvent,
      routedSceneIndex,
      {
        currentSceneIndex: state.sceneIndex,
        isHistoryPop: popReconciliation.isHistoryPop,
      },
    );
    if (!reconciliationEvent) return;
    pendingRoutedEventRef.current = null;

    cancelPendingWork();
    setError("");
    dispatch(reconciliationEvent);
  }, [
    cancelPendingWork,
    historyPopSequence,
    routedLocationKey,
    routedSceneIndex,
    state.sceneIndex,
  ]);

  useEffect(() => {
    if (
      state.sceneIndex === routedSceneIndex &&
      (state.phase === LessonPhase.Idle ||
        state.phase === LessonPhase.Finished)
    ) {
      startActionRef.current?.focus({ preventScroll: true });
    }
  }, [
    historyPopSequence,
    routedLocationKey,
    routedSceneIndex,
    decodedArtworkSources,
    state.phase,
    state.sceneIndex,
  ]);

  const currentStep = getCurrentStep(state, currentLesson);
  if (!currentStep) throw new Error("The lesson position is invalid.");
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentLesson, VISUAL_CATALOG),
    [currentLesson, state],
  );
  const progressLabel = getLessonProgressLabel(state, currentStep);
  const storyPlaybackPhase =
    state.phase === LessonPhase.Paused
      ? state.resumePhase === LessonPhase.Speaking
        ? LessonPhase.Speaking
        : null
      : state.phase === LessonPhase.Speaking
        ? LessonPhase.Speaking
        : null;

  useEffect(() => {
    const currentArtwork = fullSceneArtwork?.[state.sceneIndex];
    const nextArtwork = fullSceneArtwork?.[state.sceneIndex + 1];
    if (
      !currentArtwork ||
      !decodedArtworkSources.has(currentArtwork.src) ||
      !nextArtwork
    ) {
      return;
    }

    const preload = new Image();
    preload.decoding = "async";
    preload.src = nextArtwork.src;
    if (typeof preload.decode === "function") {
      void preload.decode().catch(() => undefined);
    }
  }, [decodedArtworkSources, fullSceneArtwork, state.sceneIndex]);

  useEffect(() => {
    if (state.sceneIndex !== routedSceneRef.current) return;
    if (!storyPlaybackPhase) return;
    const currentArtworkSrc = fullSceneArtwork?.[state.sceneIndex]?.src;
    if (currentArtworkSrc && !decodedArtworkSources.has(currentArtworkSrc)) {
      return;
    }

    let startPlayback: (
      signal: AbortSignal,
      onPlaybackControl: (control: PlaybackControl | null) => void,
    ) => Promise<void>;
    try {
      if (source === "my") {
        const speechLine = getLessonSpeechLine(state, currentLesson);
        if (!speechLine) return;
        startPlayback = (signal, onPlaybackControl) =>
          playDeviceSpeech({ ...speechLine, onPlaybackControl, signal });
      } else {
        const audioLine = getLessonAudioLine(state, currentLesson);
        if (!audioLine) return;
        startPlayback = (signal, onPlaybackControl) =>
          playAudioLine({ ...audioLine, onPlaybackControl, signal });
      }
    } catch {
      setError(LESSON_AUDIO_ERROR_MESSAGE);
      return;
    }

    const generation = playbackGenerationRef.current + 1;
    playbackGenerationRef.current = generation;
    const routeGeneration = routeActivityGuardRef.current.capture();
    const playbackOperation = createPlaybackOperation({
      generation,
      getCurrentGeneration: () => playbackGenerationRef.current,
      onCompleted: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatchLessonEvent({ type: "LINE_DONE" });
      },
      onFailed: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        setError(LESSON_AUDIO_ERROR_MESSAGE);
      },
    });
    let cancelled = false;
    const controller = new AbortController();
    playbackControllerRef.current = controller;
    setError("");

    void startPlayback(controller.signal, (control) => {
      if (playbackGenerationRef.current === generation) {
        playbackControlRef.current = control;
      }
    })
      .then(() => playbackOperation.complete())
      .catch((caughtError: unknown) => {
        if (cancelled || isAbortError(caughtError)) return;
        playbackOperation.fail(caughtError);
      })
      .finally(() => {
        if (playbackControllerRef.current === controller) {
          playbackControllerRef.current = null;
          playbackControlRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
        playbackControlRef.current = null;
      }
    };
  }, [
    audioRetrySequence,
    currentLesson,
    decodedArtworkSources,
    dispatchLessonEvent,
    fullSceneArtwork,
    routedSceneIndex,
    source,
    state.sceneIndex,
    state.stepIndex,
    storyPlaybackPhase,
  ]);

  useEffect(() => {
    if (state.phase !== LessonPhase.JoiningIn) return;
    if (state.sceneIndex !== routedSceneRef.current) return;
    const currentArtworkSrc = fullSceneArtwork?.[state.sceneIndex]?.src;
    if (currentArtworkSrc && !decodedArtworkSources.has(currentArtworkSrc)) {
      return;
    }

    const routeGeneration = routeActivityGuardRef.current.capture();
    const generation = playbackGenerationRef.current + 1;
    playbackGenerationRef.current = generation;
    const controller = new AbortController();
    playbackControllerRef.current = controller;
    let session: SpeechRecordingSession | null = null;
    const slot = {
      lessonId,
      sceneIndex: state.sceneIndex,
      source,
      stepIndex: state.stepIndex,
    };
    const isCurrent = () =>
      !controller.signal.aborted &&
      playbackGenerationRef.current === generation &&
      routeActivityGuardRef.current.isCurrent(routeGeneration);
    const clearSession = () => {
      if (recordingRef.current === session) recordingRef.current = null;
      setJoinInRecording(false);
    };

    setError("");
    setJoinInRecording(false);

    const playCue = async () => {
      if (source === "my") {
        await playDeviceSpeech({
          onPlaybackControl: (control) => {
            if (isCurrent()) playbackControlRef.current = control;
          },
          signal: controller.signal,
          speaker: "narrator",
          text: currentStep.dialogue,
          volume: 0.28,
        });
        return;
      }
      const cue = getLessonJoinInAudioLine(state, currentLesson);
      if (!cue) throw new Error("The join-in cue is missing.");
      await playAudioLine({
        ...cue,
        onPlaybackControl: (control) => {
          if (isCurrent()) playbackControlRef.current = control;
        },
        signal: controller.signal,
      });
    };

    const runJoinIn = async () => {
      if (recordingPermissionRef.current) {
        try {
          session = await startSpeechRecording({ signal: controller.signal });
          if (!isCurrent()) {
            session.cancel();
            return;
          }
          recordingRef.current = session;
          setJoinInRecording(true);
        } catch (caughtError) {
          if (isAbortError(caughtError) || !isCurrent()) return;
          recordingPermissionRef.current = false;
          showMicrophoneNotice();
          session = null;
        }
      }

      try {
        await playCue();
      } catch (caughtError) {
        if (isAbortError(caughtError) || !isCurrent()) return;
        session?.cancel();
        session = null;
        clearSession();
        try {
          await waitForAbortableDelay(
            JOIN_IN_FAILURE_DISPLAY_MS,
            controller.signal,
          );
        } catch {
          return;
        }
        if (isCurrent()) dispatchLessonEvent({ type: "JOIN_IN_DONE" });
        return;
      }

      try {
        await waitForAbortableDelay(JOIN_IN_TAIL_MS, controller.signal);
      } catch {
        return;
      }

      if (session) {
        const completedSession = session;
        try {
          const blob = await completedSession.stop();
          if (!isCurrent()) return;
          session = null;
          if (recordingRef.current === completedSession) {
            recordingRef.current = null;
          }
          setJoinInRecording(false);
          if (blob.size > 0) recordingQueue.enqueue(slot, blob);
        } catch (caughtError) {
          if (isAbortError(caughtError) || !isCurrent()) return;
          session = null;
          if (recordingRef.current === completedSession) {
            recordingRef.current = null;
          }
          setJoinInRecording(false);
        }
      }

      if (isCurrent()) dispatchLessonEvent({ type: "JOIN_IN_DONE" });
    };

    void runJoinIn().finally(() => {
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
        playbackControlRef.current = null;
      }
    });

    return () => {
      controller.abort();
      session?.cancel();
      if (recordingRef.current === session) recordingRef.current = null;
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
        playbackControlRef.current = null;
      }
      setJoinInRecording(false);
    };
  }, [
    currentLesson,
    currentStep.dialogue,
    decodedArtworkSources,
    dispatchLessonEvent,
    fullSceneArtwork,
    lessonId,
    recordingQueue,
    showMicrophoneNotice,
    source,
    state.phase,
    state.sceneIndex,
    state.stepIndex,
  ]);

  useEffect(
    () => () => {
      routeActivityGuardRef.current.invalidate();
      playbackGenerationRef.current += 1;
      preflightControllerRef.current?.abort();
      playbackControllerRef.current?.abort();
      playbackControlRef.current = null;
      recordingRef.current?.cancel();
      recordingRef.current = null;
    },
    [],
  );

  function dispatchSceneControl(
    type:
      | "PAUSE_SCENE"
      | "SCENE_PREVIOUS"
      | "SCENE_NEXT"
      | "REPLAY_LESSON",
  ) {
    dispatchLessonEvent({ type }, { cancel: true });
  }

  function handleRetryAudio() {
    cancelPendingWork();
    setError("");
    setAudioRetrySequence((current) => current + 1);
  }

  function handleSkipAudio() {
    if (!storyPlaybackPhase) return;
    cancelPendingWork();
    setError("");
    dispatchLessonEvent({ type: "LINE_DONE" });
  }

  async function handleStartAction() {
    if (state.phase === LessonPhase.Finished) {
      dispatchSceneControl("REPLAY_LESSON");
      return;
    }
    if (startPendingRef.current) return;

    const currentArtwork = fullSceneArtwork?.[state.sceneIndex];
    if (currentArtwork && !decodedArtworkSources.has(currentArtwork.src)) {
      return;
    }

    startPendingRef.current = true;
    const routeGeneration = routeActivityGuardRef.current.capture();
    const controller = new AbortController();
    preflightControllerRef.current = controller;
    try {
      const consentEnabled = await loadConsentOnce();
      const isCurrent = () =>
        !controller.signal.aborted &&
        routeActivityGuardRef.current.isCurrent(routeGeneration);
      if (!isCurrent()) return;

      recordingPermissionRef.current = false;
      if (consentEnabled) {
        try {
          await requestMicrophoneAccess({ signal: controller.signal });
          if (!isCurrent()) return;
          recordingPermissionRef.current = true;
        } catch (caughtError) {
          if (!isCurrent() || isAbortError(caughtError)) return;
          recordingPermissionRef.current = false;
          showMicrophoneNotice();
        }
      }

      if (isCurrent()) {
        dispatchLessonEvent({ type: "PLAY_SCENE" });
      }
    } finally {
      if (preflightControllerRef.current === controller) {
        preflightControllerRef.current = null;
        startPendingRef.current = false;
      }
    }
  }

  function handlePauseResume() {
    if (state.phase === LessonPhase.Paused) {
      if (state.resumePhase === LessonPhase.JoiningIn) {
        dispatchLessonEvent({ type: "PLAY_SCENE" });
        return;
      }
      const playbackControl = playbackControlRef.current;
      if (!playbackControl) return;
      playbackControl.resume();
      dispatchLessonEvent({ type: "PLAY_SCENE" });
      return;
    }

    if (state.phase === LessonPhase.JoiningIn) {
      dispatchSceneControl("PAUSE_SCENE");
      return;
    }

    const playbackControl = playbackControlRef.current;
    if (!playbackControl) return;
    playbackControl.pause();
    dispatchLessonEvent({ type: "PAUSE_SCENE" });
  }

  const isIdle = state.phase === LessonPhase.Idle;
  const isFinished = state.phase === LessonPhase.Finished;
  const isPaused = state.phase === LessonPhase.Paused;
  const showJoinIn =
    state.phase === LessonPhase.JoiningIn ||
    (isPaused && state.resumePhase === LessonPhase.JoiningIn);
  const showActiveScene = !isIdle && !isFinished;
  const showPlaybackControls =
    state.phase === LessonPhase.Speaking ||
    state.phase === LessonPhase.JoiningIn ||
    isPaused;
  const atFirstScene = state.sceneIndex === 0;
  const atFinalScene = state.sceneIndex === currentLesson.scenes.length - 1;
  const speechCharacterIndex = scene.characters.findIndex(
    (character) => character.id === scene.speech.speaker,
  );
  const fullScene = fullSceneArtwork?.[state.sceneIndex];
  if (fullSceneArtwork && !fullScene) {
    throw new Error(
      "Lesson artwork is missing scene " + (state.sceneIndex + 1) + ".",
    );
  }
  const reserved = Boolean(fullScene);
  const artworkReady = !fullScene || decodedArtworkSources.has(fullScene.src);
  const artworkFailed = Boolean(
    fullScene && failedArtworkSrc === fullScene.src,
  );
  const activeHud = (
    <LessonHud
      currentScene={state.sceneIndex + 1}
      reserved={reserved}
      sceneCount={currentLesson.scenes.length}
      title={scene.title}
    />
  );
  const activeDialogue = showJoinIn ? (
    <LessonJoinInPrompt
      dialogue={currentStep.dialogue}
      recording={joinInRecording}
      reserved={reserved}
    />
  ) : (
    <LessonSpeech
      characterCount={scene.characters.length}
      characterIndex={speechCharacterIndex}
      reserved={reserved}
      showTail={!fullScene}
      speech={scene.speech}
    />
  );
  const activeControls =
    artworkReady && showPlaybackControls ? (
      <LessonPlaybackControls
        atFinalScene={atFinalScene}
        atFirstScene={atFirstScene}
        isPaused={isPaused}
        onNext={() => dispatchSceneControl("SCENE_NEXT")}
        onPauseResume={handlePauseResume}
        onPrevious={() => dispatchSceneControl("SCENE_PREVIOUS")}
        reserved={reserved}
      />
    ) : null;
  const activeNotice =
    error || microphoneNotice ? (
      <LessonErrorBanner
        error={error || microphoneNotice}
        onRetry={
          error === LESSON_AUDIO_ERROR_MESSAGE ? handleRetryAudio : undefined
        }
        onSkip={
          error === LESSON_AUDIO_ERROR_MESSAGE ? handleSkipAudio : undefined
        }
        reserved={reserved}
        tone={error ? "error" : "help"}
      />
    ) : null;
  const saveState =
    recordingSnapshot.pending > 0
      ? "pending"
      : recordingSnapshot.failed > 0
        ? "failed"
        : "idle";

  return (
    <LessonStage
      background={scene.backgroundAsset}
      presentation={fullScene ? "boxed" : "layered"}
    >
      {fullScene && isIdle ? (
        <BoxedFullSceneStage
          decoded={decodedArtworkSources.has(fullScene.src)}
          image={fullScene}
          onDecoded={handleArtworkDecoded}
          onFailed={handleArtworkFailed}
          onRetry={handleArtworkRetry}
        />
      ) : null}
      <RouteHeader>
        <HeaderButton
          aria-label="Back to lesson list"
          icon={<ChevronLeft strokeWidth={3.2} />}
          onClick={handleBack}
          type="button"
        >
          Back to lessons
        </HeaderButton>
      </RouteHeader>

      {isIdle && !artworkFailed ? (
        <LessonIntroduction
          lessonTitle={currentLesson.title}
          onStart={handleStartAction}
          ready={artworkReady}
          ref={startActionRef}
          sceneCount={currentLesson.scenes.length}
        />
      ) : null}

      {isFinished ? (
        <LessonCompletion
          lessonTitle={currentLesson.title}
          onBack={handleBack}
          onReplay={handleStartAction}
          onRetrySaving={() => {
            void recordingQueue.retryFailed();
            startActionRef.current?.focus({ preventScroll: true });
          }}
          ref={startActionRef}
          saveState={saveState}
        />
      ) : null}

      {showActiveScene ? (
        fullScene ? (
          <BoxedLessonSceneLayout
            artworkDecoded={artworkReady}
            controls={activeControls}
            dialogue={activeDialogue}
            hud={activeHud}
            image={fullScene}
            notice={activeNotice}
            onArtworkDecoded={handleArtworkDecoded}
          />
        ) : (
          <>
            {activeHud}
            <LessonCharacters characters={scene.characters} />
            {activeDialogue}
            {activeControls}
            {activeNotice}
          </>
        )
      ) : null}

      <div
        aria-label="Lesson updates"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {isIdle || isFinished
          ? progressLabel
          : progressLabel +
            "." +
            (showJoinIn ? " Join in: " + currentStep.dialogue + "." : "") +
            " Scene " +
            (state.sceneIndex + 1) +
            " of " +
            currentLesson.scenes.length +
            ". " +
            scene.settingDescription}
        {error ? " " + error : ""}
      </div>
    </LessonStage>
  );
}
function LessonRouteDecisionView({
  decision,
  source,
}: {
  decision: LessonRouteDecision;
  source: LessonSource;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  if (decision.kind === "redirect") {
    return (
      <Navigate
        replace={decision.replace}
        to={decision.to}
      />
    );
  }

  const fullSceneArtwork =
    source === "parrot"
      ? FULL_SCENE_LESSONS.find(
          (candidate) => candidate.lessonId === decision.entry.id,
        )?.scenes
      : undefined;

  return (
    <LessonPlayer
      fullSceneArtwork={fullSceneArtwork}
      key={`${source}:${decision.entry.id}`}
      lesson={decision.entry.lesson}
      lessonId={decision.entry.id}
      onBack={() => navigate("/lessons")}
      onNavigateScene={(sceneIndex) =>
        navigate(getLessonScenePath(source, decision.entry.id, sceneIndex))
      }
      routedLocationKey={location.key}
      routedSceneIndex={decision.sceneIndex}
      source={source}
    />
  );
}

function ParrotLessonRedirect() {
  const { lessonId } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, undefined);
  return (
    <LessonRouteDecisionView
      decision={decision}
      source="parrot"
    />
  );
}

function ParrotLessonSceneRoute() {
  const { lessonId, sceneNumber } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, sceneNumber);
  return (
    <LessonRouteDecisionView
      decision={decision}
      source="parrot"
    />
  );
}

function MyLessonRoute() {
  const { lessonId, sceneNumber } = useParams();
  const [entry, setEntry] = useState<LessonCatalogEntry | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadSequence, setLoadSequence] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!lessonId) {
      setLoadError("This lesson link is incomplete.");
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    setLoadError("");
    void loadMyLesson(lessonId, { signal: controller.signal })
      .then((descriptor) => {
        setEntry({ id: descriptor.id, lesson: descriptor.lesson });
      })
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setEntry(null);
        setLoadError(
          caughtError instanceof Error
            ? caughtError.message
            : "Your lesson could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [lessonId, loadSequence]);

  if (isLoading) {
    return (
      <FeaturePlaceholder
        actionLabel="Back to lessons"
        actionTo="/lessons"
        busy
        description="Getting the story and speaking practice ready."
        title="Loading your lesson…"
      />
    );
  }
  if (!entry) {
    return (
      <FeaturePlaceholder
        actionLabel="Back to lessons"
        actionTo="/lessons"
        description={
          loadError ||
          "It may have been removed, or your lessons may still be loading."
        }
        onRetry={() => setLoadSequence((current) => current + 1)}
        title="We couldn’t open that lesson"
      />
    );
  }
  const decision = resolveMyLessonRouteDecision(entry, lessonId, sceneNumber);
  return (
    <LessonRouteDecisionView
      decision={decision}
      source="my"
    />
  );
}

function StoryRouteDecisionView({
  decision,
}: {
  decision: StoryRouteDecision;
}) {
  const navigate = useNavigate();
  const personalizedStoryArt = usePersonalizedStoryArt();

  if (decision.kind === "redirect") {
    return <Navigate replace={decision.replace} to={decision.to} />;
  }

  return (
    <StoryReader
      backToStories={getStoryShelfPath(decision.story.level)}
      onNavigatePage={(pageIndex) =>
        navigate(getStoryPagePath(decision.story.id, pageIndex))
      }
      pageIndex={decision.pageIndex}
      personalizedOverrides={personalizedStoryArt.personalizedOverrides}
      story={decision.story}
    />
  );
}

function StoryRedirect() {
  const { storyId } = useParams();
  return (
    <StoryRouteDecisionView
      decision={resolveStoryRouteDecision(storyId, undefined)}
    />
  );
}

function StoryPageRoute() {
  const { pageNumber, storyId } = useParams();
  return (
    <StoryRouteDecisionView
      decision={resolveStoryRouteDecision(storyId, pageNumber)}
    />
  );
}

export function ApplicationRoutes({
  learnerName = "Learner",
  loginTarget,
  onBeforeModeNavigate,
}: {
  learnerName?: string;
  loginTarget: string;
  onBeforeModeNavigate?: () => void;
}) {
  return (
    <Suspense
      fallback={
        <FeaturePlaceholder
          busy
          description="Getting your activity ready."
          title="Loading…"
        />
      }
    >
      <RouteFocusManager />
      <Routes>
        <Route
          element={
            <GuardianDashboard
              learnerName={learnerName}
              onBeforeNavigate={onBeforeModeNavigate}
            />
          }
          path={getGuardianPath()}
        />
        <Route
          element={<GuardianLessonManager />}
          path="/guardian/lessons"
        />
        <Route
          element={<GuardianStorySettings />}
          path="/guardian/stories"
        />
        <Route element={<HomeMenu />} path="/" />
        <Route
          element={
            <FeaturePlaceholder
              actionLabel="Choose a lesson"
              actionTo="/lessons"
              description="Voice chat isn't available right now. You can choose a lesson or try again soon."
              secondaryActionLabel="Back to home"
              secondaryActionTo="/"
              title="Peppa is taking a break"
            />
          }
          path="/talk-to-peppa"
        />
        <Route element={<LessonList />} path="/lessons" />
        <Route element={<LessonCreator />} path="/lessons/my/create" />
        <Route
          element={<LessonEditor />}
          path="/lessons/my/:lessonId/edit"
        />
        <Route
          element={<ParrotLessonRedirect />}
          path="/lessons/parrot/:lessonId"
        />
        <Route
          element={<ParrotLessonSceneRoute />}
          path="/lessons/parrot/:lessonId/scenes/:sceneNumber"
        />
        <Route element={<MyLessonRoute />} path="/lessons/my/:lessonId" />
        <Route
          element={<MyLessonRoute />}
          path="/lessons/my/:lessonId/scenes/:sceneNumber"
        />
        <Route element={<Navigate replace to="/" />} path="/progress" />
        <Route element={<StoryList />} path="/stories" />
        <Route element={<DuckDub />} path="/dubs/five-little-ducks" />
        <Route element={<StoryRedirect />} path="/stories/:storyId" />
        <Route
          element={<StoryPageRoute />}
          path="/stories/:storyId/pages/:pageNumber"
        />
        <Route element={<Navigate replace to={loginTarget} />} path="/login" />
        <Route element={null} path="/profile/setup" />
        <Route element={null} path="/profile" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  );
}

export function AuthenticatedApplication({
  onExitLessonRoute,
}: {
  onExitLessonRoute: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const accountExperience = useAccountExperience();
  const gateRoute = getGateRouteKind(location.pathname);
  const onLoginRoute = gateRoute === "login";
  const isLearnerProfileRoute = gateRoute === "learner-profile";
  const isProfileRoute = gateRoute === "profile";
  const isConversationRoute = isTalkToPeppaRoute(location.pathname);
  const redoLearnerProfile =
    isLearnerProfileRoute && isRedoLearnerProfileRequest(location.search);
  const safeReturnTo = getSafeReturnTo(location.search) ?? "/";
  const requestedProtectedTarget = getRequestedProtectedTarget(
    location.pathname,
    location.search,
    location.hash,
  );
  const openProfileRoute = useCallback(() => {
    onExitLessonRoute();
    navigate(getProfilePath(requestedProtectedTarget));
  }, [navigate, onExitLessonRoute, requestedProtectedTarget]);

  const applicationRoutes = (
    <ApplicationRoutes
      learnerName={accountExperience?.learnerName?.trim() || "Learner"}
      loginTarget={safeReturnTo}
      onBeforeModeNavigate={onExitLessonRoute}
    />
  );
  const routeContent = (
    <LearnerProfileGate
      completedLearnerProfileFallback={<Navigate replace to={safeReturnTo} />}
      isConversationRoute={isConversationRoute}
      isLearnerProfileRoute={isLearnerProfileRoute}
      isProfileRoute={isProfileRoute}
      learnerProfileFallback={
        <Navigate
          replace
          to={getLearnerProfilePath(requestedProtectedTarget)}
        />
      }
      onCloseProfileRoute={() => navigate(safeReturnTo, { replace: true })}
      onConversationCompleted={() => navigate("/", { replace: true })}
      onOpenLessons={() => navigate("/lessons", { replace: true })}
      onOpenProfileRoute={openProfileRoute}
      onRedoCompleted={() => navigate(safeReturnTo, { replace: true })}
      onRedoLearnerProfileRoute={() =>
        navigate(getRedoLearnerProfilePath(getProfilePath(safeReturnTo)))
      }
      redoLearnerProfile={redoLearnerProfile}
    >
      {applicationRoutes}
    </LearnerProfileGate>
  );

  if (!isDeclaredApplicationRoute(location.pathname)) {
    return applicationRoutes;
  }

  if (onLoginRoute || (isLearnerProfileRoute && !redoLearnerProfile)) {
    return routeContent;
  }

  if (isGuardianRoute(location.pathname, location.search)) {
    return (
      <GuardianModeBoundary onBeforeNavigate={onExitLessonRoute}>
        {routeContent}
      </GuardianModeBoundary>
    );
  }

  return (
    <LearnerModeBoundary onBeforeNavigate={onExitLessonRoute}>
      {routeContent}
    </LearnerModeBoundary>
  );
}

function RoutedApplication() {
  const location = useLocation();
  const lessonRouteExitRegistryRef = useRef(createLessonRouteExitRegistry());
  const registerLessonRouteExitBarrier = useCallback(
    (barrier: () => void) => lessonRouteExitRegistryRef.current.register(barrier),
    [],
  );
  const exitLessonRoute = useCallback(
    () => lessonRouteExitRegistryRef.current.exit(),
    [],
  );
  const gateRoute = getGateRouteKind(location.pathname);
  const onLoginRoute = gateRoute === "login";
  const requestedProtectedTarget = getRequestedProtectedTarget(
    location.pathname,
    location.search,
    location.hash,
  );

  return (
    <LessonRouteExitBarrierContext.Provider
      value={registerLessonRouteExitBarrier}
    >
      <AuthGate
        signedOutFallback={
          onLoginRoute ? null : (
            <Navigate replace to={getLoginPath(requestedProtectedTarget)} />
          )
        }
      >
        <AuthenticatedApplication onExitLessonRoute={exitLessonRoute} />
      </AuthGate>
    </LessonRouteExitBarrierContext.Provider>
  );
}

export function App() {
  return <RoutedApplication />;
}
