"use client";

import { Mic, Volume2, VolumeX } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import { evaluateSpeech } from "./evaluation-request";
import {
  LESSONS,
  VISUAL_CATALOG,
  type Lesson,
} from "./lesson-catalog";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "./speech-recorder";

const RECORDING_UNSUPPORTED_MESSAGE =
  "This browser does not support audio recording. Try the latest Chrome or Safari.";
const MICROPHONE_ACCESS_MESSAGE =
  "Please allow microphone access, then press and hold the button again.";

type LessonEvent =
  | { type: "START" }
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

export function LessonPlayer() {
  const [selectedLessonId, setSelectedLessonId] = useState(LESSONS[0]?.id ?? "");
  const selectedEntry =
    LESSONS.find((entry) => entry.id === selectedLessonId) ?? LESSONS[0];
  if (!selectedEntry) throw new Error("No lessons are available.");
  const currentLesson: Lesson = selectedEntry.lesson;

  const [state, dispatch] = useReducer(
    (
      currentState: ReturnType<typeof createInitialLessonState>,
      event: LessonEvent
    ) => reduceLessonState(currentState, event, currentLesson),
    createInitialLessonState()
  );
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
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
  const canSelectLesson =
    state.phase === LessonPhase.Idle || state.phase === LessonPhase.Finished;

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

    if (muted) {
      const timeout = window.setTimeout(() => dispatch(completionEvent), 700);
      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const controller = new AbortController();
    setError("");
    void playAudioLine({ ...audioLine, signal: controller.signal })
      .then(() => {
        if (!cancelled) dispatch(completionEvent);
      })
      .catch((caughtError: unknown) => {
        if (cancelled || isAbortError(caughtError)) return;
        const message =
          caughtError instanceof Error ? caughtError.message : "Audio playback failed.";
        setError(`Audio unavailable: ${message}`);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    currentLesson,
    muted,
    state.feedback,
    state.phase,
    state.sceneIndex,
    state.stepIndex,
  ]);

  useEffect(
    () => () => {
      pressedRef.current = false;
      recordingControllerRef.current?.abort();
      recordingRef.current?.cancel();
      evaluationControllerRef.current?.abort();
    },
    []
  );

  function startLesson() {
    setError("");
    dispatch({ type: "START" });
  }

  function handleLessonChange(event: ChangeEvent<HTMLSelectElement>) {
    pressedRef.current = false;
    recordingControllerRef.current?.abort();
    recordingRef.current?.cancel();
    evaluationControllerRef.current?.abort();
    recordingRef.current = null;
    setError("");
    setSelectedLessonId(event.target.value);
    dispatch({ type: "RESET" });
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
    const session = recordingRef.current;
    recordingRef.current = null;

    if (!session) {
      recordingControllerRef.current?.abort();
      recordingControllerRef.current = null;
      return;
    }

    dispatch({ type: "MIC_RELEASED" });
    try {
      const audio = await session.stop();
      const controller = new AbortController();
      evaluationControllerRef.current = controller;
      const result = await evaluateSpeech({
        audio,
        signal: controller.signal,
        targetText: currentStep.dialogue,
      });
      dispatch({
        type: "EVALUATED",
        passed: result.passed,
        transcript: result.transcript,
      });
    } catch (caughtError) {
      if (isAbortError(caughtError)) {
        dispatch({ type: "RECORDING_CANCELLED" });
        return;
      }
      setError(
        caughtError instanceof Error && caughtError.message.includes("GROQ_API_KEY")
          ? "Speech checking is not configured."
          : `Speech check failed: ${
              caughtError instanceof Error ? caughtError.message : "Unknown error."
            }`
      );
      dispatch({ type: "EVALUATION_FAILED" });
    } finally {
      recordingControllerRef.current = null;
      evaluationControllerRef.current = null;
    }
  }

  function cancelRecording() {
    pressedRef.current = false;
    pressSequenceRef.current += 1;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingRef.current?.cancel();
    recordingRef.current = null;
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
          <span
            aria-label={`Build version ${versionLabel}`}
            className="build-version-badge"
          >
            {versionLabel}
          </span>
        </header>

        <label className="lesson-picker">
          <span>Lesson picker</span>
          <select
            aria-label="Lesson picker"
            disabled={!canSelectLesson}
            onChange={handleLessonChange}
            value={selectedEntry.id}
          >
            {LESSONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.lesson.title}
              </option>
            ))}
          </select>
        </label>

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

        <div className="lesson-flow-banner">
          {canSelectLesson ? (
            <button className="start-lesson-button" onClick={startLesson} type="button">
              {state.phase === LessonPhase.Finished ? "Play again" : "Start"}
            </button>
          ) : (
            <span className="flow-status">{progressLabel}</span>
          )}
        </div>

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

        {scene.speech.kind === "narration" ||
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
            <span>{scene.speech.speaker === "user" ? "You" : scene.speech.speaker}</span>
            <p>{scene.speech.text}</p>
          </div>
        )}

        {showUserTurn ? (
          <div
            aria-live="assertive"
            className={`user-turn-panel ${
              isRecording ? "is-recording" : isEvaluating ? "is-evaluating" : ""
            }`}
            role="status"
          >
            <strong>{currentStep.dialogue}</strong>
            {isEvaluating ? (
              <span className="checking-label">Checking your speech...</span>
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
          </div>
        ) : null}

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
