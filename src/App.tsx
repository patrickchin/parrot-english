"use client";

import { ChevronLeft, ChevronRight, Mic, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio";
import { AI_LESSON } from "../lib/ai-lesson-data";
import { getDirectorPacketScenePresentation } from "../lib/director-packet-scene";
import {
  DirectorPacketPhase,
  createInitialDirectorPacketState,
  reduceDirectorPacketState,
} from "../lib/director-packet-state";
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
  recordSpeechClip,
} from "./speech-recorder";
import { isAbortError, playAudioLine, type AssetAudioLine } from "./audio-playback";
import {
  evaluateSpeech,
  type EvaluationResult,
} from "./evaluation-request";
import { requestLessonDirectorPacket } from "./lesson-director-request";
import { getMockDirectorPacket } from "../lib/mock-lesson-director";

const EVALUATION_FAILED_FEEDBACK = "我没有听清楚，我们慢一点再试一次。";
const USE_DIRECTOR_PACKET_FLOW =
  import.meta.env.VITE_PARROT_DIRECTOR_FLOW === "1";
const USE_DIRECTOR_PACKET_API =
  import.meta.env.VITE_PARROT_DIRECTOR_API === "1";
const DIRECTOR_TURN_DELAY_MS = 900;

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

export function LessonPlayer() {
  return USE_DIRECTOR_PACKET_FLOW ? (
    <DirectorLessonPlayer />
  ) : (
    <DeterministicLessonPlayer />
  );
}

function DeterministicLessonPlayer() {
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
          setError("这个浏览器不支持录音，请使用最新版 Chrome 或 Safari。");
          return;
        }

        if (caughtError instanceof MicrophoneAccessError) {
          setError("无法打开麦克风。请允许浏览器使用麦克风后再试一次。");
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

  function startLesson() {
    setError("");
    dispatch({ type: "START" });
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
    state.phase === LessonPhase.Finished ? "再来一次" : "开始";
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

type DirectorPacketState = ReturnType<typeof createInitialDirectorPacketState>;
type DirectorPacket = NonNullable<DirectorPacketState["packet"]>;

type DirectorPacketEvent =
  | { type: "START" }
  | { type: "PACKET_LOADED"; packet: DirectorPacket }
  | { type: "TURN_DONE" }
  | { type: "RECORDING_DONE" }
  | { type: "EVALUATED"; result: EvaluationResult }
  | { type: "PACKET_FAILED" };

function reduceDirectorLessonPlayerState(
  currentState: DirectorPacketState,
  event: DirectorPacketEvent
) {
  if (
    event.type === "START" &&
    currentState.phase === DirectorPacketPhase.Finished
  ) {
    return reduceDirectorPacketState(
      createInitialDirectorPacketState(AI_LESSON.scenes[0].id),
      event
    );
  }

  return reduceDirectorPacketState(currentState, event);
}

function getDirectorProgressLabel(phase: string) {
  switch (phase) {
    case DirectorPacketPhase.Idle:
      return "准备开始";
    case DirectorPacketPhase.LoadingPacket:
    case DirectorPacketPhase.NeedsPacket:
      return "正在准备";
    case DirectorPacketPhase.PlayingTurn:
      return "看动画";
    case DirectorPacketPhase.Listening:
      return "轮到你说";
    case DirectorPacketPhase.Evaluating:
      return "正在检查发音";
    case DirectorPacketPhase.Finished:
      return "完成";
    case DirectorPacketPhase.Error:
      return "需要重试";
    default:
      return "继续";
  }
}

function DirectorLessonPlayer() {
  const [state, dispatch] = useReducer(
    reduceDirectorLessonPlayerState,
    undefined,
    () => createInitialDirectorPacketState(AI_LESSON.scenes[0].id)
  );
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [directorAudioBlob, setDirectorAudioBlob] = useState<Blob | null>(null);
  const scene = useMemo(
    () => getDirectorPacketScenePresentation(AI_LESSON, state),
    [state]
  );
  const activePrompt = state.activePrompt;
  const currentSceneIndex = Math.max(
    AI_LESSON.scenes.findIndex(
      (sceneDefinition) => sceneDefinition.id === state.currentSceneId
    ),
    0
  );
  const currentScene = AI_LESSON.scenes[currentSceneIndex];
  const sceneNumber = currentSceneIndex + 1;
  const targetPhrase = activePrompt?.targetText || currentScene.childTarget;
  const progressLabel = getDirectorProgressLabel(state.phase);

  useEffect(() => {
    if (
      state.phase !== DirectorPacketPhase.LoadingPacket &&
      state.phase !== DirectorPacketPhase.NeedsPacket
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadDirectorPacket() {
      setError("");
      try {
        const packet = USE_DIRECTOR_PACKET_API
          ? await requestLessonDirectorPacket({
              lesson: AI_LESSON,
              runtimeState: state.runtimeState,
              signal: controller.signal,
            })
          : getMockDirectorPacket(AI_LESSON, state.runtimeState);
        if (!cancelled) dispatch({ type: "PACKET_LOADED", packet });
      } catch (caughtError) {
        if (cancelled || isAbortError(caughtError)) return;
        const message =
          caughtError instanceof Error ? caughtError.message : "Packet failed.";
        setError(`导演包暂时不可用：${message}`);
        dispatch({ type: "PACKET_FAILED" });
      }
    }

    void loadDirectorPacket();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [state.phase, state.runtimeState]);

  useEffect(() => {
    if (state.phase !== DirectorPacketPhase.PlayingTurn) return;

    const timeout = window.setTimeout(() => {
      dispatch({ type: "TURN_DONE" });
    }, DIRECTOR_TURN_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [state.activeTurnIndex, state.packet?.packetId, state.phase]);

  useEffect(() => {
    if (state.phase !== DirectorPacketPhase.Listening || !activePrompt) return;

    let cancelled = false;
    const controller = new AbortController();

    async function recordDirectorPrompt() {
      setError("");
      setDirectorAudioBlob(null);
      try {
        const audioBlob = await recordSpeechClip({ signal: controller.signal });
        if (cancelled) return;

        setDirectorAudioBlob(audioBlob);
        dispatch({ type: "RECORDING_DONE" });
      } catch (caughtError) {
        if (cancelled) return;

        if (caughtError instanceof RecordingUnsupportedError) {
          setError("这个浏览器不支持录音，请使用最新版 Chrome 或 Safari。");
          dispatch({ type: "PACKET_FAILED" });
          return;
        }

        if (caughtError instanceof MicrophoneAccessError) {
          setError("无法打开麦克风。请允许浏览器使用麦克风后再试一次。");
          dispatch({ type: "PACKET_FAILED" });
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : "Evaluation failed.";
        setError(
          message.includes("GROQ_API_KEY")
            ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能听写和判断孩子的发音。"
            : `判断语音时出错：${message}`
        );
        dispatch({ type: "PACKET_FAILED" });
      }
    }

    void recordDirectorPrompt();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activePrompt, state.phase]);

  useEffect(() => {
    if (
      state.phase !== DirectorPacketPhase.Evaluating ||
      !activePrompt ||
      !directorAudioBlob
    ) {
      return;
    }

    const audioBlob = directorAudioBlob;
    let cancelled = false;
    const controller = new AbortController();

    async function evaluateDirectorPrompt() {
      setError("");
      try {
        const result = await evaluateSpeech({
          audio: audioBlob,
          signal: controller.signal,
          targetText: activePrompt?.targetText as string,
        });

        if (!cancelled) {
          setDirectorAudioBlob(null);
          dispatch({ type: "EVALUATED", result });
        }
      } catch (caughtError) {
        if (cancelled) return;

        const message =
          caughtError instanceof Error ? caughtError.message : "Evaluation failed.";
        setDirectorAudioBlob(null);
        setError(
          message.includes("GROQ_API_KEY")
            ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能听写和判断孩子的发音。"
            : `判断语音时出错：${message}`
        );
        dispatch({ type: "PACKET_FAILED" });
      }
    }

    void evaluateDirectorPrompt();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activePrompt, directorAudioBlob, state.phase]);

  function startDirectorLesson() {
    setError("");
    setDirectorAudioBlob(null);
    dispatch({ type: "START" });
  }

  const showStartButton =
    state.phase === DirectorPacketPhase.Idle ||
    state.phase === DirectorPacketPhase.Finished ||
    state.phase === DirectorPacketPhase.Error;
  const startButtonLabel =
    state.phase === DirectorPacketPhase.Finished
      ? "再来一次"
      : state.phase === DirectorPacketPhase.Error
        ? "重试"
        : "开始";
  const showMicPrompt =
    state.phase === DirectorPacketPhase.Listening ||
    state.phase === DirectorPacketPhase.Evaluating;
  const isListening = state.phase === DirectorPacketPhase.Listening;
  const micPanelTitle = isListening ? "轮到你说" : "我听到了";
  const micPanelInstruction = isListening ? "麦克风正在听，请说：" : "正在检查发音";
  const micPanelAriaLabel = isListening
    ? `轮到你说。麦克风正在听。Target phrase: ${targetPhrase}.`
    : `我听到了。正在检查发音。Target phrase: ${targetPhrase}.`;
  const heardTranscript = state.runtimeState.lastChildResult?.transcript;

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
          <span className="scene-title">{currentScene.titleZh}</span>
          <div className="scene-progress" aria-hidden="true">
            {Array.from({ length: AI_LESSON.scenes.length }, (_, index) => (
              <span
                className={index <= currentSceneIndex ? "is-complete" : ""}
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
              onClick={startDirectorLesson}
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
            <strong className="mic-target-phrase">{targetPhrase}</strong>
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

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Target phrase: {targetPhrase}. Scene {sceneNumber} of{" "}
          {AI_LESSON.scenes.length}. {scene.statusText}.
          {heardTranscript ? ` Heard: ${heardTranscript}.` : ""}
          {error ? ` ${error}` : ""}
        </div>
      </section>
    </main>
  );
}
