"use client";

import { ChevronLeft, ChevronRight, Mic } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { getLessonAudioLine } from "../lib/lesson-audio";
import { getLessonProgressLabel } from "../lib/lesson-progress";
import { getLessonScenePresentation } from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  getCurrentStep,
  reduceLessonState,
} from "../lib/lesson-state";
import { isAbortError, playAudioLine } from "./audio-playback";
import {
  createInitialAppNavigation,
  reduceAppNavigation,
  type AppNavigationEvent,
  type AppNavigationState,
} from "./app-navigation";
import {
  getLoginPath,
  getOnboardingPath,
  getSafeReturnTo,
} from "./app-routes";
import { AuthGate } from "./AuthGate";
import { FeaturePlaceholder } from "./FeaturePlaceholder";
import { HomeMenu } from "./HomeMenu";
import { OnboardingGate } from "./OnboardingGate";
import { evaluateSpeech } from "./evaluation-request";
import {
  LESSONS,
  VISUAL_CATALOG,
  type Lesson,
} from "./lesson-catalog";
import { LessonList } from "./LessonList";
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
  | { type: "LINE_DONE" }
  | { type: "MIC_STARTED" }
  | { type: "MIC_RELEASED" }
  | { type: "RECORDING_CANCELLED" }
  | { type: "EVALUATED"; passed: boolean; transcript: string }
  | { type: "EVALUATION_FAILED" }
  | { type: "FEEDBACK_DONE" }
  | { type: "RESET" };

type CharacterStyle = CSSProperties & {
  "--character-count": number;
  "--character-index": number;
};

type LessonPlayerProps = {
  lesson: Lesson;
  onBack: () => void;
};

const AVAILABLE_LESSON_IDS = new Set(LESSONS.map((entry) => entry.id));

function appNavigationReducer(
  state: AppNavigationState,
  event: AppNavigationEvent,
) {
  return reduceAppNavigation(state, event, AVAILABLE_LESSON_IDS);
}

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

export function LessonPlayer({ lesson: currentLesson, onBack }: LessonPlayerProps) {
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) => reduceLessonState(currentState, event, currentLesson),
    createInitialLessonState()
  );
  const [error, setError] = useState("");
  const playbackControllerRef = useRef<AbortController | null>(null);
  const playbackGenerationRef = useRef(0);
  const recordingRef = useRef<SpeechRecordingSession | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const evaluationControllerRef = useRef<AbortController | null>(null);
  const pressSequenceRef = useRef(0);
  const pressedRef = useRef(false);

  const currentStep = getCurrentStep(state, currentLesson);
  if (!currentStep) throw new Error("The lesson position is invalid.");
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentLesson, VISUAL_CATALOG),
    [currentLesson, state]
  );
  const progressLabel = getLessonProgressLabel(state, currentStep);

  useEffect(() => {
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
    const playbackOperation = createPlaybackOperation({
      generation,
      getCurrentGeneration: () => playbackGenerationRef.current,
      onCompleted: () => dispatch(completionEvent),
      onFailed: (caughtError) => {
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
    state.feedback,
    state.phase,
    state.sceneIndex,
    state.stepIndex,
  ]);

  useEffect(
    () => () => {
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

  function cancelPendingWork() {
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
  }

  function dispatchSceneControl(
    type:
      | "PLAY_SCENE"
      | "PAUSE_SCENE"
      | "SCENE_PREVIOUS"
      | "SCENE_NEXT"
      | "REPLAY_LESSON"
  ) {
    cancelPendingWork();
    setError("");
    dispatch({ type });
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
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    setError("");

    try {
      const session = await startSpeechRecording({ signal: controller.signal });
      if (!pressedRef.current || pressSequenceRef.current !== sequence) {
        session.cancel();
        return;
      }
      recordingRef.current = session;
      dispatch({ type: "MIC_STARTED" });
    } catch (caughtError) {
      if (isAbortError(caughtError)) return;
      pressedRef.current = false;
      setError(getMicrophoneErrorMessage(caughtError));
    }
  }

  async function finishRecording() {
    if (!pressedRef.current) return;
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
      onEvaluated: (result) =>
        dispatch({
          type: "EVALUATED",
          passed: result.passed,
          transcript: result.transcript,
        }),
      onFailed: (caughtError) => {
        setError(
          caughtError instanceof Error && caughtError.message.includes("GROQ_API_KEY")
            ? "Speech checking is not configured."
            : `Speech check failed: ${
                caughtError instanceof Error ? caughtError.message : "Unknown error."
              }`
        );
        dispatch({ type: "EVALUATION_FAILED" });
      },
      onReleased: () => dispatch({ type: "MIC_RELEASED" }),
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
    <main className="lesson-shell">
      <section
        aria-label="Parrot English speaking lesson"
        className="lesson-stage"
      >
        <img
          src={scene.backgroundAsset.src}
          alt={scene.backgroundAsset.alt}
          className="scene-background"
          draggable="false"
        />

        <header className="scene-hud">
          <div className="scene-title-card">
            <span className="scene-number">{state.sceneIndex + 1}</span>
            <span className="scene-title">{scene.title}</span>
          </div>
          <div className="scene-progress" aria-label="Scene progress">
            {Array.from({ length: currentLesson.scenes.length }, (_, index) => (
              <span
                className={index <= state.sceneIndex ? "is-complete" : ""}
                key={index}
              />
            ))}
          </div>
        </header>

        <button
          aria-label="Back to lesson list"
          className="lesson-list-back-button"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" strokeWidth={3.2} />
          <span>Back to lessons</span>
        </button>

        <span
          aria-label={`Build version ${versionLabel}`}
          className="build-version-badge"
        >
          {versionLabel}
        </span>

        {showStartAction ? (
          <div className="lesson-start-layer">
            <button
              aria-label={startActionLabel}
              className="start-lesson-button"
              onClick={handleStartAction}
              type="button"
            >
              <span>{startActionLabel}</span>
            </button>
          </div>
        ) : null}

        <div className="character-layer">
          {scene.characters.map((character, index) => (
            <div
              className={`character-sprite ${
                character.isActive ? "is-active" : ""
              }`}
              data-character={character.id}
              data-emote={character.emote}
              key={character.id}
              style={
                {
                  "--character-count": scene.characters.length,
                  "--character-index": index,
                } as CharacterStyle
              }
            >
              <img
                src={character.asset.src}
                alt={character.asset.alt}
                draggable="false"
              />
              <span className="character-name">{character.name}</span>
            </div>
          ))}
        </div>

        {scene.speech.kind === "user" ? null : scene.speech.kind === "narration" ||
          scene.speech.kind === "feedback" ||
          scene.speech.kind === "finished" ? (
          <div
            aria-live="polite"
            className={`narrator-caption is-${scene.speech.kind}`}
            role="status"
          >
            <span>Narrator</span>
            <p>{scene.speech.text}</p>
          </div>
        ) : (
          <div
            aria-live="polite"
            className={`speech-bubble is-${scene.speech.kind}`}
            data-speaker={scene.speech.speaker}
            role="status"
            style={
              {
                "--character-count": scene.characters.length,
                "--character-index": Math.max(0, speechCharacterIndex),
              } as CharacterStyle
            }
          >
            <span>{scene.speech.speaker}</span>
            <p>{scene.speech.text}</p>
          </div>
        )}

        <nav aria-label="Lesson controls" className="scene-controls">
          <button
            aria-label="Previous scene"
            className="scene-control-button"
            disabled={atFirstScene}
            onClick={() => dispatchSceneControl("SCENE_PREVIOUS")}
            type="button"
          >
            <ChevronLeft aria-hidden="true" strokeWidth={3.2} />
          </button>

          {showUserTurn ? (
            <>
              <strong
                aria-live="assertive"
                className="learner-target-pill"
                role="status"
              >
                {currentStep.dialogue}
              </strong>
              {isEvaluating ? (
                <span
                  aria-live="assertive"
                  className="checking-label"
                  role="status"
                >
                  Checking your speech...
                </span>
              ) : (
                <button
                  aria-label={
                    isRecording
                      ? "Release when you finish"
                      : "Press and hold to speak"
                  }
                  className={`hold-to-talk-button ${
                    isRecording ? "is-recording" : ""
                  }`}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  onPointerCancel={cancelRecording}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  type="button"
                >
                  <Mic aria-hidden="true" strokeWidth={3.6} />
                  <span>
                    {isRecording
                      ? "Release when you finish"
                      : "Press and hold to speak"}
                  </span>
                </button>
              )}
            </>
          ) : (
            <span className="dock-status">{progressLabel}</span>
          )}

          <button
            aria-label="Next scene"
            className="scene-control-button"
            disabled={atFinalScene}
            onClick={() => dispatchSceneControl("SCENE_NEXT")}
            type="button"
          >
            <ChevronRight aria-hidden="true" strokeWidth={3.2} />
          </button>
        </nav>

        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Scene {state.sceneIndex + 1} of{" "}
          {currentLesson.scenes.length}. {scene.settingDescription}
          {state.transcript ? ` Heard: ${state.transcript}.` : ""}
          {error ? ` ${error}` : ""}
        </div>
      </section>
    </main>
  );
}

export function LessonExperienceView({
  dispatchNavigation,
  navigation,
}: {
  dispatchNavigation: (event: AppNavigationEvent) => void;
  navigation: AppNavigationState;
}) {
  const selectedEntry = LESSONS.find(
    (entry) => entry.id === navigation.activeLessonId,
  );

  if (!selectedEntry) {
    return (
      <LessonList
        onOpenLesson={(lessonId) =>
          dispatchNavigation({ type: "OPEN_LESSON", lessonId })
        }
      />
    );
  }

  return (
    <LessonPlayer
      key={selectedEntry.id}
      lesson={selectedEntry.lesson}
      onBack={() => dispatchNavigation({ type: "BACK_TO_LIST" })}
    />
  );
}

export function LessonExperience() {
  const [navigation, dispatchNavigation] = useReducer(
    appNavigationReducer,
    undefined,
    createInitialAppNavigation,
  );

  return (
    <LessonExperienceView
      dispatchNavigation={dispatchNavigation}
      navigation={navigation}
    />
  );
}

export function ApplicationRoutes({ loginTarget }: { loginTarget: string }) {
  return (
    <Routes>
      <Route element={<HomeMenu />} path="/" />
      <Route element={<LessonExperience />} path="/lessons" />
      <Route
        element={
          <FeaturePlaceholder
            description="Lesson creation is coming soon. You will be able to build practice around your own interests."
            eyebrow="LEARN YOUR WAY"
            title="Create a Lesson"
          />
        }
        path="/lessons/my/create"
      />
      <Route
        element={
          <FeaturePlaceholder
            description="Progress tracking is coming soon."
            eyebrow="KEEP GROWING"
            title="Progress"
          />
        }
        path="/progress"
      />
      <Route
        element={
          <FeaturePlaceholder
            description="Storytelling practice is coming soon."
            eyebrow="TELL A STORY"
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
  const currentTarget = `${location.pathname}${location.search}${location.hash}`;
  const onLoginRoute = location.pathname === "/login";
  const isOnboardingRoute = location.pathname === "/onboarding";
  const isProfileRoute = location.pathname === "/profile";
  const safeReturnTo = getSafeReturnTo(location.search) ?? "/";
  const requestedProtectedTarget =
    onLoginRoute || isOnboardingRoute ? safeReturnTo : currentTarget;

  return (
    <AuthGate
      signedOutFallback={
        onLoginRoute ? null : (
          <Navigate replace to={getLoginPath(currentTarget)} />
        )
      }
    >
      <OnboardingGate
        completedOnboardingFallback={
          <Navigate replace to={safeReturnTo} />
        }
        isOnboardingRoute={isOnboardingRoute}
        isProfileRoute={isProfileRoute}
        onboardingFallback={
          <Navigate
            replace
            to={getOnboardingPath(requestedProtectedTarget)}
          />
        }
        onCloseProfileRoute={() => navigate("/")}
        onOpenProfileRoute={() => navigate("/profile")}
      >
        <ApplicationRoutes loginTarget={safeReturnTo} />
      </OnboardingGate>
    </AuthGate>
  );
}

export function App() {
  return <RoutedApplication />;
}
