"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { LESSON_STEPS } from "../lib/lesson-data";
import {
  LessonPhase,
  createInitialLessonState,
  reduceLessonState,
} from "../lib/lesson-state";

const RECORDING_MS = 4200;

type EvaluationResult = {
  transcript: string;
  similarity: number;
  passed: boolean;
  feedbackText: string;
  retryAllowed: boolean;
};

type LessonEvent =
  | { type: "START" }
  | { type: "HOST_DONE" }
  | { type: "PARROT_DONE" }
  | { type: "RECORDING_DONE" }
  | ({ type: "EVALUATED" } & EvaluationResult)
  | { type: "NEXT" }
  | { type: "RETRY" }
  | { type: "RESET" };

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const currentStep = LESSON_STEPS[state.stepIndex];

  const progressLabel = useMemo(() => {
    if (state.phase === LessonPhase.Idle) return "点击开始后会请求麦克风权限";
    if (state.phase === LessonPhase.HostSpeaking) return "先听角色说";
    if (state.phase === LessonPhase.ParrotSpeaking) return "听多莉鹦鹉示范";
    if (state.phase === LessonPhase.Listening) return "正在听孩子开口";
    if (state.phase === LessonPhase.Evaluating) return "正在判断说得像不像";
    if (state.phase === LessonPhase.Finished) return "今日练习完成";
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
    if (state.phase !== LessonPhase.HostSpeaking) return;

    const timeout = window.setTimeout(() => {
      dispatch({ type: "HOST_DONE" });
    }, 1100);

    return () => window.clearTimeout(timeout);
  }, [state.phase, state.stepIndex]);

  useEffect(() => {
    if (state.phase !== LessonPhase.ParrotSpeaking) return;

    let cancelled = false;

    async function playParrotLine() {
      setError("");
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: currentStep.parrotLine,
            slow: state.retryCount > 0,
          }),
        });

        if (!response.ok) {
          throw new Error(await fetchJsonError(response));
        }

        const audioBlob = await response.blob();
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }

        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;
        const audio = new Audio(audioUrl);

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("Audio playback failed."));
          audio.play().catch(reject);
        });

        if (!cancelled) {
          dispatch({ type: "PARROT_DONE" });
        }
      } catch (caughtError) {
        if (!cancelled) {
          const message =
            caughtError instanceof Error ? caughtError.message : "TTS failed.";
          setError(
            message.includes("GROQ_API_KEY")
              ? "请先在 Worker 运行环境配置 GROQ_API_KEY，才能播放多莉的声音。"
              : `多莉的声音暂时不可用：${message}`
          );
        }
      }
    }

    void playParrotLine();

    return () => {
      cancelled = true;
    };
  }, [currentStep.parrotLine, state.phase, state.retryCount]);

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

  useEffect(() => {
    if (state.phase !== LessonPhase.Feedback) return;

    const timeout = window.setTimeout(() => {
      dispatch({ type: state.lastOutcome === "retry" ? "RETRY" : "NEXT" });
    }, state.lastOutcome === "retry" ? 1600 : 1200);

    return () => window.clearTimeout(timeout);
  }, [state.lastOutcome, state.phase]);

  async function startLesson() {
    setError("");

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      dispatch({ type: "START" });
    } catch {
      setError("无法打开麦克风。请允许浏览器使用麦克风后再试一次。");
    }
  }

  const isBusy =
    state.phase === LessonPhase.HostSpeaking ||
    state.phase === LessonPhase.ParrotSpeaking ||
    state.phase === LessonPhase.Listening ||
    state.phase === LessonPhase.Evaluating;

  return (
    <main className="h-screen min-h-[1024px] min-w-[1536px] overflow-hidden bg-sky-300 text-[#241d2b]">
      <section
        aria-label="Parrot English speaking lesson"
        className="relative h-[1024px] w-[1536px] overflow-hidden"
      >
        <img
          src="/assets/placeholders/local-lesson-reference.png"
          alt="Temporary local lesson placeholder"
          className="absolute inset-0 h-full w-full select-none object-cover"
        />

        <button
          aria-label={state.phase === LessonPhase.Finished ? "Restart lesson" : "Start lesson"}
          className="absolute right-[26px] top-[22px] z-20 h-[102px] w-[102px] rounded-full opacity-0"
          disabled={isBusy}
          onClick={startLesson}
          type="button"
        />

        <button
          aria-label="Previous lesson step"
          className="absolute bottom-[24px] left-[24px] z-20 h-[100px] w-[100px] rounded-full opacity-0"
          onClick={() => dispatch({ type: "RESET" })}
          type="button"
        />

        <button
          aria-label="Next lesson step"
          className="absolute bottom-[24px] right-[24px] z-20 h-[100px] w-[100px] rounded-full opacity-0"
          onClick={() => dispatch({ type: "NEXT" })}
          type="button"
        />

        <div className="sr-only" aria-live="polite">
          {progressLabel}. Target phrase: {currentStep.childTarget}.
          {state.transcript ? ` Heard: ${state.transcript}.` : ""}
          {error ? ` ${error}` : ""}
        </div>

        {error ? (
          <div className="absolute bottom-36 left-1/2 z-30 w-[560px] -translate-x-1/2 rounded-3xl border-4 border-white bg-red-100/95 px-6 py-4 text-center text-xl font-black text-red-700 shadow-xl">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
