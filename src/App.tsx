"use client";

import { ChevronLeft, House } from "lucide-react";
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
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { getLessonAudioLine } from "../lib/lesson-audio";
import { getLessonProgressLabel } from "../lib/lesson-progress";
import {
  createLessonRouteActivityGuard,
  createLessonRouteExitRegistry,
  exitLessonRouteActivity,
  invalidateLessonRouteActivity,
} from "../lib/lesson-route-activity";
import {
  consumeLessonHistoryPopToken,
  createLessonHistoryPopToken,
  getLessonEventTargetSceneIndex,
  getLessonRouteReconciliationEvent,
} from "../lib/lesson-route-transition";
import { getLessonScenePresentation } from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  getCurrentStep,
  reduceLessonState,
} from "../lib/lesson-state";
import { isAbortError, playAudioLine } from "./audio-playback";
import {
  getGateRouteKind,
  getLessonScenePath,
  getLoginPath,
  getOnboardingPath,
  getRedoOnboardingPath,
  getRequestedProtectedTarget,
  getSafeReturnTo,
  isRedoOnboardingRequest,
  isTalkToPeppaRoute,
  resolveMyLessonRouteDecision,
  resolveParrotLessonRouteDecision,
  type LessonRouteDecision,
  type LessonSource,
} from "./app-routes";
import { AuthGate } from "./AuthGate";
import { HeaderButton, RouteHeader } from "./AppHeader";
import { FeaturePlaceholder } from "./FeaturePlaceholder";
import { HomeMenu } from "./HomeMenu";
import { OnboardingGate } from "./OnboardingGate";
import { evaluateSpeech } from "./evaluation-request";
import { VISUAL_CATALOG, type Lesson } from "./lesson-catalog";
import { LessonList } from "./LessonList";
import {
  LessonCharacters,
  LessonControls,
  LessonErrorBanner,
  LessonHud,
  LessonSpeech,
  LessonStage,
  LessonStartAction,
} from "./LessonPlayerUi";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "./speech-recorder";
import { createPlaybackOperation } from "./playback-operation";
import { finishSpeechOperation } from "./speech-operation";

const RECORDING_UNSUPPORTED_MESSAGE =
  "This browser does not support audio recording. Try the latest Chrome or Safari.";
const MICROPHONE_ACCESS_MESSAGE =
  "Please allow microphone access, then press and hold the button again.";

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
  | { type: "RECORDING_CANCELLED" }
  | { type: "EVALUATED"; passed: boolean; transcript: string }
  | { type: "EVALUATION_FAILED" }
  | { type: "FEEDBACK_DONE" }
  | { type: "RESET" };

type LessonPlayerProps = {
  lesson: Lesson;
  onBack: () => void;
  onHome: () => void;
  onNavigateScene: (sceneIndex: number) => void;
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
  return caughtError instanceof Error
    ? caughtError.message
    : "The microphone could not start.";
}

function isActivationKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
  return event.key === " " || event.key === "Enter";
}

export function LessonPlayer({
  lesson: currentLesson,
  onBack,
  onHome,
  onNavigateScene,
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
  const [error, setError] = useState("");
  const [historyPopSequence, setHistoryPopSequence] = useState(0);
  const playbackControllerRef = useRef<AbortController | null>(null);
  const playbackGenerationRef = useRef(0);
  const recordingRef = useRef<SpeechRecordingSession | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const evaluationControllerRef = useRef<AbortController | null>(null);
  const pressSequenceRef = useRef(0);
  const pressedRef = useRef(false);
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

  const cancelPendingWork = useCallback(() => {
    pressedRef.current = false;
    pressSequenceRef.current += 1;
    playbackGenerationRef.current += 1;
    playbackControllerRef.current?.abort();
    playbackControllerRef.current = null;
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

  const handleHome = useCallback(() => {
    exitRouteActivity();
    onHome();
  }, [exitRouteActivity, onHome]);

  const dispatchLessonEvent = useCallback(
    (event: LessonEvent, { cancel = false }: { cancel?: boolean } = {}) => {
      const targetSceneIndex = getLessonEventTargetSceneIndex(
        state,
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
      state,
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
      state.phase === LessonPhase.Idle
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
  const progressLabel = getLessonProgressLabel(state, currentStep);

  useEffect(() => {
    if (state.sceneIndex !== routedSceneRef.current) return;
    if (
      state.phase !== LessonPhase.Speaking &&
      state.phase !== LessonPhase.Feedback
    ) {
      return;
    }

    const completionEvent: LessonEvent =
      state.phase === LessonPhase.Feedback
        ? { type: "FEEDBACK_DONE" }
        : { type: "LINE_DONE" };
    let audioLine;
    try {
      audioLine = getLessonAudioLine(state, currentLesson);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Audio is unavailable.";
      setError(`Audio unavailable: ${message}`);
      return;
    }
    if (!audioLine) return;

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
    void playAudioLine({ ...audioLine, signal: controller.signal })
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
      }
    };
  }, [
    currentLesson,
    dispatchLessonEvent,
    routedSceneIndex,
    state.feedback,
    state.phase,
    state.sceneIndex,
    state.stepIndex,
  ]);

  useEffect(
    () => () => {
      routeActivityGuardRef.current.invalidate();
      pressedRef.current = false;
      pressSequenceRef.current += 1;
      playbackGenerationRef.current += 1;
      playbackControllerRef.current?.abort();
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

  async function beginRecording() {
    if (
      state.phase !== LessonPhase.WaitingForUser ||
      pressedRef.current ||
      recordingRef.current
    ) {
      return;
    }

    pressedRef.current = true;
    const sequence = pressSequenceRef.current + 1;
    pressSequenceRef.current = sequence;
    const routeGeneration = routeActivityGuardRef.current.capture();
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    setError("");

    try {
      const session = await startSpeechRecording({ signal: controller.signal });
      if (
        !routeActivityGuardRef.current.isCurrent(routeGeneration) ||
        !pressedRef.current ||
        pressSequenceRef.current !== sequence
      ) {
        session.cancel();
        return;
      }
      recordingRef.current = session;
      dispatch({ type: "MIC_STARTED" });
    } catch (caughtError) {
      if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
      if (isAbortError(caughtError)) return;
      pressedRef.current = false;
      setError(getMicrophoneErrorMessage(caughtError));
    }
  }

  async function finishRecording() {
    if (!pressedRef.current) return;
    const routeGeneration = routeActivityGuardRef.current.capture();
    pressedRef.current = false;
    const generation = pressSequenceRef.current;
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
      evaluate: evaluateSpeech,
      evaluationControllerRef,
      generation,
      getCurrentGeneration: () => pressSequenceRef.current,
      onEvaluated: (result) => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatch({
          type: "EVALUATED",
          passed: result.passed,
          transcript: result.transcript,
        });
      },
      onFailed: (caughtError) => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        setError(
          caughtError instanceof Error && caughtError.message.includes("GROQ_API_KEY")
            ? "Speech checking is not configured."
            : `Speech check failed: ${
                caughtError instanceof Error ? caughtError.message : "Unknown error."
              }`
        );
        dispatch({ type: "EVALUATION_FAILED" });
      },
      onReleased: () => {
        if (!routeActivityGuardRef.current.isCurrent(routeGeneration)) return;
        dispatch({ type: "MIC_RELEASED" });
      },
      recordingController,
      recordingControllerRef,
      session,
      targetText: currentStep.dialogue,
    });
  }

  function cancelRecording() {
    cancelPendingWork();
    if (state.phase === LessonPhase.Recording) {
      dispatch({ type: "RECORDING_CANCELLED" });
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void beginRecording();
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    void finishRecording();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!isActivationKey(event) || event.repeat) return;
    event.preventDefault();
    void beginRecording();
  }

  function handleKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!isActivationKey(event)) return;
    event.preventDefault();
    void finishRecording();
  }

  const isRecording = state.phase === LessonPhase.Recording;
  const isEvaluating = state.phase === LessonPhase.Evaluating;
  const showUserTurn =
    state.phase === LessonPhase.WaitingForUser || isRecording || isEvaluating;
  const showStartAction =
    state.phase === LessonPhase.Idle ||
    state.phase === LessonPhase.Finished;
  const startActionLabel =
    state.phase === LessonPhase.Finished ? "Replay lesson" : "Start lesson";
  const atFirstScene = state.sceneIndex === 0;
  const atFinalScene = state.sceneIndex === currentLesson.scenes.length - 1;
  const speechCharacterIndex = scene.characters.findIndex(
    (character) => character.id === scene.speech.speaker
  );
  const versionLabel = `v${import.meta.env.VITE_PARROT_APP_VERSION} @ ${import.meta.env.VITE_PARROT_COMMIT_SHA}`;

  return (
    <LessonStage background={scene.backgroundAsset}>
        <LessonHud
          currentScene={state.sceneIndex + 1}
          sceneCount={currentLesson.scenes.length}
          title={scene.title}
          versionLabel={versionLabel}
        />

        <RouteHeader>
          <HeaderButton
            aria-label="Back to lesson list"
            icon={<ChevronLeft strokeWidth={3.2} />}
            onClick={handleBack}
            type="button"
          >
            Back to lessons
          </HeaderButton>
          <HeaderButton
            aria-label="Back to main menu"
            icon={<House strokeWidth={3.2} />}
            onClick={handleHome}
            type="button"
            variant="surface"
          >
            Back to main menu
          </HeaderButton>
        </RouteHeader>

        {showStartAction ? (
          <LessonStartAction
            label={startActionLabel}
            onClick={handleStartAction}
            ref={startActionRef}
          />
        ) : null}

        <LessonCharacters characters={scene.characters} />
        <LessonSpeech
          characterCount={scene.characters.length}
          characterIndex={speechCharacterIndex}
          speech={scene.speech}
        />
        <LessonControls
          atFinalScene={atFinalScene}
          atFirstScene={atFirstScene}
          dialogue={currentStep.dialogue}
          isEvaluating={isEvaluating}
          isRecording={isRecording}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onNext={() => dispatchSceneControl("SCENE_NEXT")}
          onPointerCancel={cancelRecording}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPrevious={() => dispatchSceneControl("SCENE_PREVIOUS")}
          progressLabel={progressLabel}
          showUserTurn={showUserTurn}
        />
        <LessonErrorBanner error={error} />

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Scene {state.sceneIndex + 1} of{" "}
          {currentLesson.scenes.length}. {scene.settingDescription}
          {state.transcript ? ` Heard: ${state.transcript}.` : ""}
          {error ? ` ${error}` : ""}
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

  return (
    <LessonPlayer
      key={`${source}:${decision.entry.id}`}
      lesson={decision.entry.lesson}
      onBack={() => navigate("/lessons")}
      onHome={() => navigate("/")}
      onNavigateScene={(sceneIndex) =>
        navigate(getLessonScenePath(source, decision.entry.id, sceneIndex))
      }
      routedLocationKey={location.key}
      routedSceneIndex={decision.sceneIndex}
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

function MyLessonRouteUnavailable() {
  const { lessonId, sceneNumber } = useParams();
  const decision = resolveMyLessonRouteDecision(lessonId, sceneNumber);
  return <LessonRouteDecisionView decision={decision} source="my" />;
}

export function ApplicationRoutes({ loginTarget }: { loginTarget: string }) {
  return (
    <Routes>
      <Route element={<HomeMenu />} path="/" />
      <Route
        element={
          <FeaturePlaceholder
            description="Peppa's voice chat is unavailable right now. Please try again soon."
            title="Talk to Peppa"
          />
        }
        path="/talk-to-peppa"
      />
      <Route element={<LessonList />} path="/lessons" />
      <Route
        element={
          <FeaturePlaceholder
            description="Lesson creation is coming soon. You will be able to build practice around your own interests."
            title="Create a Lesson"
          />
        }
        path="/lessons/my/create"
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
        element={<MyLessonRouteUnavailable />}
        path="/lessons/my/:lessonId"
      />
      <Route
        element={<MyLessonRouteUnavailable />}
        path="/lessons/my/:lessonId/scenes/:sceneNumber"
      />
      <Route
        element={
          <FeaturePlaceholder
            description="Progress tracking is coming soon."
            title="Progress"
          />
        }
        path="/progress"
      />
      <Route
        element={
          <FeaturePlaceholder
            description="Storytelling practice is coming soon."
            title="Storytelling"
          />
        }
        path="/stories"
      />
      <Route element={<Navigate replace to={loginTarget} />} path="/login" />
      <Route element={null} path="/onboarding" />
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
  const openProfileRoute = useCallback(() => {
    lessonRouteExitRegistryRef.current.exit();
    navigate("/profile");
  }, [navigate]);
  const gateRoute = getGateRouteKind(location.pathname);
  const onLoginRoute = gateRoute === "login";
  const isOnboardingRoute = gateRoute === "onboarding";
  const isProfileRoute = gateRoute === "profile";
  const isConversationRoute = isTalkToPeppaRoute(location.pathname);
  const redoOnboarding =
    isOnboardingRoute && isRedoOnboardingRequest(location.search);
  const safeReturnTo = getSafeReturnTo(location.search) ?? "/";
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
        <OnboardingGate
          completedOnboardingFallback={
            <Navigate replace to={safeReturnTo} />
          }
          isConversationRoute={isConversationRoute}
          isOnboardingRoute={isOnboardingRoute}
          isProfileRoute={isProfileRoute}
          onboardingFallback={
            <Navigate
              replace
              to={getOnboardingPath(requestedProtectedTarget)}
            />
          }
          onCloseProfileRoute={() => navigate("/")}
          onConversationCompleted={() => navigate("/", { replace: true })}
          onOpenProfileRoute={openProfileRoute}
          onRedoCompleted={() => navigate("/profile", { replace: true })}
          onRedoOnboardingRoute={() =>
            navigate(getRedoOnboardingPath("/profile"))
          }
          redoOnboarding={redoOnboarding}
        >
          <ApplicationRoutes loginTarget={safeReturnTo} />
        </OnboardingGate>
      </AuthGate>
    </LessonRouteExitBarrierContext.Provider>
  );
}

export function App() {
  return <RoutedApplication />;
}
