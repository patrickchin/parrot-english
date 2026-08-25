"use client";

import { ChevronLeft, Mic, Play, Square, Volume2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { isAbortError } from "../media/audio-playback";
import { playDeviceSpeech } from "../media/device-speech";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { ActionButton, fieldClassName, TextButton } from "../shared/ui";
import {
  deleteDub,
  getDubLineAudioUrl,
  loadDubStatus,
  saveDubLine,
} from "./dub-api";
import { DubLinePlaybackError, startDubPlayback } from "./dub-playback";
import {
  DUB_DURATION_MS,
  DUB_LINES,
  DUB_RECORDING_MS,
  getDubLineAtElapsed,
  type DubLine,
} from "./dub-script";
import {
  createInitialDubState,
  reduceDubState,
  type DubState,
} from "./dub-state";
import { DuckScene } from "./DuckScene";

type DubHandlers = {
  onDelete(): void;
  onHearGuide(): void;
  onHearTake(): void;
  onNext(): void;
  onRecord(): void;
  onRetake(): void;
  onRetryLoad(): void;
  onSaveAgain(): void;
  onSelectLine(lineId: string): void;
  onStopPlayback(): void;
  onStopRecording(): void;
  onWatch(): void;
};

type DubControlsProps = {
  activeLine: DubLine;
  handlers: DubHandlers;
  isDeleting?: boolean;
  loadError?: string;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  state: DubState;
};

function renderDubControls({
  activeLine,
  handlers,
  isDeleting = false,
  loadError = "",
  recordButtonRef,
  state,
}: DubControlsProps) {
  const lineNumber = Math.max(0, DUB_LINES.findIndex(({ id }) => id === activeLine.id)) + 1;
  if (state.phase === "loading") {
    return loadError ? (
      <ActionButton onClick={handlers.onRetryLoad}>Try loading again</ActionButton>
    ) : (
      <ActionButton disabled>Loading your private dub…</ActionButton>
    );
  }
  if (state.phase === "mic-opening") {
    return <ActionButton disabled>Opening microphone…</ActionButton>;
  }
  if (state.phase === "recording") {
    return (
      <ActionButton
        aria-label={`Stop recording line ${lineNumber}`}
        onClick={handlers.onStopRecording}
        variant="rose"
      >
        <Square aria-hidden="true" /> Stop recording
      </ActionButton>
    );
  }
  if (state.phase === "saving") {
    return <ActionButton disabled>Saving your take…</ActionButton>;
  }
  if (state.phase === "save-error") {
    return (
      <>
        <ActionButton onClick={handlers.onSaveAgain}>Save again</ActionButton>
        <TextButton className="min-h-12" onClick={handlers.onRetake}>Try recording again</TextButton>
      </>
    );
  }
  if (state.phase === "line-review") {
    return (
      <>
        <ActionButton
          aria-label="Hear my take"
          onClick={handlers.onHearTake}
          variant="navy"
        >
          <Volume2 aria-hidden="true" /> Hear my take
        </ActionButton>
        <ActionButton onClick={handlers.onNext}>Next line</ActionButton>
        <TextButton className="min-h-12" onClick={handlers.onRetake}>Try again</TextButton>
      </>
    );
  }
  if (state.phase === "final-loading") {
    return <ActionButton disabled>Getting your dub ready…</ActionButton>;
  }
  if (state.phase === "final-playing") {
    return (
      <ActionButton onClick={handlers.onStopPlayback} variant="rose">
        Stop playback
      </ActionButton>
    );
  }
  if (state.phase === "final-ready") {
    if (isDeleting) return <ActionButton disabled>Deleting your dub…</ActionButton>;
    return (
      <>
        <label className="font-ui font-black text-brand-ink" htmlFor="saved-dub-line">
          Choose a saved line
        </label>
        <select
          aria-label="Choose a saved line"
          className={fieldClassName()}
          id="saved-dub-line"
          onChange={(event) => handlers.onSelectLine(event.currentTarget.value)}
          value={activeLine.id}
        >
          {DUB_LINES.filter(({ id }) => id in state.saved).map((line, index) => (
            <option key={line.id} value={line.id}>
              Line {index + 1}: {line.text}
            </option>
          ))}
        </select>
        <ActionButton onClick={handlers.onWatch} variant="success">
          <Play aria-hidden="true" /> Watch my dub
        </ActionButton>
        <TextButton className="min-h-12" onClick={handlers.onRetake}>Record selected line</TextButton>
        <TextButton className="min-h-12" onClick={handlers.onDelete}>Delete my dub</TextButton>
      </>
    );
  }
  return (
    <>
      <ActionButton
        aria-label="Hear the line"
        onClick={handlers.onHearGuide}
        variant="navy"
      >
        <Volume2 aria-hidden="true" /> Hear the line
      </ActionButton>
      <ActionButton
        aria-label={`Record line ${lineNumber}`}
        onClick={handlers.onRecord}
        ref={recordButtonRef}
        variant="rose"
      >
        <Mic aria-hidden="true" /> Record
      </ActionButton>
      {DUB_LINES.every(({ id }) => id in state.saved) ? (
        <TextButton className="min-h-12" onClick={handlers.onWatch}>Watch my dub</TextButton>
      ) : null}
    </>
  );
}

export function DuckDubView({
  confirmed,
  isDeleting = false,
  line,
  loadError = "",
  onConfirm,
  onDelete,
  onHearGuide,
  onHearTake,
  onNext,
  onRecord,
  onRetake,
  onRetryLoad = () => {},
  onSaveAgain,
  onSelectLine,
  onStopPlayback,
  onStopRecording,
  onWatch,
  recordButtonRef,
  state,
}: Omit<DubHandlers, "onRetryLoad"> & {
  confirmed: boolean;
  isDeleting?: boolean;
  line: DubLine;
  loadError?: string;
  onConfirm(confirmed: boolean): void;
  onRetryLoad?(): void;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  state: DubState;
}) {
  const lineIndex = Math.max(0, DUB_LINES.findIndex(({ id }) => id === line.id));
  const error = state.error || loadError;
  const handlers: DubHandlers = {
    onDelete,
    onHearGuide,
    onHearTake,
    onNext,
    onRecord,
    onRetake,
    onRetryLoad,
    onSaveAgain,
    onSelectLine,
    onStopPlayback,
    onStopRecording,
    onWatch,
  };

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-5 pt-20 md:px-6 md:py-24">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to home"
          icon={<ChevronLeft strokeWidth={3.2} />}
          to="/"
        >
          Back home
        </HeaderLink>
      </RouteHeader>
      <section
        aria-labelledby="dub-title"
        className="mx-auto grid w-full max-w-6xl gap-4 short-wide:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.8fr)] lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.8fr)]"
      >
        <DuckScene line={line} playing={state.phase === "final-playing"} />
        <section className="grid content-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-4 shadow-card">
          <p
            aria-label={`Line ${lineIndex + 1} of ${DUB_LINES.length}`}
            className="m-0 text-sm font-black uppercase tracking-wider text-brand-blue"
          >
            Line {lineIndex + 1} of {DUB_LINES.length}
          </p>
          <h1 className="m-0 text-3xl leading-none text-brand-ink md:text-5xl" id="dub-title">
            Five Little Ducks
          </h1>
          <p className="m-0 text-xl font-black leading-snug text-brand-ink">
            {line.text}
          </p>
          <p className="m-0 text-sm font-bold leading-snug text-slate-700">
            Your recordings are private and saved to the signed-in grown-up&apos;s account.
            You can replay or replace them here, and they are deleted with the account.
          </p>
          {state.phase === "intro" ? (
            <div className="grid gap-4">
              <label className="flex min-h-12 items-start gap-3 rounded-2xl bg-sky-50 p-3 font-bold leading-snug text-brand-ink">
                <input
                  checked={confirmed}
                  className="mt-1 size-5 shrink-0 accent-brand-blue"
                  onChange={(event) => onConfirm(event.currentTarget.checked)}
                  required
                  type="checkbox"
                />
                <span>I’m the grown-up and I agree to save these private voice clips.</span>
              </label>
              <ActionButton disabled={!confirmed} onClick={handlers.onNext}>
                {Object.keys(state.saved).length > 0 ? "Continue dubbing" : "Start dubbing"}
              </ActionButton>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 short-wide:grid-cols-1">
              {renderDubControls({
                activeLine: line,
                handlers,
                isDeleting,
                loadError,
                recordButtonRef,
                state,
              })}
            </div>
          )}
          {state.phase === "recording" ? (
            <p className="m-0 font-black text-brand-rose">
              Recording…
            </p>
          ) : null}
          {error ? (
            <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
            Line {lineIndex + 1} of {DUB_LINES.length}. {state.phase === "recording" ? "Recording in progress." : "Ready."}
          </div>
        </section>
      </section>
    </main>
  );
}

function microphoneMessage(error: unknown) {
  if (error instanceof RecordingUnsupportedError) {
    return "This browser cannot record yet. Try another device or browser.";
  }
  if (error instanceof MicrophoneAccessError) {
    return "The microphone is off. Ask a grown-up to allow it, then try again.";
  }
  return "The microphone did not start. Try recording again.";
}

export function DuckDub() {
  const [state, dispatch] = useReducer(reduceDubState, undefined, createInitialDubState);
  const [confirmed, setConfirmed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [loadSequence, setLoadSequence] = useState(0);
  const [playbackLineIndex, setPlaybackLineIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);
  const guideControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);
  const finalControllerRef = useRef<AbortController | null>(null);
  const deleteControllerRef = useRef<AbortController | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingSessionRef = useRef<SpeechRecordingSession | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingLineIdRef = useRef<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const finalPlaybackRef = useRef<{ stop(): void } | null>(null);

  const stopOperations = useCallback((discardBlob = false) => {
    generationRef.current += 1;
    statusControllerRef.current?.abort();
    statusControllerRef.current = null;
    guideControllerRef.current?.abort();
    guideControllerRef.current = null;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    previewControllerRef.current?.abort();
    previewControllerRef.current = null;
    finalControllerRef.current?.abort();
    finalControllerRef.current = null;
    deleteControllerRef.current?.abort();
    deleteControllerRef.current = null;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    finalPlaybackRef.current?.stop();
    finalPlaybackRef.current = null;
    if (discardBlob) {
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const generation = generationRef.current;
    statusControllerRef.current = controller;
    setLoadError("");
    void loadDubStatus({ signal: controller.signal })
      .then((status) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        dispatch({
          type: "LOADED",
          savedLineIds: status.lines.filter(({ saved }) => saved).map(({ id }) => id),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        setLoadError(error instanceof Error ? error.message : "Your saved dub could not be loaded.");
      })
      .finally(() => {
        if (statusControllerRef.current === controller) statusControllerRef.current = null;
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      stopOperations(true);
    };
  }, [loadSequence, stopOperations]);

  async function uploadPendingBlob(generation: number) {
    const blob = pendingBlobRef.current;
    const lineId = pendingLineIdRef.current;
    if (!blob || !lineId) {
      dispatch({ type: "SAVE_FAILED", message: "There is no new take to save. Record the line again." });
      return;
    }
    const controller = new AbortController();
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = controller;
    setOperationError("");
    try {
      const result = await saveDubLine(lineId, blob, { signal: controller.signal });
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (pendingBlobRef.current === blob) {
        pendingBlobRef.current = null;
        pendingLineIdRef.current = null;
      }
      dispatch({ type: "SAVE_SUCCEEDED", lineId, recordedAt: result.recordedAt });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      dispatch({
        type: "SAVE_FAILED",
        message: error instanceof Error ? error.message : "Your take was not saved. Try again.",
      });
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
    }
  }

  async function finishRecording(generation = generationRef.current) {
    if (generation !== generationRef.current) return;
    const session = recordingSessionRef.current;
    if (!session) return;
    recordingSessionRef.current = null;
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      const blob = await session.stop();
      if (!mountedRef.current || generation !== generationRef.current) return;
      recordingControllerRef.current = null;
      pendingBlobRef.current = blob;
      dispatch({ type: "SAVE_STARTED" });
      await uploadPendingBlob(generation);
    } catch (error) {
      if (generation !== generationRef.current || isAbortError(error)) return;
      recordingControllerRef.current = null;
      dispatch({ type: "RETAKE" });
      setOperationError("The recording did not finish. Try recording the line again.");
    }
  }

  async function handleRecord() {
    stopOperations(true);
    const generation = generationRef.current;
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    pendingLineIdRef.current = DUB_LINES[state.currentLineIndex].id;
    setOperationError("");
    dispatch({ type: "MIC_OPENING" });
    try {
      const session = await startSpeechRecording({ signal: controller.signal });
      if (!mountedRef.current || generation !== generationRef.current) {
        session.cancel();
        return;
      }
      recordingSessionRef.current = session;
      dispatch({ type: "MIC_STARTED" });
      recordingTimerRef.current = setTimeout(() => {
        void finishRecording(generation);
      }, DUB_RECORDING_MS);
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      recordingControllerRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "RETAKE" });
      setOperationError(microphoneMessage(error));
      requestAnimationFrame(() => {
        if (mountedRef.current && generation === generationRef.current) {
          recordButtonRef.current?.focus();
        }
      });
    }
  }

  function handleHearGuide() {
    stopOperations(false);
    const generation = generationRef.current;
    const controller = new AbortController();
    guideControllerRef.current = controller;
    setOperationError("");
    void playDeviceSpeech({
      signal: controller.signal,
      speaker: "narrator",
      text: DUB_LINES[state.currentLineIndex].text,
    })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current || isAbortError(error)) return;
        setOperationError("I could not read that line aloud. You can still record the words you see.");
      })
      .finally(() => {
        if (guideControllerRef.current === controller) guideControllerRef.current = null;
      });
  }

  async function handleHearTake() {
    stopOperations(false);
    const generation = generationRef.current;
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setOperationError("");
    try {
      const lineId = DUB_LINES[state.currentLineIndex].id;
      const response = await fetch(getDubLineAudioUrl(lineId), {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Your saved take could not be played. Try again.");
      const blob = await response.blob();
      if (!mountedRef.current || generation !== generationRef.current) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewUrlRef.current = url;
      previewAudioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new DOMException("Preview cancelled.", "AbortError"));
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Your saved take could not be played. Try again."));
        controller.signal.addEventListener("abort", abort, { once: true });
        void audio.play().catch(reject);
      });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current || isAbortError(error)) return;
      setOperationError(error instanceof Error ? error.message : "Your saved take could not be played. Try again.");
    } finally {
      if (previewControllerRef.current === controller) {
        previewAudioRef.current?.pause();
        previewAudioRef.current = null;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        previewControllerRef.current = null;
      }
    }
  }

  async function handleWatch() {
    stopOperations(false);
    const generation = generationRef.current;
    const controller = new AbortController();
    finalControllerRef.current = controller;
    setPlaybackLineIndex(0);
    setOperationError("");
    dispatch({ type: "FINAL_LOADING" });
    try {
      const playback = await startDubPlayback({
        onTick(elapsedMs) {
          if (generation !== generationRef.current) return;
          setPlaybackLineIndex(DUB_LINES.indexOf(getDubLineAtElapsed(elapsedMs)));
          if (elapsedMs >= DUB_DURATION_MS) {
            finalPlaybackRef.current?.stop();
            finalPlaybackRef.current = null;
            finalControllerRef.current = null;
            dispatch({ type: "FINAL_FINISHED" });
          }
        },
        signal: controller.signal,
      });
      if (!mountedRef.current || generation !== generationRef.current) {
        playback.stop();
        return;
      }
      finalPlaybackRef.current = playback;
      dispatch({ type: "FINAL_STARTED" });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current || isAbortError(error)) return;
      finalControllerRef.current = null;
      if (error instanceof DubLinePlaybackError) {
        dispatch({ type: "SELECT_LINE", lineId: error.lineId });
        dispatch({ type: "RETAKE" });
        setOperationError("That take could not play. Record this line again.");
        requestAnimationFrame(() => {
          if (mountedRef.current && generation === generationRef.current) {
            recordButtonRef.current?.focus();
          }
        });
        return;
      }
      dispatch({ type: "FINAL_FINISHED" });
      setOperationError(
        error instanceof Error ? error.message : "Your saved dub could not be played. Try again.",
      );
    }
  }

  function handleStopPlayback() {
    stopOperations(false);
    dispatch({ type: "FINAL_FINISHED" });
  }

  async function handleDelete() {
    if (!window.confirm("Grown-up: delete every saved voice clip in this dub?")) return;
    stopOperations(true);
    const generation = generationRef.current;
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    setIsDeleting(true);
    setOperationError("");
    try {
      await deleteDub({ signal: controller.signal });
      if (!mountedRef.current || generation !== generationRef.current) return;
      setConfirmed(false);
      setPlaybackLineIndex(0);
      dispatch({ type: "RESET_SUCCEEDED" });
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setOperationError(error instanceof Error ? error.message : "Your saved dub was not deleted.");
    } finally {
      if (deleteControllerRef.current === controller) deleteControllerRef.current = null;
      if (mountedRef.current && generation === generationRef.current) setIsDeleting(false);
    }
  }

  function handleRetake() {
    stopOperations(true);
    setOperationError("");
    dispatch({ type: "RETAKE" });
  }

  function handleSelectLine(lineId: string) {
    setOperationError("");
    dispatch({ type: "SELECT_LINE", lineId });
  }

  function handleNext() {
    if (state.phase === "intro") {
      if (confirmed) dispatch({ type: "CONFIRMED" });
      return;
    }
    stopOperations(true);
    setOperationError("");
    dispatch({ type: "NEXT_LINE" });
  }

  function handleSaveAgain() {
    stopOperations(false);
    const generation = generationRef.current;
    dispatch({ type: "SAVE_STARTED" });
    void uploadPendingBlob(generation);
  }

  const activeLine =
    state.phase === "final-playing"
      ? DUB_LINES[playbackLineIndex]
      : DUB_LINES[state.currentLineIndex];

  return (
    <DuckDubView
      confirmed={confirmed}
      isDeleting={isDeleting}
      line={activeLine}
      loadError={loadError || operationError}
      onConfirm={setConfirmed}
      onDelete={() => void handleDelete()}
      onHearGuide={handleHearGuide}
      onHearTake={() => void handleHearTake()}
      onNext={handleNext}
      onRecord={() => void handleRecord()}
      onRetake={handleRetake}
      onRetryLoad={() => setLoadSequence((current) => current + 1)}
      onSaveAgain={handleSaveAgain}
      onSelectLine={handleSelectLine}
      onStopPlayback={handleStopPlayback}
      onStopRecording={() => void finishRecording()}
      onWatch={() => void handleWatch()}
      recordButtonRef={recordButtonRef}
      state={state.error || !operationError ? state : { ...state, error: operationError }}
    />
  );
}
