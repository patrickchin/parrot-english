"use client";

import { ChevronLeft, ChevronRight, Mic, Volume2, VolumeX } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
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
const MAX_HOLD_RECORDING_MS = 12000;
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

type ActiveRecording = {
  cancelController: AbortController;
  stopController: AbortController;
};

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
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [isPreparingMicrophone, setIsPreparingMicrophone] = useState(false);
  const [muted, setMuted] = useState(false);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
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
    return () => {
      activeRecordingRef.current?.cancelController.abort();
    };
  }, []);

  useEffect(() => {
    if (
      state.phase === LessonPhase.Listening ||
      state.phase === LessonPhase.Evaluating
    ) {
      return;
    }

    const activeRecording = activeRecordingRef.current;
    if (!activeRecording) return;

    activeRecording.cancelController.abort();
    activeRecordingRef.current = null;
    setIsHoldingMic(false);
  }, [state.phase, state.stepIndex]);

  async function recordAndEvaluate(
    activeRecording: ActiveRecording,
    targetText: string
  ) {
    setError("");

    try {
      const audioBlob = await recordSpeechClip({
        recordingMs: MAX_HOLD_RECORDING_MS,
        signal: activeRecording.cancelController.signal,
        stopSignal: activeRecording.stopController.signal,
      });

      if (activeRecording.cancelController.signal.aborted) return;

      dispatch({ type: "RECORDING_DONE" });

      const result = await evaluateSpeech({
        audio: audioBlob,
        signal: activeRecording.cancelController.signal,
        targetText,
      });

      if (!activeRecording.cancelController.signal.aborted) {
        dispatch({ type: "EVALUATED", ...result });
      }
    } catch (caughtError) {
      if (
        activeRecording.cancelController.signal.aborted ||
        isAbortError(caughtError)
      ) {
        return;
      }

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
    } finally {
      if (activeRecordingRef.current === activeRecording) {
        activeRecordingRef.current = null;
        setIsHoldingMic(false);
      }
    }
  }

  function startHoldRecording(event?: PointerEvent<HTMLButtonElement>) {
    if (state.phase !== LessonPhase.Listening || activeRecordingRef.current) {
      return;
    }

    event?.preventDefault();
    event?.currentTarget.setPointerCapture(event.pointerId);

    const activeRecording = {
      cancelController: new AbortController(),
      stopController: new AbortController(),
    };
    activeRecordingRef.current = activeRecording;
    setIsHoldingMic(true);

    void recordAndEvaluate(activeRecording, currentStep.childTarget);
  }

  function stopHoldRecording(
    event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>
  ) {
    event?.preventDefault();
    const activeRecording = activeRecordingRef.current;

    if (!activeRecording || activeRecording.stopController.signal.aborted) {
      return;
    }

    activeRecording.stopController.abort();
    setIsHoldingMic(false);
  }

  function cancelHoldRecording(event?: PointerEvent<HTMLButtonElement>) {
    event?.preventDefault();
    const activeRecording = activeRecordingRef.current;
    if (!activeRecording) return;

    activeRecording.cancelController.abort();
    activeRecordingRef.current = null;
    setIsHoldingMic(false);
  }

  function startKeyboardHoldRecording(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.repeat) return;

    event.preventDefault();
    startHoldRecording();
  }

  function stopKeyboardHoldRecording(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;

    stopHoldRecording(event);
  }

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
  const micPanelInstruction = isListening
    ? isHoldingMic
      ? "正在听，松开后检查："
      : "按住麦克风说："
    : "正在检查发音";
  const micPanelAriaLabel = isListening
    ? isHoldingMic
      ? `轮到你说。正在录音，松开麦克风按钮后检查。Target phrase: ${currentStep.childTarget}.`
      : `轮到你说。按住麦克风按钮说。Target phrase: ${currentStep.childTarget}.`
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
            } ${isHoldingMic ? "is-recording" : "is-ready"}`}
            role="status"
          >
            {isListening ? (
              <button
                aria-label={
                  isHoldingMic
                    ? `Release microphone to check: ${currentStep.childTarget}`
                    : `Hold microphone and say: ${currentStep.childTarget}`
                }
                aria-pressed={isHoldingMic}
                className="mic-symbol"
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={startKeyboardHoldRecording}
                onKeyUp={stopKeyboardHoldRecording}
                onPointerCancel={cancelHoldRecording}
                onPointerDown={startHoldRecording}
                onPointerUp={stopHoldRecording}
                type="button"
              >
                <Mic aria-hidden="true" strokeWidth={3.6} />
              </button>
            ) : (
              <span className="mic-symbol" aria-hidden="true">
                <Mic strokeWidth={3.6} />
              </span>
            )}
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
