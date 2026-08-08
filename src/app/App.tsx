"use client";

import { ChevronLeft } from "lucide-react";
import {
  createContext,
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
  getLessonScenePath,
  getLoginPath,
  getLearnerProfilePath,
  getParrotLessonVariantScenePath,
  getProfilePath,
  getRedoLearnerProfilePath,
  getRequestedProtectedTarget,
  getSafeReturnTo,
  getStoryPagePath,
  getStoryShelfPath,
  isRedoLearnerProfileRequest,
  isTalkToPeppaRoute,
  resolveMyLessonRouteDecision,
  resolveParrotLessonRouteDecision,
  resolveStoryRouteDecision,
  type LessonRouteDecision,
  type LessonSource,
  type StoryRouteDecision,
} from "./app-routes";
import { AuthGate } from "../auth/AuthGate";
import { HeaderButton, RouteHeader } from "./AppHeader";
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
import {
  BoxedFullSceneStage,
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
import { FULL_SCENE_LESSON_VARIANTS } from "../lessons/full-scene-lessons";
import { LessonCreator } from "../lessons/LessonCreator";
import { LessonEditor } from "../lessons/LessonEditor";
import { PixelLessonLab } from "../games/PixelLessonLab";
import { PixelWorldExplorer } from "../games/PixelWorldExplorer";
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
import { StoryList } from "../stories/StoryList";
import { StoryReader } from "../stories/StoryReader";

const RECORDING_UNSUPPORTED_MESSAGE =
  "This browser does not support audio recording. Try the latest Chrome or Safari.";
const MICROPHONE_ACCESS_MESSAGE =
  "Please allow microphone access, then tap the microphone again.";

type LessonEvent =
  | { type: "PLAY_SCENE" }
  | { type: "PAUSE_SCENE" }
  | { type: "SCENE_PREVIOUS" }
  | { type: "SCENE_NEXT" }
  | { type: "REPLAY_LESSON" }
  | { type: "SELECT_SCENE"; sceneIndex: number }
  | { type: "LINE_DONE" }
  | { type: "MIC_STARTED" }
  | { type: "MIC_RELEASED" }
  | { type: "SKIP_USER" }
  | { type: "RECORDING_CANCELLED" }
  | {
      type: "EVALUATED";
      outcome: "correct" | "incorrect" | "noInput";
      transcript: string;
    }
  | { type: "EVALUATION_FAILED" }
  | { type: "RESPONSE_DONE" }
  | { type: "RESET" };

type LessonPlayerProps = {
  audioMode: "device" | "static";
  lesson: Lesson;
  onBack: () => void;
  onNavigateScene: (sceneIndex: number) => void;
  routedLocationKey: string;
  routedSceneIndex: number;
  variant?: (typeof FULL_SCENE_LESSON_VARIANTS)[number];
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
  return caughtError instanceof Error
    ? caughtError.message
    : "The microphone could not start.";
}

export function LessonPlayer({
  audioMode,
  lesson: currentLesson,
  onBack,
  onNavigateScene,
  routedLocationKey,
  routedSceneIndex,
  variant,
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
  const [error, setError] = useState("");
  const [historyPopSequence, setHistoryPopSequence] = useState(0);
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

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cancelPendingWork = useCallback(() => {
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
    state.phase,
    state.sceneIndex,
  ]);

  const currentStep = getCurrentStep(state, currentLesson);
  if (!currentStep) throw new Error("The lesson position is invalid.");
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentLesson, VISUAL_CATALOG),
    [currentLesson, state]
  );
  const progressLabel = getLessonProgressLabel(
    state,
    state.response ?? currentStep,
  );
  const playbackPhase =
    state.phase === LessonPhase.Paused
      ? state.resumePhase
      : state.phase === LessonPhase.Speaking ||
          state.phase === LessonPhase.Responding
        ? state.phase
        : null;

  useEffect(() => {
    if (state.sceneIndex !== routedSceneRef.current) return;
    if (!playbackPhase) return;

    const completionEvent: LessonEvent =
      playbackPhase === LessonPhase.Responding
        ? { type: "RESPONSE_DONE" }
        : { type: "LINE_DONE" };
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
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Audio is unavailable.";
      setError(`Audio unavailable: ${message}`);
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
      onFailed: (caughtError) => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        const message =
          caughtError instanceof Error ? caughtError.message : "Audio playback failed.";
        setError(`Audio unavailable: ${message}`);
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
    audioMode,
    currentLesson,
    dispatchLessonEvent,
    playbackPhase,
    routedSceneIndex,
    state.response,
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

  function handleStartAction() {
    if (state.phase === LessonPhase.Finished) {
      dispatchSceneControl("REPLAY_LESSON");
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
    dispatchLessonEvent({ type: "SKIP_USER" }, { cancel: true });
  }

  async function beginRecording() {
    if (
      state.phase !== LessonPhase.WaitingForUser ||
      recordingActiveRef.current ||
      recordingRef.current
    ) {
      return;
    }

    recordingActiveRef.current = true;
    const sequence = recordingSequenceRef.current + 1;
    recordingSequenceRef.current = sequence;
    const routeGeneration = routeActivityGuardRef.current.capture();
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    setError("");

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
      dispatch({ type: "MIC_STARTED" });
    } catch (caughtError) {
      if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
      if (isAbortError(caughtError)) return;
      recordingActiveRef.current = false;
      setError(getMicrophoneErrorMessage(caughtError));
    }
  }

  async function finishRecording() {
    if (!recordingActiveRef.current) return;
    const routeGeneration = routeActivityGuardRef.current.capture();
    recordingActiveRef.current = false;
    const generation = recordingSequenceRef.current;
    const session = recordingRef.current;
    const recordingController = recordingControllerRef.current;
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
        dispatch({
          type: "EVALUATED",
          outcome: result.outcome,
          transcript: result.transcript,
        });
      },
      onFailed: (caughtError) => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        if (currentStep.check) {
          setError(
            caughtError instanceof Error && caughtError.message.includes("GROQ_API_KEY")
              ? "Speech checking is not configured."
              : `Speech check failed: ${
                  caughtError instanceof Error ? caughtError.message : "Unknown error."
                }`
          );
          dispatch({ type: "EVALUATION_FAILED" });
        } else {
          setError(
            `Recording failed: ${
              caughtError instanceof Error ? caughtError.message : "Unknown error."
            }`,
          );
        }
      },
      onReleased: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatchLessonEvent({ type: "MIC_RELEASED" });
      },
      recordingController,
      recordingControllerRef,
      session,
      targetText: currentStep.dialogue,
    });
  }

  function handleToggleRecording() {
    if (recordingActiveRef.current) {
      void finishRecording();
      return;
    }
    void beginRecording();
  }

  const isRecording = state.phase === LessonPhase.Recording;
  const isEvaluating = state.phase === LessonPhase.Evaluating;
  const showUserTurn =
    state.phase === LessonPhase.WaitingForUser || isRecording || isEvaluating;
  const isIdle = state.phase === LessonPhase.Idle;
  const isFinished = state.phase === LessonPhase.Finished;
  const isPaused = state.phase === LessonPhase.Paused;
  const isResponding =
    state.phase === LessonPhase.Responding ||
    (isPaused && state.resumePhase === LessonPhase.Responding);
  const showActiveScene = !isIdle && !isFinished;
  const showPlaybackControls =
    state.phase === LessonPhase.Speaking ||
    state.phase === LessonPhase.Responding ||
    isPaused;
  const atFirstScene = state.sceneIndex === 0;
  const atFinalScene = state.sceneIndex === currentLesson.scenes.length - 1;
  const speechCharacterIndex = scene.characters.findIndex(
    (character) => character.id === scene.speech.speaker
  );
  const fullScene = variant?.scenes[state.sceneIndex];
  if (variant && !fullScene) {
    throw new Error(
      `Lesson variant ${variant.id} is missing scene ${state.sceneIndex + 1}.`,
    );
  }

  return (
    <LessonStage
      background={scene.backgroundAsset}
      presentation={fullScene ? "boxed" : "layered"}
    >
      {fullScene ? (
        <BoxedFullSceneStage
          framePreset={fullScene.frame.preset}
          image={fullScene.image}
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

      {isIdle ? (
        <LessonIntroduction
          lessonTitle={currentLesson.title}
          onStart={handleStartAction}
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
        <>
          <LessonHud
            currentScene={state.sceneIndex + 1}
            sceneCount={currentLesson.scenes.length}
            title={scene.title}
          />
          {fullScene ? null : (
            <LessonCharacters characters={scene.characters} />
          )}

          {showUserTurn ? (
            <LessonUserPrompt dialogue={currentStep.dialogue} />
          ) : isResponding ? (
            <LessonFeedback
              outcome={state.responseOutcome}
              speech={scene.speech}
            />
          ) : (
            <LessonSpeech
              characterCount={scene.characters.length}
              characterIndex={speechCharacterIndex}
              showTail={!fullScene}
              speech={scene.speech}
            />
          )}

          {showUserTurn ? (
            <LessonSpeakingControls
              isEvaluating={isEvaluating}
              isRecording={isRecording}
              onSkip={handleSkipUser}
              onToggleRecording={handleToggleRecording}
            />
          ) : null}
          {showPlaybackControls ? (
            <LessonPlaybackControls
              atFinalScene={atFinalScene}
              atFirstScene={atFirstScene}
              isPaused={isPaused}
              onNext={() => dispatchSceneControl("SCENE_NEXT")}
              onPauseResume={handlePauseResume}
              onPrevious={() => dispatchSceneControl("SCENE_PREVIOUS")}
            />
          ) : null}
          <LessonErrorBanner error={error} />
        </>
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
        {state.transcript ? ` Heard: ${state.transcript}.` : ""}
        {error ? ` ${error}` : ""}
      </div>
    </LessonStage>
  );
}

function LessonRouteDecisionView({
  decision,
  source,
  variant,
}: {
  decision: LessonRouteDecision;
  source: LessonSource;
  variant?: (typeof FULL_SCENE_LESSON_VARIANTS)[number];
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

  return (
    <LessonPlayer
      audioMode={source === "my" ? "device" : "static"}
      key={`${source}:${decision.entry.id}`}
      lesson={decision.entry.lesson}
      onBack={() => navigate("/lessons")}
      onNavigateScene={(sceneIndex) =>
        navigate(
          variant
            ? getParrotLessonVariantScenePath(
                decision.entry.id,
                variant.id,
                sceneIndex,
              )
            : getLessonScenePath(source, decision.entry.id, sceneIndex),
        )
      }
      routedLocationKey={location.key}
      routedSceneIndex={decision.sceneIndex}
      variant={variant}
    />
  );
}

function ParrotLessonRedirect() {
  const { lessonId } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, undefined);
  return <LessonRouteDecisionView decision={decision} source="parrot" />;
}

function ParrotLessonSceneRoute() {
  const { lessonId, sceneNumber } = useParams();
  const decision = resolveParrotLessonRouteDecision(lessonId, sceneNumber);
  return <LessonRouteDecisionView decision={decision} source="parrot" />;
}

function ParrotLessonVariantSceneRoute() {
  const { lessonId, sceneNumber, variantId } = useParams();
  const variant = FULL_SCENE_LESSON_VARIANTS.find(
    (candidate) =>
      candidate.baseLessonId === lessonId && candidate.id === variantId,
  );

  if (!lessonId || !variantId || !variant) {
    return <Navigate replace to="/lessons" />;
  }

  const decision = resolveParrotLessonRouteDecision(lessonId, sceneNumber);
  if (decision.kind === "redirect") {
    return (
      <Navigate
        replace
        to={getParrotLessonVariantScenePath(lessonId, variantId, 0)}
      />
    );
  }

  return (
    <LessonRouteDecisionView
      decision={decision}
      source="parrot"
      variant={variant}
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
  return <LessonRouteDecisionView decision={decision} source="my" />;
}

function StoryRouteDecisionView({
  decision,
}: {
  decision: StoryRouteDecision;
}) {
  const location = useLocation();
  const navigate = useNavigate();

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
      story={decision.story}
      key={`${location.key}:${decision.story.id}:${decision.pageIndex}`}
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

export function ApplicationRoutes({ loginTarget }: { loginTarget: string }) {
  return (
    <Routes>
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
      <Route element={<PixelLessonLab />} path="/games" />
      <Route element={<PixelWorldExplorer />} path="/games/worlds" />
      <Route
        element={<LessonCreator />}
        path="/lessons/my/create"
      />
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
      <Route
        element={<ParrotLessonVariantSceneRoute />}
        path="/lessons/parrot/:lessonId/variants/:variantId/scenes/:sceneNumber"
      />
      <Route
        element={<MyLessonRoute />}
        path="/lessons/my/:lessonId"
      />
      <Route
        element={<MyLessonRoute />}
        path="/lessons/my/:lessonId/scenes/:sceneNumber"
      />
      <Route
        element={<Navigate replace to="/" />}
        path="/progress"
      />
      <Route element={<StoryList />} path="/stories" />
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
  );
}

function RoutedApplication() {
  const location = useLocation();
  const navigate = useNavigate();
  const lessonRouteExitRegistryRef = useRef(
    createLessonRouteExitRegistry(),
  );
  const registerLessonRouteExitBarrier = useCallback(
    (barrier: () => void) =>
      lessonRouteExitRegistryRef.current.register(barrier),
    [],
  );
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
    lessonRouteExitRegistryRef.current.exit();
    navigate(getProfilePath(requestedProtectedTarget));
  }, [navigate, requestedProtectedTarget]);

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
        <LearnerProfileGate
          completedLearnerProfileFallback={
            <Navigate replace to={safeReturnTo} />
          }
          isConversationRoute={isConversationRoute}
          isLearnerProfileRoute={isLearnerProfileRoute}
          isProfileRoute={isProfileRoute}
          learnerProfileFallback={
            <Navigate
              replace
              to={getLearnerProfilePath(requestedProtectedTarget)}
            />
          }
          onCloseProfileRoute={() =>
            navigate(safeReturnTo, { replace: true })
          }
          onConversationCompleted={() => navigate("/", { replace: true })}
          onOpenProfileRoute={openProfileRoute}
          onRedoCompleted={() =>
            navigate(safeReturnTo, { replace: true })
          }
          onRedoLearnerProfileRoute={() =>
            navigate(
              getRedoLearnerProfilePath(getProfilePath(safeReturnTo)),
            )
          }
          redoLearnerProfile={redoLearnerProfile}
        >
          <ApplicationRoutes loginTarget={safeReturnTo} />
        </LearnerProfileGate>
      </AuthGate>
    </LessonRouteExitBarrierContext.Provider>
  );
}

export function App() {
  return <RoutedApplication />;
}
