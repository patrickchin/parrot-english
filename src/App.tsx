"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  List,
  Lock,
  Mic,
  Pause,
  Play,
  PlayCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio";
import { getLessonPrimaryControl } from "../lib/lesson-controls";
import {
  LESSONS,
  getDefaultLesson,
  getLessonById,
  isLessonPlayable,
} from "../lib/lesson-data";
import { getLessonProgressLabel } from "../lib/lesson-progress";
import {
  LESSON_SCENE_ASSETS,
  getLessonScenePresentation,
} from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  recordSpeechClip,
} from "./speech-recorder";
import {
  isAbortError,
  playAudioSequence,
  type AssetAudioLine,
} from "./audio-playback";
import {
  evaluateSpeech,
  type EvaluationResult,
} from "./evaluation-request";

const RECORDING_UNSUPPORTED_MESSAGE =
  "这个浏览器不支持录音，请使用最新版 Chrome 或 Safari。";
const MICROPHONE_ACCESS_MESSAGE =
  "无法打开麦克风。请允许浏览器使用麦克风后再试一次。";
const MISSING_AUDIO_BLOB_MESSAGE = "录音没有准备好，请再试一次。";

type AppScreen = "lesson-list" | "lesson-player";
type Lesson = (typeof LESSONS)[number];

type LessonEvent =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "EXAMPLE_DONE" }
  | { type: "COACH_DONE" }
  | { type: "RECORDING_DONE"; audioBlob: Blob }
  | ({ type: "EVALUATED" } & EvaluationResult)
  | { type: "SYSTEM_ERROR"; feedbackText: string }
  | { type: "NEXT" }
  | { type: "RETRY" }
  | { type: "RESET" }
  | { type: "SCENE_NEXT" }
  | { type: "SCENE_PREVIOUS" };

function renderSpeechText(text: string) {
  const highlight = "Polly!";
  if (!text.includes(highlight)) return text;

  const [before, after] = text.split(highlight);
  return (
    <>
      {before}
      <span className="speech-highlight">{highlight}</span>
      {after}
    </>
  );
}

function shouldOpenLessonPlayerDirectly() {
  if (typeof window === "undefined") return false;

  return (
    import.meta.env.VITE_PARROT_E2E === "1" &&
    window.location.search.includes("parrotE2eAutostart=1")
  );
}

function LessonListPage({
  lessons,
  onStartLesson,
}: {
  lessons: Lesson[];
  onStartLesson: (lessonId: string) => void;
}) {
  return (
    <main className="lesson-list-shell">
      <img
        alt=""
        className="lesson-list-background"
        draggable="false"
        src="/assets/backgrounds/meadow-day.webp"
      />

      <section
        aria-labelledby="lesson-list-title"
        className="lesson-list-content"
      >
        <div className="lesson-list-header">
          <span className="lesson-list-kicker">
            <BookOpen aria-hidden="true" strokeWidth={2.5} />
            Parrot English
          </span>
          <h1 id="lesson-list-title">Choose a lesson</h1>
          <p>选择一节课，和多莉一起开口说英语。</p>
        </div>

        <div className="lesson-list-grid">
          {lessons.map((lesson, index) => (
            <button
              aria-disabled={!isLessonPlayable(lesson)}
              className={`lesson-list-card is-${lesson.status}`}
              disabled={!isLessonPlayable(lesson)}
              key={lesson.id}
              onClick={
                isLessonPlayable(lesson)
                  ? () => onStartLesson(lesson.id)
                  : undefined
              }
              type="button"
            >
              <span className="lesson-card-index">{index + 1}</span>
              <span className="lesson-card-copy">
                <span className="lesson-card-title">{lesson.title}</span>
                <span className="lesson-card-subtitle">{lesson.subtitle}</span>
                <span className="lesson-card-description">
                  {lesson.description}
                </span>
              </span>
              <span className="lesson-card-status">
                {isLessonPlayable(lesson) ? (
                  <PlayCircle aria-hidden="true" strokeWidth={2.7} />
                ) : (
                  <Lock aria-hidden="true" strokeWidth={2.7} />
                )}
                <span>{lesson.statusLabel}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <img
        alt=""
        className="lesson-list-mascot"
        draggable="false"
        src={LESSON_SCENE_ASSETS.polly.idle.src}
      />
      <img
        alt=""
        className="lesson-list-host"
        draggable="false"
        src={LESSON_SCENE_ASSETS.peppa.wave.src}
      />
    </main>
  );
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>(() =>
    shouldOpenLessonPlayerDirectly() ? "lesson-player" : "lesson-list"
  );
  const [selectedLessonId, setSelectedLessonId] = useState(
    () => getDefaultLesson().id
  );
  const selectedLesson = getLessonById(selectedLessonId) ?? getDefaultLesson();

  function handleStartLesson(lessonId: string) {
    const lesson = getLessonById(lessonId);
    if (!lesson || !isLessonPlayable(lesson)) return;

    setSelectedLessonId(lesson.id);
    setScreen("lesson-player");
  }

  if (screen === "lesson-player") {
    return (
      <LessonPlayer
        key={selectedLesson.id}
        lesson={selectedLesson}
        onBackToList={() => setScreen("lesson-list")}
      />
    );
  }

  return <LessonListPage lessons={LESSONS} onStartLesson={handleStartLesson} />;
}

type LessonPlayerProps = {
  lesson?: Lesson;
  onBackToList?: () => void;
};

export function LessonPlayer({
  lesson = getDefaultLesson(),
  onBackToList,
}: LessonPlayerProps = {}) {
  const didE2eAutostart = useRef(false);
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) =>
      reduceLessonState(currentState, event, lesson.steps.length),
    undefined,
    createInitialLessonState
  );
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const currentStep = lesson.steps[state.stepIndex] ?? lesson.steps[0];
  if (!currentStep) {
    throw new Error(`Lesson has no steps: ${lesson.id}`);
  }
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentStep),
    [currentStep, state]
  );

  const progressLabel = useMemo(() => getLessonProgressLabel(state), [state]);
  const primaryControl = useMemo(() => getLessonPrimaryControl(state), [state]);

  useEffect(() => {
    if (didE2eAutostart.current) return;
    if (import.meta.env.VITE_PARROT_E2E !== "1") return;
    if (!window.location.search.includes("parrotE2eAutostart=1")) return;

    didE2eAutostart.current = true;
    dispatch({ type: "START" });
  }, []);

  useEffect(() => {
    const audioSequence = getLessonAudioSequence(
      state,
      currentStep
    ) as AssetAudioLine[];
    if (audioSequence.length === 0) return;
    const completionEvent = getLessonAudioCompletionEvent(state) as LessonEvent | null;

    if (muted) {
      const timeout = window.setTimeout(() => {
        if (completionEvent) dispatch(completionEvent);
      }, Math.max(700, audioSequence.length * 800));

      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const controller = new AbortController();

    async function playLessonSequence() {
      setError("");
      try {
        await playAudioSequence({
          lines: audioSequence,
          signal: controller.signal,
        });

        if (!cancelled && completionEvent) {
          dispatch(completionEvent);
        }
      } catch (caughtError) {
        if (!cancelled && !isAbortError(caughtError)) {
          const message =
            caughtError instanceof Error ? caughtError.message : "Audio failed.";
          const feedbackText = `声音暂时不可用：${message}`;
          dispatch({ type: "SYSTEM_ERROR", feedbackText });
          setError(feedbackText);
        }
      }
    }

    void playLessonSequence();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    currentStep,
    muted,
    state.feedback,
    state.lastOutcome,
    state.phase,
    state.retryCount,
    state.stepIndex,
  ]);

  useEffect(() => {
    if (state.phase !== LessonPhase.Listening) return;

    let cancelled = false;
    const controller = new AbortController();

    async function recordAndEvaluate() {
      setError("");
      try {
        const audioBlob = await recordSpeechClip({ signal: controller.signal });
        if (cancelled) return;

        dispatch({ type: "RECORDING_DONE", audioBlob });
      } catch (caughtError) {
        if (cancelled) return;

        if (caughtError instanceof RecordingUnsupportedError) {
          dispatch({
            type: "SYSTEM_ERROR",
            feedbackText: RECORDING_UNSUPPORTED_MESSAGE,
          });
          setError(RECORDING_UNSUPPORTED_MESSAGE);
          return;
        }

        if (caughtError instanceof MicrophoneAccessError) {
          dispatch({
            type: "SYSTEM_ERROR",
            feedbackText: MICROPHONE_ACCESS_MESSAGE,
          });
          setError(MICROPHONE_ACCESS_MESSAGE);
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : "Recording failed.";
        const feedbackText = `录音时出错：${message}`;
        dispatch({ type: "SYSTEM_ERROR", feedbackText });
        setError(feedbackText);
      }
    }

    void recordAndEvaluate();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentStep.childTarget, state.phase]);

  useEffect(() => {
    if (state.phase !== LessonPhase.Evaluating) return;

    if (!state.pendingAudioBlob) {
      dispatch({
        type: "SYSTEM_ERROR",
        feedbackText: MISSING_AUDIO_BLOB_MESSAGE,
      });
      setError(MISSING_AUDIO_BLOB_MESSAGE);
      return;
    }

    const audioBlob = state.pendingAudioBlob;
    let cancelled = false;
    const controller = new AbortController();

    async function evaluateChildSpeech() {
      try {
        const result = await evaluateSpeech({
          audio: audioBlob,
          signal: controller.signal,
          targetText: currentStep.childTarget,
        });

        if (!cancelled) {
          dispatch({ type: "EVALUATED", ...result });
        }
      } catch (caughtError) {
        if (cancelled) return;

        const message =
          caughtError instanceof Error ? caughtError.message : "Evaluation failed.";
        const feedbackText =
          message.includes("GROQ_API_KEY")
            ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能听写和判断孩子的发音。"
            : `判断语音时出错：${message}`;
        dispatch({ type: "SYSTEM_ERROR", feedbackText });
        setError(feedbackText);
      }
    }

    void evaluateChildSpeech();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentStep.childTarget, state.pendingAudioBlob, state.phase]);

  function handlePrimaryAction() {
    setError("");

    switch (primaryControl.action) {
      case "pause":
        dispatch({ type: "PAUSE" });
        return;
      case "retry":
        dispatch({ type: "RETRY" });
        return;
      case "start":
      case "play":
      case "restart":
        dispatch({ type: "START" });
        return;
      default:
        return;
    }
  }

  function navigateScene(type: "SCENE_NEXT" | "SCENE_PREVIOUS") {
    setError("");
    if (
      type === "SCENE_NEXT" &&
      state.phase === LessonPhase.Feedback &&
      state.lastOutcome === "advance"
    ) {
      dispatch({ type: "NEXT" });
      return;
    }

    dispatch({ type });
  }

  const sceneNumber = state.stepIndex + 1;
  const showStartButton = ["restart", "retry", "start"].includes(
    primaryControl.kind
  );
  const showPlaybackToggle = ["pause", "play"].includes(primaryControl.kind);
  const showPrimaryControl = showStartButton || showPlaybackToggle;
  const showMicPrompt =
    state.phase === LessonPhase.Listening || state.phase === LessonPhase.Evaluating;
  const isListening = state.phase === LessonPhase.Listening;
  const micPanelTitle = isListening ? "轮到你说" : "我听到了";
  const micPanelInstruction = isListening ? "麦克风正在听，请说：" : "正在检查发音";
  const micPanelAriaLabel = isListening
    ? `轮到你说。麦克风正在听。Target phrase: ${currentStep.childTarget}.`
    : `我听到了。正在检查发音。Target phrase: ${currentStep.childTarget}.`;

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

        <div className="scene-hud scene-title-card" aria-label="Current scene">
          <span className="scene-number">{sceneNumber}</span>
          <span className="scene-title">
            {currentStep.sceneTitleZh}（{currentStep.durationHintSeconds}秒）
          </span>
          <div className="scene-progress" aria-hidden="true">
            {Array.from({ length: lesson.steps.length }, (_, index) => (
              <span
                className={index <= state.stepIndex ? "is-complete" : ""}
                key={index}
              />
            ))}
          </div>
        </div>

        <button
          aria-label={muted ? "Unmute lesson audio" : "Mute lesson audio"}
          aria-pressed={muted}
          className={`volume-button ${muted ? "is-muted" : ""}`}
          onClick={() => setMuted((value) => !value)}
          type="button"
        >
          {muted ? (
            <VolumeX aria-hidden="true" strokeWidth={2.7} />
          ) : (
            <Volume2 aria-hidden="true" strokeWidth={2.7} />
          )}
        </button>

        {onBackToList ? (
          <button
            aria-label="Back to lesson list"
            className="lesson-list-button"
            onClick={onBackToList}
            type="button"
          >
            <List aria-hidden="true" strokeWidth={3} />
          </button>
        ) : null}

        <div className={`lesson-flow-banner ${showPrimaryControl ? "has-action" : ""}`}>
          {showPrimaryControl ? (
            <button
              aria-label={primaryControl.ariaLabel}
              className={
                showPlaybackToggle
                  ? `playback-toggle-button ${
                      primaryControl.kind === "pause" ? "is-playing" : ""
                    }`
                  : "start-lesson-button"
              }
              onClick={handlePrimaryAction}
              type="button"
            >
              {showPlaybackToggle ? (
                <>
                  {primaryControl.kind === "pause" ? (
                    <Pause aria-hidden="true" strokeWidth={3} />
                  ) : (
                    <Play aria-hidden="true" strokeWidth={3} />
                  )}
                  <span>{primaryControl.label}</span>
                </>
              ) : (
                primaryControl.label
              )}
            </button>
          ) : (
            <span className="flow-status">{progressLabel}</span>
          )}
        </div>

        {showMicPrompt ? (
          <div
            aria-label={micPanelAriaLabel}
            aria-live="assertive"
            className={`speak-now-panel ${
              isListening ? "is-listening" : "is-evaluating"
            }`}
            role="status"
          >
            <span className="mic-symbol" aria-hidden="true">
              <Mic strokeWidth={2.6} />
            </span>
            <span className="mic-panel-title">{micPanelTitle}</span>
            <span className="mic-panel-instruction">{micPanelInstruction}</span>
            <strong className="mic-target-phrase">{currentStep.childTarget}</strong>
            <span className="mic-waveform" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} />
              ))}
            </span>
            <span className="recording-progress" aria-hidden="true">
              <span />
            </span>
          </div>
        ) : null}

        <div
          className={`character-sprite peppa-character ${
            scene.activeSpeaker === "peppa" ? "is-active" : ""
          }`}
        >
          <img
            src={scene.peppaAsset.src}
            alt={scene.peppaAsset.alt}
            draggable="false"
          />
        </div>

        <div
          className={`character-sprite polly-character ${
            scene.activeSpeaker === "polly" ? "is-active" : ""
          }`}
        >
          <img
            src={scene.pollyAsset.src}
            alt={scene.pollyAsset.alt}
            draggable="false"
          />
        </div>

        <div
          aria-live="polite"
          className={`speech-bubble peppa-bubble bubble-${scene.peppaBubble.tone} ${
            scene.peppaBubble.isActive ? "is-active" : ""
          }`}
          role="status"
        >
          <p>{renderSpeechText(scene.peppaBubble.text)}</p>
        </div>

        <div
          aria-live="polite"
          className={`speech-bubble polly-bubble bubble-${scene.pollyBubble.tone} ${
            scene.pollyBubble.isActive ? "is-active" : ""
          } ${error ? "has-error" : ""}`}
          role="status"
        >
          <p>{error || renderSpeechText(scene.pollyBubble.text)}</p>
        </div>

        <button
          aria-label="Previous scene"
          className="scene-nav-button scene-back-button"
          onClick={() => navigateScene("SCENE_PREVIOUS")}
          type="button"
        >
          <ChevronLeft aria-hidden="true" strokeWidth={3} />
        </button>

        <button
          aria-label="Next scene"
          className="scene-nav-button scene-next-button"
          onClick={() => navigateScene("SCENE_NEXT")}
          type="button"
        >
          <ChevronRight aria-hidden="true" strokeWidth={3} />
        </button>

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Target phrase: {currentStep.childTarget}.
          Scene {sceneNumber} of {lesson.steps.length}. {scene.statusText}.
          {state.transcript ? ` Heard: ${state.transcript}.` : ""}
          {error ? ` ${error}` : ""}
        </div>
      </section>
    </main>
  );
}
