"use client";

import { ChevronLeft } from "lucide-react";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";
import { getStaticAudioLineForSpeech } from "../../lib/static-audio";
import { HeaderButton, HeaderLink, RouteHeader } from "../app/AppHeader";
import { isAbortError, playAudioLine } from "../media/audio-playback";
import {
  MicrophoneAccessError,
  RecordingUnsupportedError,
  startSpeechRecording,
  type SpeechRecordingSession,
} from "../media/speech-recorder";
import { ActionButton } from "../shared/ui";
import {
  DubNotEnabledError,
  DubTakeRejectedError,
  getDubLineAudioUrl,
  loadDubLineAudio,
  loadDubStatus,
  saveDubLine,
} from "./dub-api";
import { startDubPlayback, type DubAudioSource } from "./dub-playback";
import { DubProjectHome } from "./DubProjectHome";
import { DubSceneEditor } from "./DubSceneEditor";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import {
  createInitialDubState,
  reduceDubState,
  type DubOperation,
} from "./dub-state";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

type TakePreview = {
  blob: Blob;
  lineId: string;
  url: string;
};

function getSceneLines(definition: DubDefinition) {
  return Array.from(
    { length: definition.lines.length / definition.linesPerScene },
    (_, index) => definition.lines.slice(
      index * definition.linesPerScene,
      (index + 1) * definition.linesPerScene,
    ),
  );
}

function getLineIndex(definition: DubDefinition, lineId: string) {
  return definition.lines.findIndex((line) => line.id === lineId);
}

function getDubLineAtElapsed(definition: DubDefinition, elapsedMs: number) {
  return [...definition.lines].reverse().find(({ cueMs }) => elapsedMs >= cueMs)
    ?? definition.lines[0];
}

function getDubSceneLineAtElapsed(
  definition: DubDefinition,
  sceneIndex: number,
  elapsedMs: number,
) {
  const sceneLines = getSceneLines(definition)[sceneIndex];
  if (!sceneLines) throw new RangeError("Unknown dub scene.");
  const cueOffsetMs = sceneLines[0].cueMs;
  return [...sceneLines].reverse().find(
    ({ cueMs }) => elapsedMs >= cueMs - cueOffsetMs,
  ) ?? sceneLines[0];
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

function unavailableLineMessage(definition: DubDefinition, lineId: string) {
  const lineIndex = getLineIndex(definition, lineId);
  const sceneNumber = Math.floor(lineIndex / definition.linesPerScene) + 1;
  const lineNumber = lineIndex % definition.linesPerScene + 1;
  return `Scene ${sceneNumber}, line ${lineNumber} could not play. The video will continue without it.`;
}

function isUnsafeOperation(operation: DubOperation) {
  return operation === "mic-opening"
    || operation === "recording"
    || operation === "saving";
}

function isControlLocked(operation: DubOperation) {
  return operation === "mic-opening"
    || operation === "saving";
}

export function resolveDubLineAudioSource(
  line: { id: string; text: string },
  saved: Readonly<Record<string, string>>,
  resolveGuide: typeof getStaticAudioLineForSpeech = getStaticAudioLineForSpeech,
  dubId: string = FIVE_LITTLE_DUCKS_DUB.id,
): DubAudioSource {
  if (Object.hasOwn(saved, line.id)) {
    const preferredUrl = getDubLineAudioUrl(line.id, { dubId });
    try {
      return {
        fallbackUrl: resolveGuide("narrator", line.text).src,
        preferredUrl,
      };
    } catch {
      return { preferredUrl };
    }
  }
  return { preferredUrl: resolveGuide("narrator", line.text).src };
}

export function DubEntry({
  error,
  onRetryLoad,
  title = FIVE_LITTLE_DUCKS_DUB.title,
}: {
  error: string;
  onRetryLoad(): void;
  title?: string;
}) {
  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl border-4 border-white bg-white/90 p-5 shadow-card">
        <h1 className="m-0 text-3xl text-brand-ink md:text-4xl">{title}</h1>
        {error ? (
          <>
            <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
              {error}
            </p>
            <ActionButton onClick={onRetryLoad}>Try loading again</ActionButton>
          </>
        ) : (
          <p className="m-0 rounded-2xl bg-sky-50 p-3 font-bold leading-snug text-brand-ink">
            Ask a grown-up to turn on voice dubbing in Guardian mode.
          </p>
        )}
      </section>
    </main>
  );
}

export function DubLoading({
  error,
  onRetryLoad,
  title = FIVE_LITTLE_DUCKS_DUB.title,
}: {
  error: string;
  onRetryLoad(): void;
  title?: string;
}) {
  if (error) {
    return (
      <DubEntry
        error={error}
        onRetryLoad={onRetryLoad}
        title={title}
      />
    );
  }
  return (
    <main aria-busy="true" className="grid h-dvh w-screen place-items-center overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pt-20">
      <section className="grid justify-items-center gap-4">
        <h1 className="m-0 text-3xl text-brand-ink md:text-5xl">{title}</h1>
        <ActionButton disabled>Loading your private dub…</ActionButton>
      </section>
    </main>
  );
}

export function DubStudio({
  definition = FIVE_LITTLE_DUCKS_DUB,
}: {
  definition?: DubDefinition;
}) {
  const [state, dispatch] = useReducer(
    (current, event) => reduceDubState(current, event, definition),
    definition,
    createInitialDubState,
  );
  const [loadError, setLoadError] = useState("");
  const [loadSequence, setLoadSequence] = useState(0);
  const [playbackLineIndex, setPlaybackLineIndex] = useState(0);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [takePreview, setTakePreview] = useState<TakePreview | null>(null);

  const mountedRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);
  const guideControllerRef = useRef<AbortController | null>(null);
  const takeControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const playbackControllerRef = useRef<AbortController | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingSessionRef = useRef<SpeechRecordingSession | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRef = useRef<{ stop(): void } | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingLineIdRef = useRef<string | null>(null);
  const takePreviewRef = useRef<TakePreview | null>(null);
  const fetchedTakeUrlRef = useRef<string | null>(null);
  const fullPlaybackButtonRef = useRef<HTMLButtonElement>(null);
  const scenePlaybackButtonRef = useRef<HTMLButtonElement>(null);
  const lineHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  function focusAfterRender(ref: RefObject<HTMLElement | null>, generation: number) {
    let framesRemaining = 4;
    const tryFocus = () => {
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      const target = ref.current;
      target?.focus();
      if (target && target.ownerDocument.activeElement === target) return;
      framesRemaining -= 1;
      if (framesRemaining > 0) requestAnimationFrame(tryFocus);
    };
    requestAnimationFrame(tryFocus);
  }

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

  const clearRecordingProgress = useCallback((reset: boolean) => {
    if (recordingProgressTimerRef.current !== null) {
      clearInterval(recordingProgressTimerRef.current);
      recordingProgressTimerRef.current = null;
    }
    recordingStartedAtRef.current = null;
    if (reset && mountedRef.current) setRecordingElapsedMs(0);
  }, []);

  const clearFetchedTakeUrl = useCallback((owner?: string) => {
    const url = fetchedTakeUrlRef.current;
    if (!url || (owner !== undefined && url !== owner)) return;
    fetchedTakeUrlRef.current = null;
    URL.revokeObjectURL(url);
  }, []);

  const cancelMedia = useCallback((discardTake: boolean) => {
    mediaGenerationRef.current += 1;
    guideControllerRef.current?.abort();
    guideControllerRef.current = null;
    takeControllerRef.current?.abort();
    takeControllerRef.current = null;
    clearFetchedTakeUrl();
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
    clearRecordingProgress(true);
    if (discardTake) {
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      clearTakePreview();
    }
    return mediaGenerationRef.current;
  }, [clearFetchedTakeUrl, clearRecordingProgress, clearTakePreview]);

  const handleConsentLoss = useCallback(() => {
    cancelMedia(true);
    setLoadError("");
    setPlaybackLineIndex(0);
    dispatch({ type: "LOADED", recordingEnabled: false, savedLineIds: [] });
  }, [cancelMedia]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statusControllerRef.current?.abort();
      cancelMedia(true);
    };
  }, [cancelMedia]);

  useEffect(() => {
    const controller = new AbortController();
    statusControllerRef.current = controller;
    setLoadError("");
    void loadDubStatus({ dubId: definition.id, signal: controller.signal })
      .then((status) => {
        if (!mountedRef.current || statusControllerRef.current !== controller) return;
        dispatch({
          type: "LOADED",
          recordingEnabled: status.recordingEnabled,
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
    return () => controller.abort();
  }, [definition.id, loadSequence]);

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
      const result = await saveDubLine(lineId, blob, {
        dubId: definition.id,
        signal: controller.signal,
      });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "SAVE_SUCCEEDED", lineId, recordedAt: result.recordedAt });
      focusAfterRender(nextButtonRef, generation);
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current) return;
      if (error instanceof DubNotEnabledError) {
        handleConsentLoss();
        return;
      }
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
      focusAfterRender(rejected ? recordButtonRef : saveButtonRef, generation);
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
    clearRecordingProgress(false);
    dispatch({ type: "OPERATION_STARTED", operation: "saving" });
    try {
      const blob = await session.stop();
      if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
      recordingControllerRef.current = null;
      const lineId = pendingLineIdRef.current;
      if (!lineId) return;
      pendingBlobRef.current = blob;
      replaceTakePreview(blob, lineId);
      await uploadPendingTake(generation);
    } catch (error) {
      if (generation !== mediaGenerationRef.current || isAbortError(error)) return;
      recordingControllerRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: "The recording did not finish. Try recording the line again." });
      focusAfterRender(recordButtonRef, generation);
    }
  }

  async function startRecording() {
    if (isUnsafeOperation(state.operation)) return;
    const generation = cancelMedia(true);
    const lineId = definition.lines[state.selectedLineIndex].id;
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
      recordingStartedAtRef.current = Date.now();
      setRecordingElapsedMs(0);
      dispatch({ type: "OPERATION_STARTED", operation: "recording" });
      recordingProgressTimerRef.current = setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (!mountedRef.current || generation !== mediaGenerationRef.current || startedAt === null) return;
        setRecordingElapsedMs(Math.min(definition.recordingMs, Date.now() - startedAt));
      }, 100);
      recordingTimerRef.current = setTimeout(() => {
        if (mountedRef.current && generation === mediaGenerationRef.current) {
          setRecordingElapsedMs(definition.recordingMs);
        }
        void finishRecording(generation);
      }, definition.recordingMs);
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current) return;
      recordingControllerRef.current = null;
      pendingLineIdRef.current = null;
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: microphoneMessage(error) });
      focusAfterRender(recordButtonRef, generation);
    }
  }

  function handleRecord() {
    if (state.operation === "recording") {
      void finishRecording();
      return;
    }
    if (isUnsafeOperation(state.operation)) return;
    void startRecording();
  }

  function handleHearGuide() {
    if (isUnsafeOperation(state.operation)) return;
    const generation = cancelMedia(false);
    const controller = new AbortController();
    guideControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "guide-playing" });
    let guide;
    try {
      guide = getStaticAudioLineForSpeech("narrator", definition.lines[state.selectedLineIndex].text);
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
    if (isUnsafeOperation(state.operation)) return;

    const line = definition.lines[state.selectedLineIndex];
    const preview = takePreviewRef.current?.lineId === line.id
      ? takePreviewRef.current
      : null;
    if (!preview && !Object.hasOwn(state.saved, line.id)) return;

    const generation = cancelMedia(false);
    const controller = new AbortController();
    takeControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "take-playing" });

    void (async () => {
      let fetchedUrl: string | null = null;
      try {
        let audioSrc = preview?.url;
        if (!audioSrc) {
          const blob = await loadDubLineAudio(line.id, {
            dubId: definition.id,
            signal: controller.signal,
          });
          if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
          fetchedUrl = URL.createObjectURL(blob);
          audioSrc = fetchedUrl;
          fetchedTakeUrlRef.current = fetchedUrl;
        }
        await playAudioLine({ audioSrc, signal: controller.signal, text: line.text });
      } catch (error) {
        if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
        if (error instanceof DubNotEnabledError) {
          handleConsentLoss();
          return;
        }
        dispatch({ type: "MARK_NEEDS_RETAKE", lineId: line.id });
        dispatch({ type: "SET_ERROR", message: "Your recording could not be played. Record the line again." });
      } finally {
        if (takeControllerRef.current === controller) takeControllerRef.current = null;
        if (fetchedUrl) clearFetchedTakeUrl(fetchedUrl);
        if (generation === mediaGenerationRef.current) dispatch({ type: "OPERATION_FINISHED" });
      }
    })();
  }

  function resolveLineAudio(line: Pick<DubLine, "id" | "text">): DubAudioSource {
    return resolveDubLineAudioSource(line, state.saved, getStaticAudioLineForSpeech, definition.id);
  }

  async function startPlayback(scope: "full" | "scene") {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
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
    const sceneLines = getSceneLines(definition);
    const lines = scope === "full" ? definition.lines : sceneLines[sceneIndex];
    const unavailableLineIds = new Set<string>();
    playbackControllerRef.current = controller;
    setPlaybackLineIndex(scope === "full" ? 0 : sceneIndex * definition.linesPerScene);
    dispatch({ type: "OPERATION_STARTED", operation: "playback-loading", playbackScope: scope });
    try {
      const playback = await startDubPlayback({
        definition,
        lines,
        onEnded() {
          if (generation !== mediaGenerationRef.current) return;
          playbackRef.current = null;
          playbackControllerRef.current = null;
          dispatch({ type: "OPERATION_FINISHED" });
          focusAfterRender(
            scope === "full" ? fullPlaybackButtonRef : scenePlaybackButtonRef,
            generation,
          );
        },
        onLineFallback(lineId) {
          dispatch({ type: "MARK_NEEDS_RETAKE", lineId });
        },
        onLineUnavailable(lineId) {
          unavailableLineIds.add(lineId);
        },
        onTick(elapsedMs) {
          if (generation !== mediaGenerationRef.current) return;
          const line = scope === "full"
            ? getDubLineAtElapsed(definition, elapsedMs)
            : getDubSceneLineAtElapsed(definition, sceneIndex, elapsedMs);
          setPlaybackLineIndex(getLineIndex(definition, line.id));
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
      const unavailableMessage = definition.lines
        .filter(({ id }) => unavailableLineIds.has(id))
        .map(({ id }) => unavailableLineMessage(definition, id))
        .join(" ");
      if (unavailableMessage) dispatch({ type: "SET_ERROR", message: unavailableMessage });
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
      playbackControllerRef.current = null;
      if (error instanceof DubNotEnabledError) {
        handleConsentLoss();
        return;
      }
      dispatch({ type: "OPERATION_FINISHED" });
      dispatch({ type: "SET_ERROR", message: "The video could not start. Try again." });
    }
  }

  function handleOpenScene(sceneIndex: number) {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const generation = cancelMedia(true);
    dispatch({ type: "OPEN_SCENE", sceneIndex });
    focusAfterRender(lineHeadingRef, generation);
  }

  function handleSelectLine(lineId: string) {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const generation = cancelMedia(lineId !== definition.lines[state.selectedLineIndex].id);
    dispatch({ type: "SELECT_LINE", lineId });
    focusAfterRender(lineHeadingRef, generation);
  }

  function handleNext() {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const sceneLineIndex = state.selectedLineIndex % definition.linesPerScene;
    if (sceneLineIndex < definition.linesPerScene - 1) {
      handleSelectLine(definition.lines[state.selectedLineIndex + 1].id);
      return;
    }
    handleBack();
  }

  function handlePrevious() {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const sceneLineIndex = state.selectedLineIndex % definition.linesPerScene;
    if (sceneLineIndex === 0) return;
    handleSelectLine(definition.lines[state.selectedLineIndex - 1].id);
  }

  function handleBack() {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const generation = cancelMedia(true);
    dispatch({ type: "BACK_TO_PROJECT" });
    focusAfterRender(fullPlaybackButtonRef, generation);
  }

  function handleRetrySave() {
    if (isUnsafeOperation(state.operation) || state.saveRecovery !== "save") return;
    const generation = cancelMedia(false);
    dispatch({ type: "OPERATION_STARTED", operation: "saving" });
    void uploadPendingTake(generation);
  }

  function handleRetryLoad() {
    if (isUnsafeOperation(state.operation)) return;
    setLoadError("");
    dispatch({ type: "SET_ERROR", message: "" });
    setLoadSequence((sequence) => sequence + 1);
  }

  const selectedLine = definition.lines[state.selectedLineIndex] ?? definition.lines[0];
  const playbackLine = definition.lines[playbackLineIndex] ?? selectedLine;
  const visualLine = state.operation === "playback" || state.operation === "playback-loading"
    ? playbackLine
    : selectedLine;
  const locked = isControlLocked(state.operation);
  const selectedSceneNumber = state.selectedSceneIndex + 1;
  const selectedSceneLineNumber = state.selectedLineIndex % definition.linesPerScene + 1;
  const playbackSceneNumber = Math.floor(playbackLineIndex / definition.linesPerScene) + 1;
  const playbackSceneLineNumber = playbackLineIndex % definition.linesPerScene + 1;
  const savedCount = Object.keys(state.saved).length;
  let liveStatus = "Ready to open your dub.";
  const activeError = state.error || loadError;
  if (state.operation === "mic-opening") {
    liveStatus = "Opening microphone…";
  } else if (state.operation === "recording") {
    liveStatus = "Recording…";
  } else if (state.operation === "saving") {
    liveStatus = "Saving your take…";
  } else if (state.operation === "guide-playing") {
    liveStatus = `Playing example for Scene ${selectedSceneNumber}, line ${selectedSceneLineNumber}.`;
  } else if (state.operation === "take-playing") {
    liveStatus = `Playing your recording for Scene ${selectedSceneNumber}, line ${selectedSceneLineNumber}.`;
  } else if (state.operation === "playback-loading") {
    liveStatus = state.playbackScope === "full" ? "Loading full video…" : "Loading scene…";
  } else if (state.operation === "playback") {
    liveStatus = state.playbackScope === "full"
      ? `Playing full video: Scene ${playbackSceneNumber}, line ${playbackSceneLineNumber}.`
      : `Playing Scene ${state.selectedSceneIndex + 1}: line ${playbackSceneLineNumber}.`;
  } else if (activeError) {
    liveStatus = activeError;
  } else if (state.view === "loading") {
    liveStatus = "Loading your private dub…";
  } else if (state.view === "locked") {
    liveStatus = "Voice dubbing is off. Ask a grown-up to turn it on in Guardian mode.";
  } else if (state.view === "project") {
    liveStatus = `${savedCount} of ${definition.lines.length} voice clips recorded.`;
  } else if (state.view === "scene") {
    const selectedState = Object.hasOwn(state.needsRetake, selectedLine.id)
      ? "Needs retake"
      : Object.hasOwn(state.saved, selectedLine.id)
        ? "Recorded"
        : "Generated";
    liveStatus = `Scene ${selectedSceneNumber}, line ${selectedSceneLineNumber} selected. ${selectedState}.`;
  }

  let content;
  if (state.view === "loading") {
    content = (
      <DubLoading
        error={loadError}
        onRetryLoad={handleRetryLoad}
        title={definition.title}
      />
    );
  } else if (state.view === "locked") {
    content = (
      <DubEntry
        error={loadError}
        onRetryLoad={handleRetryLoad}
        title={definition.title}
      />
    );
  } else if (state.view === "project") {
    content = (
      <DubProjectHome
        activeLine={selectedLine}
        definition={definition}
        error={state.error}
        locked={locked}
        needsRetake={new Set(Object.keys(state.needsRetake))}
        onOpenScene={handleOpenScene}
        onTogglePlayback={() => void startPlayback("full")}
        playback={state.playbackScope === "full"
          ? state.operation === "playback"
            ? "playing"
            : state.operation === "playback-loading"
              ? "loading"
              : "idle"
          : "idle"}
        playbackButtonRef={fullPlaybackButtonRef}
        saved={state.saved}
        visualLine={visualLine}
      />
    );
  } else {
    content = (
      <DubSceneEditor
        activeLine={selectedLine}
        definition={definition}
        error={state.error}
        hasSavedTake={Object.hasOwn(state.saved, selectedLine.id)}
        locked={locked}
        onHearGuide={handleHearGuide}
        onHearTake={handleHearTake}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onRecord={handleRecord}
        onRetrySave={handleRetrySave}
        operation={state.operation}
        pendingTake={takePreview?.blob ?? null}
        recordingElapsedMs={recordingElapsedMs}
        recordingStream={recordingSessionRef.current?.stream ?? null}
        nextButtonRef={nextButtonRef}
        recordButtonRef={recordButtonRef}
        saveButtonRef={saveButtonRef}
        saveRecovery={state.saveRecovery}
        lineHeadingRef={lineHeadingRef}
      />
    );
  }

  return (
    <>
      <RouteHeader>
        {state.view === "scene" ? (
          <HeaderButton
            aria-label="Back to full video"
            disabled={isUnsafeOperation(state.operation) || state.saveRecovery === "save"}
            icon={<ChevronLeft strokeWidth={3.2} />}
            onClick={handleBack}
          >
            Full video
          </HeaderButton>
        ) : (
          <HeaderLink aria-label="Back to home" icon={<ChevronLeft strokeWidth={3.2} />} to="/">
            Back home
          </HeaderLink>
        )}
      </RouteHeader>
      <span
        aria-atomic="true"
        aria-label="Dub updates"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {liveStatus}
      </span>
      {content}
    </>
  );
}
