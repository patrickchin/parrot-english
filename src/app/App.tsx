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
import { evaluateSpeech } from "../lessons/evaluation-request";
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
  LessonFeedback,
  LessonHud,
  LessonIntroduction,
  LessonPlaybackControls,
  LessonSpeakingControls,
  LessonSpeech,
  LessonStage,
  LessonUserPrompt,
} from "../lessons/LessonPlayerUi";
import { playDeviceSpeech } from "../media/device-speech";
import { loadMyLesson } from "../lessons/my-lessons-api";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { createPlaybackOperation } from "../lessons/playback-operation";
import { finishSpeechOperation } from "../lessons/speech-operation";
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

const RECORDING_UNSUPPORTED_MESSAGE =
  "No mic here. Say the words. Then tap Done.";
const MICROPHONE_ACCESS_MESSAGE =
  "The mic is off. Say the words. Then tap Done.";
const MICROPHONE_ERROR_MESSAGE =
  "The mic did not work. Say the words. Then tap Done.";
const SPEECH_CHECK_ERROR_MESSAGE =
  "We could not check your words. Tap Done to keep going.";
const LESSON_AUDIO_ERROR_MESSAGE =
  "The sound stopped. Try it again or skip this sound.";
const legacyLessonPhase = {
  Evaluating: "evaluating",
  Recording: "recording",
  Responding: "responding",
  WaitingForUser: "waiting-for-user",
} as const;

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
  audioMode: "device" | "static";
  fullSceneArtwork?: FullSceneImage[];
  lesson: Lesson;
  onBack: () => void;
  onNavigateScene: (sceneIndex: number) => void;
  promptPortrait?: {
    alt: string;
    src: string;
  } | null;
  routedLocationKey: string;
  routedSceneIndex: number;
};

type RegisterLessonRouteExitBarrier = (
  barrier: () => void,
) => () => void;

const LessonRouteExitBarrierContext =
  createContext<RegisterLessonRouteExitBarrier>(() => () => {});

function getMicrophoneErrorMessage(caughtError: unknown) {
  if (caughtError instanceof RecordingUnsupportedError) {
    return RECORDING_UNSUPPORTED_MESSAGE;
  }
  if (caughtError instanceof MicrophoneAccessError) {
    return MICROPHONE_ACCESS_MESSAGE;
  }
  return MICROPHONE_ERROR_MESSAGE;
}

export function LessonPlayer({
  audioMode,
  fullSceneArtwork,
  lesson: currentLesson,
  onBack,
  onNavigateScene,
  promptPortrait,
  routedLocationKey,
  routedSceneIndex,
}: LessonPlayerProps) {
  const registerLessonRouteExitBarrier = useContext(
    LessonRouteExitBarrierContext,
  );
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) => reduceLessonState(currentState, event, currentLesson),
    { ...createInitialLessonState(), sceneIndex: routedSceneIndex }
  );
  const dispatchLegacyEvent = dispatch as (
    event: { type: string } & Record<string, unknown>,
  ) => void;
  const [error, setError] = useState("");
  const [speechFallback, setSpeechFallback] = useState("");
  const [isStartingRecording, setIsStartingRecording] = useState(false);
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
  const recordingRef = useRef<SpeechRecordingSession | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const evaluationControllerRef = useRef<AbortController | null>(null);
  const recordingSequenceRef = useRef(0);
  const recordingActiveRef = useRef(false);
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

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cancelPendingWork = useCallback(() => {
    setIsStartingRecording(false);
    recordingActiveRef.current = false;
    recordingSequenceRef.current += 1;
    playbackGenerationRef.current += 1;
    playbackControllerRef.current?.abort();
    playbackControllerRef.current = null;
    playbackControlRef.current = null;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingRef.current?.cancel();
    recordingRef.current = null;
    evaluationControllerRef.current?.abort();
    evaluationControllerRef.current = null;
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
        setSpeechFallback("");
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
        setSpeechFallback("");
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
    setSpeechFallback("");
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
  const legacyState = state as typeof state & {
    response?: { dialogue: string; speaker: string } | null;
    responseOutcome?:
      | "correct"
      | "incorrect"
      | "incorrectFinal"
      | "noInput"
      | "noInputFinal"
      | null;
    transcript?: string;
  };
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentLesson, VISUAL_CATALOG),
    [currentLesson, state]
  );
  const progressLabel = getLessonProgressLabel(
    state,
    legacyState.response ?? currentStep,
  );
  const playbackPhase =
    state.phase === LessonPhase.Paused
      ? state.resumePhase
      : state.phase === LessonPhase.Speaking ||
          state.phase === legacyLessonPhase.Responding
        ? state.phase
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
    if (!playbackPhase) return;
    const currentArtworkSrc = fullSceneArtwork?.[state.sceneIndex]?.src;
    if (currentArtworkSrc && !decodedArtworkSources.has(currentArtworkSrc)) {
      return;
    }

    const completionEvent: LessonEvent = { type: "LINE_DONE" };
    let startPlayback: (
      signal: AbortSignal,
      onPlaybackControl: (control: PlaybackControl | null) => void,
    ) => Promise<void>;
    try {
      if (audioMode === "device") {
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
        dispatchLessonEvent(completionEvent);
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
      .then(() => {
        playbackOperation.complete();
      })
      .catch((caughtError: unknown) => {
        if (cancelled || isAbortError(caughtError)) return;
        playbackOperation.fail(caughtError);
      })
      .finally(() => {
        if (playbackControllerRef.current === controller) {
          playbackControllerRef.current = null;
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
    audioMode,
    currentLesson,
    decodedArtworkSources,
    dispatchLessonEvent,
    fullSceneArtwork,
    playbackPhase,
    routedSceneIndex,
    legacyState.response,
    state.sceneIndex,
    state.stepIndex,
  ]);

  useEffect(
    () => () => {
      routeActivityGuardRef.current.invalidate();
      recordingActiveRef.current = false;
      recordingSequenceRef.current += 1;
      playbackGenerationRef.current += 1;
      playbackControllerRef.current?.abort();
      playbackControlRef.current = null;
      recordingControllerRef.current?.abort();
      recordingRef.current?.cancel();
      evaluationControllerRef.current?.abort();
    },
    []
  );

  function dispatchSceneControl(
    type:
      | "PLAY_SCENE"
      | "PAUSE_SCENE"
      | "SCENE_PREVIOUS"
      | "SCENE_NEXT"
      | "REPLAY_LESSON"
  ) {
    dispatchLessonEvent({ type }, { cancel: true });
  }

  function handleRetryAudio() {
    cancelPendingWork();
    setError("");
    setAudioRetrySequence((current) => current + 1);
  }

  function handleSkipAudio() {
    if (!playbackPhase) return;
    cancelPendingWork();
    setError("");
    dispatchLessonEvent({ type: "LINE_DONE" });
  }

  function handleStartAction() {
    if (state.phase === LessonPhase.Finished) {
      dispatchSceneControl("REPLAY_LESSON");
      return;
    }

    const currentArtwork = fullSceneArtwork?.[state.sceneIndex];
    if (currentArtwork && !decodedArtworkSources.has(currentArtwork.src)) {
      return;
    }

    dispatchSceneControl("PLAY_SCENE");
  }

  function handlePauseResume() {
    const playbackControl = playbackControlRef.current;
    if (!playbackControl) return;

    if (state.phase === LessonPhase.Paused) {
      playbackControl.resume();
      dispatchLessonEvent({ type: "PLAY_SCENE" });
      return;
    }

    playbackControl.pause();
    dispatchLessonEvent({ type: "PAUSE_SCENE" });
  }

  function handleSkipUser() {
    if (recordingActiveRef.current && !recordingRef.current) return;
    dispatchLegacyEvent({ type: "SKIP_USER" });
  }

  async function beginRecording() {
    if (
      state.phase !== legacyLessonPhase.WaitingForUser ||
      recordingActiveRef.current ||
      recordingRef.current
    ) {
      return;
    }

    recordingActiveRef.current = true;
    setIsStartingRecording(true);
    const sequence = recordingSequenceRef.current + 1;
    recordingSequenceRef.current = sequence;
    const routeGeneration = routeActivityGuardRef.current.capture();
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    setError("");
    setSpeechFallback("");

    try {
      const session = await startSpeechRecording({ signal: controller.signal });
      if (
        !routeActivityGuardRef.current.isCurrent(routeGeneration) ||
        !recordingActiveRef.current ||
        recordingSequenceRef.current !== sequence
      ) {
        session.cancel();
        return;
      }
      recordingRef.current = session;
      setIsStartingRecording(false);
      dispatchLegacyEvent({ type: "MIC_STARTED" });
    } catch (caughtError) {
      if (
        !routeActivityGuardRef.current.isCurrent(routeGeneration) ||
        recordingSequenceRef.current !== sequence
      ) {
        return;
      }
      setIsStartingRecording(false);
      if (recordingControllerRef.current === controller) {
        recordingControllerRef.current = null;
      }
      if (isAbortError(caughtError)) {
        recordingActiveRef.current = false;
        return;
      }
      recordingActiveRef.current = false;
      setSpeechFallback(getMicrophoneErrorMessage(caughtError));
    }
  }

  async function finishRecording() {
    if (!recordingActiveRef.current) return;
    const routeGeneration = routeActivityGuardRef.current.capture();
    recordingActiveRef.current = false;
    const generation = recordingSequenceRef.current;
    const session = recordingRef.current;
    const recordingController = recordingControllerRef.current;
    setIsStartingRecording(false);
    if (recordingRef.current === session) {
      recordingRef.current = null;
    }

    if (!session) {
      recordingController?.abort();
      if (recordingControllerRef.current === recordingController) {
        recordingControllerRef.current = null;
      }
      return;
    }

    await finishSpeechOperation({
      evaluate: currentStep.check ? evaluateSpeech : null,
      evaluationControllerRef,
      generation,
      getCurrentGeneration: () => recordingSequenceRef.current,
      onEvaluated: (result) => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatchLegacyEvent({
          type: "EVALUATED",
          outcome: result.outcome,
          transcript: result.transcript,
        });
      },
      onFailed: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        if (currentStep.check) {
          setSpeechFallback(SPEECH_CHECK_ERROR_MESSAGE);
          dispatchLegacyEvent({ type: "EVALUATION_FAILED" });
        } else {
          setError("The mic stopped. Try it again.");
        }
      },
      onReleased: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatchLegacyEvent({ type: "MIC_RELEASED" });
      },
      recordingController,
      recordingControllerRef,
      session,
      targetText: currentStep.dialogue,
    });
  }

  function handleToggleRecording() {
    if (recordingRef.current) {
      void finishRecording();
      return;
    }
    void beginRecording();
  }

  const isRecording = state.phase === legacyLessonPhase.Recording;
  const isEvaluating = state.phase === legacyLessonPhase.Evaluating;
  const showUserTurn =
    state.phase === legacyLessonPhase.WaitingForUser || isRecording || isEvaluating;
  const isIdle = state.phase === LessonPhase.Idle;
  const isFinished = state.phase === LessonPhase.Finished;
  const isPaused = state.phase === LessonPhase.Paused;
  const isResponding =
    state.phase === legacyLessonPhase.Responding ||
    (isPaused &&
      (legacyState.resumePhase as string | null) ===
        legacyLessonPhase.Responding);
  const showActiveScene = !isIdle && !isFinished;
  const showPlaybackControls =
    state.phase === LessonPhase.Speaking ||
    state.phase === legacyLessonPhase.Responding ||
    isPaused;
  const atFirstScene = state.sceneIndex === 0;
  const atFinalScene = state.sceneIndex === currentLesson.scenes.length - 1;
  const speechCharacterIndex = scene.characters.findIndex(
    (character) => character.id === scene.speech.speaker
  );
  const fullScene = fullSceneArtwork?.[state.sceneIndex];
  if (fullSceneArtwork && !fullScene) {
    throw new Error(`Lesson artwork is missing scene ${state.sceneIndex + 1}.`);
  }
  const reserved = Boolean(fullScene);
  const artworkReady =
    !fullScene || decodedArtworkSources.has(fullScene.src);
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
  const activeDialogue = showUserTurn ? (
    <LessonUserPrompt
      dialogue={currentStep.dialogue}
      portrait={promptPortrait}
      reserved={reserved}
      status={
        isEvaluating ? "checking" : isRecording ? "recording" : "ready"
      }
    />
  ) : isResponding ? (
    <LessonFeedback
      outcome={legacyState.responseOutcome ?? null}
      reserved={reserved}
      speech={scene.speech}
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
  const activeControls = !artworkReady ? null : showUserTurn ? (
    <LessonSpeakingControls
      isEvaluating={isEvaluating}
      isRecording={isRecording}
      isStartingRecording={isStartingRecording}
      onSkip={handleSkipUser}
      onToggleRecording={handleToggleRecording}
      reserved={reserved}
      usePracticeFallback={Boolean(speechFallback)}
    />
  ) : showPlaybackControls ? (
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
    speechFallback || error ? (
      <LessonErrorBanner
        error={speechFallback || error}
        onRetry={
          error === LESSON_AUDIO_ERROR_MESSAGE ? handleRetryAudio : undefined
        }
        onSkip={
          error === LESSON_AUDIO_ERROR_MESSAGE ? handleSkipAudio : undefined
        }
        reserved={reserved}
        tone={speechFallback ? "help" : "error"}
      />
    ) : null;
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
          ref={startActionRef}
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
          : `${progressLabel}.${
              showUserTurn ? ` Say: ${currentStep.dialogue}.` : ""
            } Scene ${state.sceneIndex + 1} of ${
              currentLesson.scenes.length
            }. ${scene.settingDescription}`}
        {legacyState.transcript ? ` Heard: ${legacyState.transcript}.` : ""}
        {error ? ` ${error}` : ""}
      </div>
      <div
        aria-label="Speaking updates"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {speechFallback}
      </div>
    </LessonStage>
  );
}

function LessonRouteDecisionView({
  decision,
  promptPortrait,
  source,
}: {
  decision: LessonRouteDecision;
  promptPortrait?: {
    alt: string;
    src: string;
  } | null;
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
      audioMode={source === "my" ? "device" : "static"}
      fullSceneArtwork={fullSceneArtwork}
      key={`${source}:${decision.entry.id}`}
      lesson={decision.entry.lesson}
      onBack={() => navigate("/lessons")}
      onNavigateScene={(sceneIndex) =>
        navigate(getLessonScenePath(source, decision.entry.id, sceneIndex))
      }
      routedLocationKey={location.key}
      routedSceneIndex={decision.sceneIndex}
      promptPortrait={promptPortrait}
    />
  );
}

function ParrotLessonRedirect() {
  const personalizedStoryArt = usePersonalizedStoryArt();
  const { lessonId } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, undefined);
  return (
    <LessonRouteDecisionView
      decision={decision}
      promptPortrait={personalizedStoryArt.personalizedArtwork}
      source="parrot"
    />
  );
}

function ParrotLessonSceneRoute() {
  const personalizedStoryArt = usePersonalizedStoryArt();
  const { lessonId, sceneNumber } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, sceneNumber);
  return (
    <LessonRouteDecisionView
      decision={decision}
      promptPortrait={personalizedStoryArt.personalizedArtwork}
      source="parrot"
    />
  );
}

function MyLessonRoute() {
  const personalizedStoryArt = usePersonalizedStoryArt();
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
      promptPortrait={personalizedStoryArt.personalizedArtwork}
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
