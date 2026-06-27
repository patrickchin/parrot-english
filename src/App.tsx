"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  getLessonAudioCompletionEvent,
  getLessonAudioSequence,
} from "../lib/lesson-audio";
import { LESSON_STEPS } from "../lib/lesson-data";
import { getLessonScenePresentation } from "../lib/lesson-scene";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state";
import { isAbortError, playSpokenLine, type SpokenLine } from "./tts-playback";

const RECORDING_MS = 4200;
const PROGRESS_DOT_COUNT = 12;

type EvaluationResult = {
  transcript: string;
  similarity: number;
  passed: boolean;
  feedbackText: string;
  retryAllowed: boolean;
};

type LessonEvent =
  | { type: "START" }
  | { type: "EXAMPLE_DONE" }
  | { type: "COACH_DONE" }
  | { type: "RECORDING_DONE" }
  | ({ type: "EVALUATED" } & EvaluationResult)
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

async function fetchJsonError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    return payload.message ?? payload.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
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
  const [muted, setMuted] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const currentStep = LESSON_STEPS[state.stepIndex];
  const scene = useMemo(
    () => getLessonScenePresentation(state, currentStep),
    [currentStep, state]
  );

  const progressLabel = useMemo(() => {
    if (state.phase === LessonPhase.Idle) return "按开始";
    if (state.phase === LessonPhase.ExampleSpeaking) return "听佩奇说";
    if (state.phase === LessonPhase.ParrotCoaching) return "多莉告诉你怎么说";
    if (state.phase === LessonPhase.Listening) return "轮到你了，现在说";
    if (state.phase === LessonPhase.Evaluating) return "正在检查发音";
    if (state.phase === LessonPhase.Finished) return "今天练习完成";
    return state.feedback || "准备下一句";
  }, [state.feedback, state.phase]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const audioSequence = getLessonAudioSequence(
      state,
      currentStep
    ) as SpokenLine[];
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
        let previousAudioUrl = audioUrlRef.current;

        for (const line of audioSequence) {
          const result = await playSpokenLine({
            ...line,
            previousAudioUrl,
            signal: controller.signal,
          });
          previousAudioUrl = result.audioUrl;
          audioUrlRef.current = result.audioUrl;
        }

        if (!cancelled && completionEvent) {
          dispatch(completionEvent);
        }
      } catch (caughtError) {
        if (!cancelled && !isAbortError(caughtError)) {
          const message =
            caughtError instanceof Error ? caughtError.message : "TTS failed.";
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

    let recorder: MediaRecorder | null = null;
    let cancelled = false;

    async function recordAndEvaluate() {
      const stream = mediaStreamRef.current;
      if (!stream) {
        setError("麦克风还没有准备好，请重新点击开始练习。");
        return;
      }

      if (!window.MediaRecorder) {
        setError("这个浏览器不支持录音，请使用最新版 Chrome 或 Safari。");
        return;
      }

      setError("");
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        if (cancelled) return;
        dispatch({ type: "RECORDING_DONE" });

        try {
          const audioBlob = new Blob(chunks, { type: "audio/webm" });
          const formData = new FormData();
          formData.set("targetText", currentStep.childTarget);
          formData.set("audio", audioBlob, "child-response.webm");

          const response = await fetch("/api/evaluate-speech", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(await fetchJsonError(response));
          }

          const result = (await response.json()) as EvaluationResult;
          dispatch({ type: "EVALUATED", ...result });
        } catch (caughtError) {
          const message =
            caughtError instanceof Error ? caughtError.message : "Evaluation failed.";
          setError(
            message.includes("GROQ_API_KEY")
              ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能听写和判断孩子的发音。"
              : `判断语音时出错：${message}`
          );
        }
      };

      recorder.start();
      window.setTimeout(() => recorder?.state === "recording" && recorder.stop(), RECORDING_MS);
    }

    void recordAndEvaluate();

    return () => {
      cancelled = true;
      if (recorder?.state === "recording") recorder.stop();
    };
  }, [currentStep.childTarget, state.phase]);

  async function startLesson() {
    setError("");

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      }
      dispatch({ type: "START" });
    } catch {
      setError("无法打开麦克风。请允许浏览器使用麦克风后再试一次。");
    }
  }

  function navigateScene(type: "SCENE_NEXT" | "SCENE_PREVIOUS") {
    setError("");
    dispatch({ type });
  }

  const sceneNumber = state.stepIndex + 1;
  const showStartButton =
    state.phase === LessonPhase.Idle || state.phase === LessonPhase.Finished;
  const startButtonLabel =
    state.phase === LessonPhase.Finished ? "再来一次" : "开始";

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
            {Array.from({ length: PROGRESS_DOT_COUNT }, (_, index) => (
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
          <img
            src={muted ? "/assets/ui/volume-muted.svg" : "/assets/ui/volume-on.svg"}
            alt=""
            draggable="false"
          />
        </button>

        <div className={`lesson-flow-banner ${showStartButton ? "has-action" : ""}`}>
          {showStartButton ? (
            <button
              className="start-lesson-button"
              onClick={() => void startLesson()}
              type="button"
            >
              {startButtonLabel}
            </button>
          ) : (
            <span className="flow-status">{progressLabel}</span>
          )}
        </div>

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
          <img src="/assets/ui/scene-back.svg" alt="" draggable="false" />
        </button>

        <button
          aria-label="Next scene"
          className="scene-nav-button scene-next-button"
          onClick={() => navigateScene("SCENE_NEXT")}
          type="button"
        >
          <img src="/assets/ui/scene-next.svg" alt="" draggable="false" />
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
