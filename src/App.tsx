"use client";

import { ChevronLeft, ChevronRight, Mic, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio";
import { LESSON_STEPS } from "../lib/lesson-data";
import { getLessonProgressLabel } from "../lib/lesson-progress";
import { getLessonScenePresentation } from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  requestMicrophoneAccess,
  recordSpeechClip,
} from "./speech-recorder";
import { isAbortError, playAudioLine, type AssetAudioLine } from "./audio-playback";
import {
  evaluateSpeech,
  type EvaluationResult,
} from "./evaluation-request";

const EVALUATION_FAILED_FEEDBACK = "我没有听清楚，我们慢一点再试一次。";
const RECORDING_UNSUPPORTED_MESSAGE =
  "这个浏览器不支持录音，请使用最新版 Chrome 或 Safari。";
const MICROPHONE_ACCESS_MESSAGE =
  "无法打开麦克风。请允许浏览器使用麦克风后再试一次。";
const SPEECH_NAME_CLASSES = new Map([
  ["Bella", "speech-name-child"],
  ["Peppa", "speech-name-peppa"],
  ["Polly", "speech-name-polly"],
  ["Dolly", "speech-name-polly"],
  ["佩奇", "speech-name-peppa"],
  ["多莉", "speech-name-polly"],
]);
const SPEECH_NAME_PATTERN = /(Bella|Peppa|Polly|Dolly|佩奇|多莉)/g;

type LessonEvent =
  | { type: "START" }
  | { type: "EXAMPLE_DONE" }
  | { type: "COACH_DONE" }
  | { type: "RECORDING_DONE" }
  | ({ type: "EVALUATED" } & EvaluationResult)
  | { type: "EVALUATION_FAILED"; feedbackText: string }
  | { type: "NEXT" }
  | { type: "RETRY" }
  | { type: "RESET" }
  | { type: "SCENE_NEXT" }
  | { type: "SCENE_PREVIOUS" };

function renderSpeechText(text: string) {
  return text.split(SPEECH_NAME_PATTERN).map((part, index) => {
    const nameClass = SPEECH_NAME_CLASSES.get(part);

    if (!nameClass) return part;

    return (
      <span className={`speech-name ${nameClass}`} key={`${part}-${index}`}>
        {part}
      </span>
    );
  });
}

function getMicrophoneSetupErrorMessage(caughtError: unknown) {
  if (caughtError instanceof RecordingUnsupportedError) {
    return RECORDING_UNSUPPORTED_MESSAGE;
  }

  if (caughtError instanceof MicrophoneAccessError) {
    return MICROPHONE_ACCESS_MESSAGE;
  }

  return "";
}

export function LessonPlayer() {
  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) =>
      reduceLessonState(currentState, event, LESSON_STEPS.length),
    undefined,
    createInitialLessonState
  );
  const [error, setError] = useState("");
  const [isPreparingMicrophone, setIsPreparingMicrophone] = useState(false);
  const [muted, setMuted] = useState(false);
  const currentStep = LESSON_STEPS[state.stepIndex];
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentStep),
    [currentStep, state]
  );

  const progressLabel = useMemo(() => getLessonProgressLabel(state), [state]);

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
        for (const line of audioSequence) {
          await playAudioLine({
            ...line,
            signal: controller.signal,
          });
        }

        if (!cancelled && completionEvent) {
          dispatch(completionEvent);
        }
      } catch (caughtError) {
        if (!cancelled && !isAbortError(caughtError)) {
          const message =
            caughtError instanceof Error ? caughtError.message : "Audio failed.";
          setError(`声音暂时不可用：${message}`);
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

        dispatch({ type: "RECORDING_DONE" });

        const result = await evaluateSpeech({
          audio: audioBlob,
          signal: controller.signal,
          targetText: currentStep.childTarget,
        });

        if (!cancelled) dispatch({ type: "EVALUATED", ...result });
      } catch (caughtError) {
        if (cancelled) return;

        if (caughtError instanceof RecordingUnsupportedError) {
          setError(RECORDING_UNSUPPORTED_MESSAGE);
          return;
        }

        if (caughtError instanceof MicrophoneAccessError) {
          setError(MICROPHONE_ACCESS_MESSAGE);
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : "Evaluation failed.";
        dispatch({
          type: "EVALUATION_FAILED",
          feedbackText: EVALUATION_FAILED_FEEDBACK,
        });
        setError(
          message.includes("GROQ_API_KEY")
            ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能听写和判断孩子的发音。"
            : `判断语音时出错：${message}`
        );
      }
    }

    void recordAndEvaluate();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentStep.childTarget, state.phase]);

  async function startLesson() {
    if (isPreparingMicrophone) return;

    setError("");
    setIsPreparingMicrophone(true);

    try {
      await requestMicrophoneAccess();
      dispatch({ type: "START" });
    } catch (caughtError) {
      const setupMessage = getMicrophoneSetupErrorMessage(caughtError);
      const message =
        caughtError instanceof Error ? caughtError.message : "Microphone failed.";
      setError(setupMessage || `无法准备麦克风：${message}`);
    } finally {
      setIsPreparingMicrophone(false);
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
  const showStartButton =
    state.phase === LessonPhase.Idle || state.phase === LessonPhase.Finished;
  const startButtonLabel =
    isPreparingMicrophone
      ? "准备麦克风"
      : state.phase === LessonPhase.Finished
        ? "再来一次"
        : "开始";
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
            {Array.from({ length: LESSON_STEPS.length }, (_, index) => (
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
            <VolumeX aria-hidden="true" strokeWidth={3.4} />
          ) : (
            <Volume2 aria-hidden="true" strokeWidth={3.4} />
          )}
        </button>

        <div className={`lesson-flow-banner ${showStartButton ? "has-action" : ""}`}>
          {showStartButton ? (
            <button
              className="start-lesson-button"
              disabled={isPreparingMicrophone}
              onClick={startLesson}
              type="button"
            >
              {startButtonLabel}
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
              <Mic strokeWidth={3.6} />
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
          <ChevronLeft aria-hidden="true" strokeWidth={4} />
        </button>

        <button
          aria-label="Next scene"
          className="scene-nav-button scene-next-button"
          onClick={() => navigateScene("SCENE_NEXT")}
          type="button"
        >
          <ChevronRight aria-hidden="true" strokeWidth={4} />
        </button>

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Target phrase: {currentStep.childTarget}.
          Scene {sceneNumber} of {LESSON_STEPS.length}. {scene.statusText}.
          {state.transcript ? ` Heard: ${state.transcript}.` : ""}
          {error ? ` ${error}` : ""}
        </div>
      </section>
    </main>
  );
}
