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
import { getStaticAudioLineForSpeech } from "../../lib/static-audio";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { isAbortError, playAudioLine } from "../media/audio-playback";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { ActionButton, fieldClassName, TextButton } from "../shared/ui";
import {
  DubNotEnabledError,
  DubTakeRejectedError,
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
import { DubTakeWaveform } from "./DubTakeWaveform";

type TakePreview = {
  blob: Blob;
  lineId: string;
  url: string;
};

type DubHandlers = {
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
  onStopTake(): void;
  onWatch(): void;
};

type DubControlsProps = {
  activeLine: DubLine;
  handlers: DubHandlers;
  loadError?: string;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  state: DubState;
};

function dubStatusMessage({
  lineIndex,
  loadError,
  recordingEnabled,
  state,
}: {
  lineIndex: number;
  loadError: string;
  recordingEnabled: boolean;
  state: DubState;
}) {
  const line = `Line ${lineIndex + 1} of ${DUB_LINES.length}.`;
  if (state.phase === "loading") {
    return loadError
      ? "Loading stopped. Try loading again."
      : "Loading your private dub.";
  }
  if (state.phase === "intro") {
    return recordingEnabled
      ? "Choose Start dubbing to begin."
      : "Ask a grown-up to turn on voice dubbing in Guardian mode.";
  }
  if (state.phase === "line-ready") {
    return `${line} Listen to the example, then record this line.`;
  }
  if (state.phase === "mic-opening") {
    return `${line} Opening the microphone.`;
  }
  if (state.phase === "recording") {
    return `${line} Recording in progress.`;
  }
  if (state.phase === "saving") {
    return `${line} Saving your take.`;
  }
  if (state.phase === "save-error") {
    return `${line} Choose ${state.saveRecovery === "record" ? "Record again" : "Save again"}.`;
  }
  if (state.phase === "line-review") {
    return `${line} Your take is saved. Hear your voice or choose Next line.`;
  }
  if (state.phase === "final-ready") {
    return "Your complete dub is ready. Choose Watch my dub.";
  }
  if (state.phase === "final-loading") {
    return "Getting your dub ready to play.";
  }
  return `Playing your dub. ${line}`;
}

function renderDubControls({
  activeLine,
  handlers,
  loadError = "",
  recordButtonRef,
  state,
}: DubControlsProps) {
  const lineNumber = Math.max(0, DUB_LINES.findIndex(({ id }) => id === activeLine.id)) + 1;
  const complete = DUB_LINES.every(({ id }) => id in state.saved);
  if (state.phase === "loading") {
    return loadError ? <ActionButton onClick={handlers.onRetryLoad}>Try loading again</ActionButton> : (
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
    return state.saveRecovery === "record" ? (
      <ActionButton fullWidth onClick={handlers.onRetake} size="hero" variant="rose">
        Record again
      </ActionButton>
    ) : (
      <ActionButton fullWidth onClick={handlers.onSaveAgain} size="hero">Save again</ActionButton>
    );
  }
  if (state.phase === "line-review") {
    return (
      <>
        <ActionButton fullWidth onClick={handlers.onNext} size="hero">
          Next line
        </ActionButton>
        <TextButton className="min-h-12" onClick={handlers.onRetake}>Record again</TextButton>
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
    return (
      <>
        <ActionButton fullWidth onClick={handlers.onWatch} size="hero" variant="success">
          <Play aria-hidden="true" /> Watch my dub
        </ActionButton>
        <details className="group rounded-2xl border-3 border-sky-200 bg-sky-50 p-3">
          <summary
            aria-label="Record another take"
            className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 font-ui font-black text-brand-blue focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
          >
            Record another take
            <span aria-hidden="true" className="group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-3 grid gap-3">
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
            <TextButton className="min-h-12" onClick={handlers.onRetake}>Record selected line</TextButton>
          </div>
        </details>
      </>
    );
  }
  return (
    <>
      <ActionButton
        aria-label={`Record line ${lineNumber}`}
        className="short-wide:min-h-12 short-wide:px-4 short-wide:text-base"
        fullWidth
        onClick={handlers.onRecord}
        ref={recordButtonRef}
        size="hero"
        variant="rose"
      >
        <Mic aria-hidden="true" /> Record
      </ActionButton>
      {complete ? (
        <TextButton className="min-h-12" onClick={handlers.onNext}>Back to my dub</TextButton>
      ) : null}
      <TextButton
        aria-label="Replay example"
        className="min-h-12 gap-2"
        onClick={handlers.onHearGuide}
      >
        <Volume2 aria-hidden="true" /> Replay example
      </TextButton>
    </>
  );
}

export function DuckDubView({
  line,
  loadError = "",
  mainRef,
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
  onStopTake,
  onWatch,
  recordButtonRef,
  recordingEnabled,
  state,
  takeBlob = null,
  takePlaying = false,
}: Omit<DubHandlers, "onRetryLoad"> & {
  line: DubLine;
  loadError?: string;
  mainRef?: RefObject<HTMLElement | null>;
  onRetryLoad?(): void;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  recordingEnabled: boolean;
  state: DubState;
  takeBlob?: Blob | null;
  takePlaying?: boolean;
}) {
  const lineIndex = Math.max(0, DUB_LINES.findIndex(({ id }) => id === line.id));
  const isFinalReady = state.phase === "final-ready";
  const error = state.error || loadError;
  const statusMessage = dubStatusMessage({
    lineIndex,
    loadError,
    recordingEnabled,
    state,
  });
  const handlers: DubHandlers = {
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
    onStopTake,
    onWatch,
  };
  const showTakePreview = takeBlob !== null && (
    state.phase === "saving" ||
    state.phase === "save-error" ||
    state.phase === "line-review"
  );

  return (
    <main
      className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-story-shelf px-3 pb-5 pt-20 short-wide:!pb-2 short-wide:!pt-16 md:px-6 md:pb-6 md:pt-24"
      ref={mainRef}
    >
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
        className="mx-auto grid w-full max-w-[1600px] gap-4 short-wide:h-[calc(100dvh-4.5rem)] short-wide:min-h-0 short-wide:grid-cols-[minmax(0,1.6fr)_minmax(15rem,0.9fr)] short-wide:gap-3 lg:min-h-[calc(100dvh-7.5rem)] lg:grid-cols-[minmax(0,2fr)_minmax(20rem,0.78fr)]"
      >
        <div className={state.phase === "intro" ? "hidden sm:contents" : "contents"}>
          <DuckScene line={line} playing={state.phase === "final-playing"} />
        </div>
        <section
          aria-label="Dubbing controls"
          className="grid content-center gap-4 rounded-3xl border-4 border-white bg-white/90 p-4 shadow-card short-wide:gap-2 short-wide:rounded-2xl short-wide:p-2 md:p-5"
        >
          <div className="grid gap-2 short-wide:gap-1">
            <div className="flex items-center justify-between gap-3">
              <h1 className="m-0 text-xl leading-none text-brand-ink short-wide:text-base md:text-2xl" id="dub-title">
                Five Little Ducks
              </h1>
              {state.phase !== "intro" ? (
                <p
                  aria-label={isFinalReady
                    ? `All ${DUB_LINES.length} lines recorded`
                    : `Line ${lineIndex + 1} of ${DUB_LINES.length}`}
                  className="m-0 shrink-0 text-xs font-black uppercase tracking-wider text-brand-blue short-wide:text-[0.65rem] md:text-sm"
                >
                  {isFinalReady
                    ? `All ${DUB_LINES.length} lines recorded`
                    : `Line ${lineIndex + 1} of ${DUB_LINES.length}`}
                </p>
              ) : null}
            </div>
            {state.phase !== "intro" ? (
              <progress
                aria-label="Dubbing progress"
                className="h-2 w-full overflow-hidden rounded-full accent-brand-blue short-wide:h-1"
                max={DUB_LINES.length}
                value={isFinalReady ? DUB_LINES.length : lineIndex + 1}
              />
            ) : null}
          </div>
          {state.phase !== "intro" ? (
            isFinalReady ? (
              <p className="m-0 text-3xl font-black leading-tight text-brand-ink">
                Your dub is ready!
              </p>
            ) : (
              <section
                aria-label="Current line"
                aria-current="step"
                className="grid gap-2 rounded-3xl border-3 border-sky-200 bg-sky-50 p-4 short-wide:gap-1 short-wide:rounded-2xl short-wide:p-2"
              >
                <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-brand-blue short-wide:text-[0.625rem]">
                  Now read
                </p>
                <p className="m-0 text-3xl font-black leading-tight text-brand-ink short-wide:text-xl md:text-4xl">
                  {line.text}
                </p>
              </section>
            )
          ) : null}
          {state.phase === "intro" ? (
            <p className="m-0 text-sm font-bold leading-snug text-slate-700">
              {recordingEnabled
                ? "Your voice clips stay private in this account."
                : "Ask a grown-up to turn on voice dubbing in Guardian mode."}
            </p>
          ) : null}
          {state.phase === "intro" ? (
            recordingEnabled ? (
              <div className="grid gap-4">
                <ActionButton fullWidth onClick={handlers.onNext} size="hero">
                  {Object.keys(state.saved).length > 0 ? "Continue dubbing" : "Start dubbing"}
                </ActionButton>
              </div>
            ) : null
          ) : (
            <div className="grid gap-3 short-wide:gap-2">
              {showTakePreview ? (
                <section
                  aria-label="Your recorded line"
                  className="grid gap-2 rounded-2xl border-3 border-cyan-200 bg-cyan-50 p-3"
                >
                  <p className="m-0 text-sm font-black uppercase tracking-wider text-brand-blue">
                    Your voice
                  </p>
                  <DubTakeWaveform blob={takeBlob} />
                  <TextButton
                    aria-label={takePlaying ? "Stop my voice" : "Hear my voice"}
                    className="min-h-12 gap-2"
                    onClick={takePlaying ? handlers.onStopTake : handlers.onHearTake}
                  >
                    {takePlaying ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                    {takePlaying ? "Stop my voice" : "Hear my voice"}
                  </TextButton>
                </section>
              ) : null}
              {renderDubControls({
                activeLine: line,
                handlers,
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
            {statusMessage}
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
  const [loadError, setLoadError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [loadSequence, setLoadSequence] = useState(0);
  const [playbackLineIndex, setPlaybackLineIndex] = useState(0);
  const [takePlaying, setTakePlaying] = useState(false);
  const [takePreview, setTakePreview] = useState<TakePreview | null>(null);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);
  const guideControllerRef = useRef<AbortController | null>(null);
  const takeControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const finalControllerRef = useRef<AbortController | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingSessionRef = useRef<SpeechRecordingSession | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingLineIdRef = useRef<string | null>(null);
  const takePreviewRef = useRef<TakePreview | null>(null);
  const finalPlaybackRef = useRef<{ stop(): void } | null>(null);

  const clearTakePreview = useCallback(() => {
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    setTakePlaying(false);
    const preview = takePreviewRef.current;
    takePreviewRef.current = null;
    if (preview) URL.revokeObjectURL(preview.url);
    setTakePreview(null);
  }, []);

  const replaceTakePreview = useCallback((blob: Blob, lineId: string) => {
    clearTakePreview();
    const preview = { blob, lineId, url: URL.createObjectURL(blob) };
    takePreviewRef.current = preview;
    setTakePreview(preview);
  }, [clearTakePreview]);

  const stopOperations = useCallback((discardBlob = false) => {
    generationRef.current += 1;
    statusControllerRef.current?.abort();
    statusControllerRef.current = null;
    guideControllerRef.current?.abort();
    guideControllerRef.current = null;
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    setTakePlaying(false);
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    finalControllerRef.current?.abort();
    finalControllerRef.current = null;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    finalPlaybackRef.current?.stop();
    finalPlaybackRef.current = null;
    if (discardBlob) {
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      clearTakePreview();
    }
  }, [clearTakePreview]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const generation = generationRef.current;
    statusControllerRef.current = controller;
    setLoadError("");
    void loadDubStatus({ signal: controller.signal })
      .then((status) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setRecordingEnabled(status.recordingEnabled);
        dispatch({
          type: "LOADED",
          savedLineIds: status.recordingEnabled
            ? status.lines.filter(({ saved }) => saved).map(({ id }) => id)
            : [],
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
      dispatch({
        type: "SAVE_FAILED",
        message: "There is no new take to save. Record the line again.",
        recovery: "record",
      });
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
      if (error instanceof DubNotEnabledError) {
        stopOperations(true);
        setLoadError("");
        setOperationError("");
        setRecordingEnabled(false);
        dispatch({ type: "LOADED", savedLineIds: [] });
        return;
      }
      dispatch({
        type: "SAVE_FAILED",
        message: error instanceof Error ? error.message : "Your take was not saved. Try again.",
        recovery: error instanceof DubTakeRejectedError ? "record" : "save",
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
      const lineId = pendingLineIdRef.current;
      if (lineId) replaceTakePreview(blob, lineId);
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

  function playGuide(lineIndex: number) {
    guideControllerRef.current?.abort();
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    setTakePlaying(false);
    const generation = generationRef.current;
    const controller = new AbortController();
    guideControllerRef.current = controller;
    setOperationError("");
    let guide;
    try {
      guide = getStaticAudioLineForSpeech("narrator", DUB_LINES[lineIndex].text);
    } catch {
      setOperationError("I could not play that example. You can still record the words you see.");
      return;
    }
    void playAudioLine({
      audioId: guide.id,
      audioSrc: guide.src,
      lang: guide.lang,
      signal: controller.signal,
      text: guide.text,
    })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current || isAbortError(error)) return;
        setOperationError("I could not play that example. You can still record the words you see.");
      })
      .finally(() => {
        if (guideControllerRef.current === controller) guideControllerRef.current = null;
      });
  }

  function handleHearGuide() {
    playGuide(state.currentLineIndex);
  }

  function handleHearTake() {
    const preview = takePreviewRef.current;
    if (!preview) return;
    guideControllerRef.current?.abort();
    guideControllerRef.current = null;
    takeControllerRef.current?.abort();
    const controller = new AbortController();
    takeControllerRef.current = controller;
    setOperationError("");
    setTakePlaying(true);
    void playAudioLine({
      audioSrc: preview.url,
      signal: controller.signal,
      text: DUB_LINES[state.currentLineIndex].text,
    })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setOperationError("Your recording could not be played. Record the line again.");
      })
      .finally(() => {
        if (takeControllerRef.current !== controller) return;
        takeControllerRef.current = null;
        setTakePlaying(false);
      });
  }

  function handleStopTake() {
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    setTakePlaying(false);
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
      if (error instanceof DubLinePlaybackError && error.stage === "decode") {
        dispatch({ type: "SELECT_LINE", lineId: error.lineId });
        dispatch({ type: "RETAKE" });
        const lineIndex = DUB_LINES.findIndex(({ id }) => id === error.lineId);
        if (lineIndex >= 0) playGuide(lineIndex);
        setOperationError("That take could not play. Record this line again.");
        requestAnimationFrame(() => {
          if (mountedRef.current && generation === generationRef.current) {
            recordButtonRef.current?.focus();
          }
        });
        return;
      }
      dispatch({ type: "FINAL_FINISHED" });
      setOperationError("Your saved dub could not be played. Try again.");
    }
  }

  function handleStopPlayback() {
    stopOperations(false);
    dispatch({ type: "FINAL_FINISHED" });
  }

  function handleRetake() {
    stopOperations(true);
    setOperationError("");
    dispatch({ type: "RETAKE" });
    playGuide(state.currentLineIndex);
  }

  function handleSelectLine(lineId: string) {
    setOperationError("");
    dispatch({ type: "SELECT_LINE", lineId });
  }

  function handleNext() {
    if (state.phase === "intro") {
      if (recordingEnabled) {
        const nextState = reduceDubState(state, { type: "STARTED" });
        scrollContainerRef.current?.scrollTo({ top: 0 });
        dispatch({ type: "STARTED" });
        if (nextState.phase === "line-ready") playGuide(nextState.currentLineIndex);
      }
      return;
    }
    stopOperations(true);
    setOperationError("");
    const nextState = reduceDubState(state, { type: "NEXT_LINE" });
    dispatch({ type: "NEXT_LINE" });
    if (nextState.phase === "line-ready") playGuide(nextState.currentLineIndex);
  }

  function handleSaveAgain() {
    stopOperations(false);
    const generation = generationRef.current;
    dispatch({ type: "SAVE_STARTED" });
    void uploadPendingBlob(generation);
  }

  function handleRetryLoad() {
    setOperationError("");
    setLoadSequence((current) => current + 1);
  }

  const activeLine =
    state.phase === "final-playing"
      ? DUB_LINES[playbackLineIndex]
      : DUB_LINES[state.currentLineIndex];

  return (
    <DuckDubView
      line={activeLine}
      loadError={loadError || operationError}
      mainRef={scrollContainerRef}
      onHearGuide={handleHearGuide}
      onHearTake={handleHearTake}
      onNext={handleNext}
      onRecord={() => void handleRecord()}
      onRetake={handleRetake}
      onRetryLoad={handleRetryLoad}
      onSaveAgain={handleSaveAgain}
      onSelectLine={handleSelectLine}
      onStopPlayback={handleStopPlayback}
      onStopRecording={() => void finishRecording()}
      onStopTake={handleStopTake}
      onWatch={() => void handleWatch()}
      recordButtonRef={recordButtonRef}
      recordingEnabled={recordingEnabled}
      state={state.error || !operationError ? state : { ...state, error: operationError }}
      takeBlob={takePreview?.blob}
      takePlaying={takePlaying}
    />
  );
}
