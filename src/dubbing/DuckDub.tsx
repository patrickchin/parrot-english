"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getStaticAudioLineForSpeech } from "../../lib/static-audio";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { isAbortError, playAudioLine } from "../media/audio-playback";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { ActionButton, TextButton } from "../shared/ui";
import {
  deleteDub,
  DubResetInProgressError,
  DubTakeRejectedError,
  getDubLineAudioUrl,
  loadDubStatus,
  saveDubLine,
} from "./dub-api";
import { startDubPlayback, type DubAudioSource } from "./dub-playback";
import { DubProjectHome } from "./DubProjectHome";
import { DubSceneEditor } from "./DubSceneEditor";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_RECORDING_MS,
  DUB_VERSES,
  getDubLineAtElapsed,
  getDubVerseLineAtElapsed,
  type DubLine,
} from "./dub-script";
import { createInitialDubState, reduceDubState } from "./dub-state";

type TakePreview = {
  blob: Blob;
  lineId: string;
  url: string;
};

function microphoneMessage(error: unknown) {
  if (error instanceof RecordingUnsupportedError) {
    return "This browser cannot record yet. Try another device or browser.";
  }
  if (error instanceof MicrophoneAccessError) {
    return "The microphone is off. Ask a grown-up to allow it, then try again.";
  }
  return "The microphone did not start. Try recording again.";
}

function unavailableLineMessage(lineId: string) {
  const lineIndex = DUB_LINES.findIndex(({ id }) => id === lineId);
  const sceneNumber = Math.floor(lineIndex / DUB_LINES_PER_VERSE) + 1;
  const lineNumber = lineIndex % DUB_LINES_PER_VERSE + 1;
  return `Scene ${sceneNumber}, line ${lineNumber} could not play. The video will continue without it.`;
}

function DubEntry({
  confirmed,
  deleting,
  error,
  onConfirm,
  onDelete,
  onEnter,
  onRetryLoad,
  resetInterrupted,
  savedCount,
}: {
  confirmed: boolean;
  deleting: boolean;
  error: string;
  onConfirm(confirmed: boolean): void;
  onDelete(): void;
  onEnter(): void;
  onRetryLoad(): void;
  resetInterrupted: boolean;
  savedCount: number;
}) {
  const loading = error !== "" || resetInterrupted;
  return (
    <main className="min-h-dvh overflow-x-hidden bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl border-4 border-white bg-white/90 p-5 shadow-card">
        <h1 className="m-0 text-3xl text-brand-ink md:text-5xl">Five Little Ducks</h1>
        {loading ? (
          <>
            <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
              {error}
            </p>
            {deleting ? (
              <ActionButton disabled>Deleting your dub…</ActionButton>
            ) : resetInterrupted ? (
              <ActionButton onClick={onDelete} variant="dangerSurface">Finish deleting my dub</ActionButton>
            ) : (
              <ActionButton onClick={onRetryLoad}>Try loading again</ActionButton>
            )}
          </>
        ) : (
          <>
            <p className="m-0 font-bold leading-snug text-slate-700">
              Your recordings are private and saved to the signed-in grown-up&apos;s account.
              You can replay or replace them here, and they are deleted with the account.
            </p>
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
            <ActionButton disabled={!confirmed || deleting} fullWidth onClick={onEnter} size="hero">
              {savedCount > 0 ? "Continue dubbing" : "Start dubbing"}
            </ActionButton>
            <details className="group rounded-2xl border-3 border-sky-200 bg-sky-50 p-3">
              <summary
                aria-label="Grown-up options"
                className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 font-ui font-black text-brand-blue"
              >
                Grown-up options <span aria-hidden="true">▾</span>
              </summary>
              <TextButton className="mt-3 min-h-12 text-red-800" onClick={onDelete}>
                Delete saved recordings
              </TextButton>
            </details>
          </>
        )}
      </section>
    </main>
  );
}

function DubLoading({
  deleting,
  error,
  onDelete,
  onRetryLoad,
  resetInterrupted,
}: {
  deleting: boolean;
  error: string;
  onDelete(): void;
  onRetryLoad(): void;
  resetInterrupted: boolean;
}) {
  if (error) {
    return (
      <DubEntry
        confirmed={false}
        deleting={deleting}
        error={error}
        onConfirm={() => {}}
        onDelete={onDelete}
        onEnter={() => {}}
        onRetryLoad={onRetryLoad}
        resetInterrupted={resetInterrupted}
        savedCount={0}
      />
    );
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-story-shelf px-3 pt-20">
      <section className="grid justify-items-center gap-4">
        <h1 className="m-0 text-3xl text-brand-ink md:text-5xl">Five Little Ducks</h1>
        <ActionButton disabled>Loading your private dub…</ActionButton>
      </section>
    </main>
  );
}

export function DuckDub() {
  const [state, dispatch] = useReducer(reduceDubState, undefined, createInitialDubState);
  const [confirmed, setConfirmed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadSequence, setLoadSequence] = useState(0);
  const [playbackLineIndex, setPlaybackLineIndex] = useState(0);
  const [resetInterrupted, setResetInterrupted] = useState(false);
  const [takePreview, setTakePreview] = useState<TakePreview | null>(null);

  const mountedRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);
  const deleteControllerRef = useRef<AbortController | null>(null);
  const guideControllerRef = useRef<AbortController | null>(null);
  const takeControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const playbackControllerRef = useRef<AbortController | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingSessionRef = useRef<SpeechRecordingSession | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRef = useRef<{ stop(): void } | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingLineIdRef = useRef<string | null>(null);
  const takePreviewRef = useRef<TakePreview | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);

  const clearTakePreview = useCallback(() => {
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
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

  const cancelMedia = useCallback((discardTake: boolean) => {
    mediaGenerationRef.current += 1;
    guideControllerRef.current?.abort();
    guideControllerRef.current = null;
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    playbackControllerRef.current?.abort();
    playbackControllerRef.current = null;
    playbackRef.current?.stop();
    playbackRef.current = null;
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (discardTake) {
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      clearTakePreview();
    }
    return mediaGenerationRef.current;
  }, [clearTakePreview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statusControllerRef.current?.abort();
      deleteControllerRef.current?.abort();
      cancelMedia(true);
    };
  }, [cancelMedia]);

  useEffect(() => {
    const controller = new AbortController();
    statusControllerRef.current = controller;
    setLoadError("");
    setResetInterrupted(false);
    void loadDubStatus({ signal: controller.signal })
      .then((status) => {
        if (!mountedRef.current || statusControllerRef.current !== controller) return;
        dispatch({
          type: "LOADED",
          savedLineIds: status.lines.filter(({ saved }) => saved).map(({ id }) => id),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        setResetInterrupted(error instanceof DubResetInProgressError);
        setLoadError(error instanceof Error ? error.message : "Your saved dub could not be loaded.");
      })
      .finally(() => {
        if (statusControllerRef.current === controller) statusControllerRef.current = null;
      });
    return () => controller.abort();
  }, [loadSequence]);

  async function uploadPendingTake(generation: number) {
    const blob = pendingBlobRef.current;
    const lineId = pendingLineIdRef.current;
    if (!blob || !lineId) {
      clearTakePreview();
      dispatch({
        type: "SAVE_FAILED",
        message: "There is no new take to save. Record the line again.",
        recovery: "record",
      });
      return;
    }
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    try {
      const result = await saveDubLine(lineId, blob, { signal: controller.signal });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "SAVE_SUCCEEDED", lineId, recordedAt: result.recordedAt });
      requestAnimationFrame(() => {
        if (mountedRef.current && generation === mediaGenerationRef.current) {
          recordButtonRef.current?.focus();
        }
      });
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current) return;
      const rejected = error instanceof DubTakeRejectedError;
      if (rejected) {
        pendingBlobRef.current = null;
        pendingLineIdRef.current = null;
        clearTakePreview();
      }
      dispatch({
        type: "SAVE_FAILED",
        message: error instanceof Error ? error.message : "Your take was not saved. Try again.",
        recovery: rejected ? "record" : "save",
      });
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
    }
  }

  async function finishRecording(generation = mediaGenerationRef.current) {
    if (generation !== mediaGenerationRef.current) return;
    const session = recordingSessionRef.current;
    if (!session) return;
    recordingSessionRef.current = null;
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      const blob = await session.stop();
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      recordingControllerRef.current = null;
      const lineId = pendingLineIdRef.current;
      if (!lineId) return;
      pendingBlobRef.current = blob;
      replaceTakePreview(blob, lineId);
      dispatch({ type: "OPERATION_STARTED", operation: "saving" });
      await uploadPendingTake(generation);
    } catch (error) {
      if (generation !== mediaGenerationRef.current || isAbortError(error)) return;
      recordingControllerRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: "The recording did not finish. Try recording the line again." });
    }
  }

  async function startRecording() {
    const generation = cancelMedia(true);
    const lineId = DUB_LINES[state.selectedLineIndex].id;
    const controller = new AbortController();
    recordingControllerRef.current = controller;
    pendingLineIdRef.current = lineId;
    dispatch({ type: "OPERATION_STARTED", operation: "mic-opening" });
    try {
      const session = await startSpeechRecording({ signal: controller.signal });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) {
        session.cancel();
        return;
      }
      recordingSessionRef.current = session;
      dispatch({ type: "OPERATION_STARTED", operation: "recording" });
      recordingTimerRef.current = setTimeout(() => {
        void finishRecording(generation);
      }, DUB_RECORDING_MS);
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current) return;
      recordingControllerRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: microphoneMessage(error) });
      requestAnimationFrame(() => recordButtonRef.current?.focus());
    }
  }

  function handleRecord() {
    if (state.operation === "recording") {
      void finishRecording();
      return;
    }
    void startRecording();
  }

  function handleHearGuide() {
    const generation = cancelMedia(false);
    const controller = new AbortController();
    guideControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "guide-playing" });
    let guide;
    try {
      guide = getStaticAudioLineForSpeech("narrator", DUB_LINES[state.selectedLineIndex].text);
    } catch {
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: "I could not play that example. You can still record the words you see." });
      return;
    }
    void playAudioLine({
      audioId: guide.id,
      audioSrc: guide.src,
      lang: guide.lang,
      signal: controller.signal,
      text: guide.text,
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbortError(error)) return;
      dispatch({ type: "SET_ERROR", message: "I could not play that example. You can still record the words you see." });
    }).finally(() => {
      if (generation !== mediaGenerationRef.current || guideControllerRef.current !== controller) return;
      guideControllerRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
    });
  }

  function handleHearTake() {
    if (state.operation === "take-playing") {
      cancelMedia(false);
      dispatch({ type: "OPERATION_FINISHED" });
      return;
    }
    const preview = takePreviewRef.current;
    if (!preview) return;
    const generation = cancelMedia(false);
    const controller = new AbortController();
    takeControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "take-playing" });
    const line = DUB_LINES.find(({ id }) => id === preview.lineId) ?? DUB_LINES[state.selectedLineIndex];
    void playAudioLine({ audioSrc: preview.url, signal: controller.signal, text: line.text })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        dispatch({ type: "SET_ERROR", message: "Your recording could not be played. Record the line again." });
      })
      .finally(() => {
        if (generation !== mediaGenerationRef.current || takeControllerRef.current !== controller) return;
        takeControllerRef.current = null;
        dispatch({ type: "OPERATION_FINISHED" });
      });
  }

  function resolveLineAudio(line: DubLine): DubAudioSource {
    const guide = getStaticAudioLineForSpeech("narrator", line.text);
    return Object.hasOwn(state.saved, line.id)
      ? { preferredUrl: getDubLineAudioUrl(line.id), fallbackUrl: guide.src }
      : { preferredUrl: guide.src };
  }

  async function startPlayback(scope: "full" | "scene") {
    if (state.saveRecovery === "save") return;
    if (
      (state.operation === "playback" || state.operation === "playback-loading")
      && state.playbackScope === scope
    ) {
      cancelMedia(false);
      dispatch({ type: "OPERATION_FINISHED" });
      return;
    }
    const generation = cancelMedia(false);
    const controller = new AbortController();
    const sceneIndex = state.selectedSceneIndex;
    const lines = scope === "full" ? DUB_LINES : DUB_VERSES[sceneIndex];
    let unavailableMessage = "";
    playbackControllerRef.current = controller;
    setPlaybackLineIndex(scope === "full" ? 0 : sceneIndex * DUB_LINES_PER_VERSE);
    dispatch({ type: "OPERATION_STARTED", operation: "playback-loading", playbackScope: scope });
    try {
      const playback = await startDubPlayback({
        lines,
        onEnded() {
          if (generation !== mediaGenerationRef.current) return;
          playbackRef.current = null;
          playbackControllerRef.current = null;
          dispatch({ type: "OPERATION_FINISHED" });
        },
        onLineFallback(lineId) {
          dispatch({ type: "MARK_NEEDS_RETAKE", lineId });
        },
        onLineUnavailable(lineId) {
          unavailableMessage = unavailableLineMessage(lineId);
        },
        onTick(elapsedMs) {
          if (generation !== mediaGenerationRef.current) return;
          const line = scope === "full"
            ? getDubLineAtElapsed(elapsedMs)
            : getDubVerseLineAtElapsed(sceneIndex, elapsedMs);
          setPlaybackLineIndex(DUB_LINES.indexOf(line));
        },
        resolveAudioSource: resolveLineAudio,
        signal: controller.signal,
      });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) {
        playback.stop();
        return;
      }
      playbackRef.current = playback;
      dispatch({ type: "OPERATION_STARTED", operation: "playback", playbackScope: scope });
      if (unavailableMessage) dispatch({ type: "SET_ERROR", message: unavailableMessage });
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
      playbackControllerRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: "The video could not start. Try again." });
    }
  }

  function handleContinue() {
    if (state.saveRecovery === "save") return;
    cancelMedia(true);
    dispatch({ type: "OPERATION_FINISHED" });
    dispatch({ type: "CONTINUE" });
  }

  function handleOpenScene(sceneIndex: number) {
    if (state.saveRecovery === "save") return;
    cancelMedia(true);
    dispatch({ type: "OPERATION_FINISHED" });
    dispatch({ type: "OPEN_SCENE", sceneIndex });
  }

  function handleSelectLine(lineId: string) {
    if (state.saveRecovery === "save") return;
    cancelMedia(true);
    dispatch({ type: "OPERATION_FINISHED" });
    dispatch({ type: "SELECT_LINE", lineId });
  }

  function handleBack() {
    if (state.saveRecovery === "save") return;
    cancelMedia(true);
    dispatch({ type: "OPERATION_FINISHED" });
    dispatch({ type: "BACK_TO_PROJECT" });
  }

  function handleRetrySave() {
    const generation = cancelMedia(false);
    dispatch({ type: "OPERATION_STARTED", operation: "saving" });
    void uploadPendingTake(generation);
  }

  async function handleDelete() {
    if (!window.confirm("Grown-up: delete every saved voice clip in this dub?")) return;
    cancelMedia(true);
    statusControllerRef.current?.abort();
    statusControllerRef.current = null;
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    setLoadError("");
    dispatch({ type: "OPERATION_STARTED", operation: "deleting" });
    try {
      await deleteDub({ signal: controller.signal });
      if (!mountedRef.current || deleteControllerRef.current !== controller) return;
      setConfirmed(false);
      setResetInterrupted(false);
      setPlaybackLineIndex(0);
      dispatch({ type: "RESET_SUCCEEDED" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setResetInterrupted(false);
      setLoadError(error instanceof Error ? error.message : "Your saved dub was not deleted.");
      dispatch({ type: "OPERATION_FINISHED" });
    } finally {
      if (deleteControllerRef.current === controller) deleteControllerRef.current = null;
    }
  }

  function handleRetryLoad() {
    setLoadError("");
    setResetInterrupted(false);
    dispatch({ type: "SET_ERROR", message: "" });
    setLoadSequence((sequence) => sequence + 1);
  }

  const selectedLine = DUB_LINES[state.selectedLineIndex];
  const activeLine = state.operation === "playback" || state.operation === "playback-loading"
    ? DUB_LINES[playbackLineIndex]
    : selectedLine;
  const deleting = state.operation === "deleting";

  let content;
  if (state.view === "loading") {
    content = (
      <DubLoading
        deleting={deleting}
        error={loadError}
        onDelete={() => void handleDelete()}
        onRetryLoad={handleRetryLoad}
        resetInterrupted={resetInterrupted}
      />
    );
  } else if (state.view === "intro") {
    content = (
      <DubEntry
        confirmed={confirmed}
        deleting={deleting}
        error={loadError}
        onConfirm={setConfirmed}
        onDelete={() => void handleDelete()}
        onEnter={() => confirmed && dispatch({ type: "CONFIRMED" })}
        onRetryLoad={handleRetryLoad}
        resetInterrupted={resetInterrupted}
        savedCount={Object.keys(state.saved).length}
      />
    );
  } else if (state.view === "project") {
    content = (
      <DubProjectHome
        activeLine={activeLine}
        error={state.error}
        needsRetake={new Set(Object.keys(state.needsRetake))}
        onContinue={handleContinue}
        onDelete={() => void handleDelete()}
        onOpenScene={handleOpenScene}
        onTogglePlayback={() => void startPlayback("full")}
        playback={state.playbackScope === "full"
          ? state.operation === "playback"
            ? "playing"
            : state.operation === "playback-loading"
              ? "loading"
              : "idle"
          : "idle"}
        saved={state.saved}
      />
    );
  } else {
    content = (
      <DubSceneEditor
        activeLine={activeLine}
        activeSceneIndex={state.selectedSceneIndex}
        error={state.error}
        needsRetake={new Set(Object.keys(state.needsRetake))}
        onBack={handleBack}
        onHearGuide={handleHearGuide}
        onHearTake={handleHearTake}
        onRecord={handleRecord}
        onRetrySave={handleRetrySave}
        onSelectLine={handleSelectLine}
        onToggleScenePlayback={() => void startPlayback("scene")}
        operation={state.operation}
        pendingTake={takePreview?.blob ?? null}
        recordButtonRef={recordButtonRef}
        saveRecovery={state.saveRecovery}
        saved={state.saved}
      />
    );
  }

  return (
    <>
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
          Back home
        </HeaderLink>
      </RouteHeader>
      {content}
    </>
  );
}
