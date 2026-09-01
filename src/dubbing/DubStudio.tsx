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
import { HeaderButton, HeaderLink, RouteHeader } from "../app/AppHeader";
import { getNurseryRhymesPath } from "../app/app-routes";
import { isAbortError } from "../media/audio-playback";
import {
  MicrophoneAccessError,
  prepareSpeechRecording,
  RecordingUnsupportedError,
  type PreparedSpeechRecordingSession,
} from "../media/speech-recorder";
import { ActionButton } from "../shared/ui";
import {
  DubNotEnabledError,
  DubTakeRejectedError,
  getDubLineAudioUrl,
  loadDubStatus,
  saveDubLine,
} from "./dub-api";
import {
  prepareDubLineBacking,
  startDubPlayback,
  type DubAudioSource,
  type PreparedDubLineBacking,
} from "./dub-playback";
import { DubListenOnly } from "./DubListenOnly";
import type { DubGuidancePosition } from "./DubKaraokeGuide";
import { DubProjectHome } from "./DubProjectHome";
import { DubSceneEditor } from "./DubSceneEditor";
import {
  createInitialDubState,
  reduceDubState,
  type DubOperation,
} from "./dub-state";
import {
  FIVE_LITTLE_DUCKS_DUB,
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog";

type TakePreview = {
  blob: Blob;
  lineId: string;
  url: string;
};

type DubPresentation = DubGuidancePosition & Readonly<{
  countInBeat: number | null;
}>;

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
    || operation === "counting-in"
    || operation === "recording"
    || operation === "saving";
}

function isControlLocked(operation: DubOperation) {
  return operation === "mic-opening"
    || operation === "counting-in"
    || operation === "saving";
}

export function resolveDubLineAudioSource(
  line: Pick<DubLine, "id" | "guideAudioSrc">,
  saved: Readonly<Record<string, string>>,
  dubId: string,
): DubAudioSource {
  return Object.hasOwn(saved, line.id)
    ? {
        preferredUrl: getDubLineAudioUrl(line.id, { dubId }),
        fallbackUrl: line.guideAudioSrc,
      }
    : { preferredUrl: line.guideAudioSrc };
}

export function resolveGuideOnlyDubLineAudioSource(
  line: Pick<DubLine, "guideAudioSrc">,
): DubAudioSource {
  return { preferredUrl: line.guideAudioSrc };
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
        <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
          {error || "Your saved dub could not be loaded."}
        </p>
        <ActionButton onClick={onRetryLoad}>Try loading again</ActionButton>
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
  const [presentation, setPresentation] = useState<DubPresentation>(() => ({
    countInBeat: null,
    elapsedMs: null,
    lineId: definition.lines[0]?.id ?? null,
  }));
  const [takePreview, setTakePreview] = useState<TakePreview | null>(null);

  const mountedRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const statusControllerRef = useRef<AbortController | null>(null);
  const guideControllerRef = useRef<AbortController | null>(null);
  const takeControllerRef = useRef<AbortController | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const playbackControllerRef = useRef<AbortController | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);
  const recordingSessionRef = useRef<PreparedSpeechRecordingSession | null>(null);
  const recordingBackingRef = useRef<PreparedDubLineBacking | null>(null);
  const playbackRef = useRef<{ stop(): void } | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingLineIdRef = useRef<string | null>(null);
  const takePreviewRef = useRef<TakePreview | null>(null);
  const fullPlaybackButtonRef = useRef<HTMLButtonElement>(null);
  const scenePlaybackButtonRef = useRef<HTMLButtonElement>(null);
  const lineHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const selectedLineIdRef = useRef(definition.lines[0]?.id ?? null);
  selectedLineIdRef.current = definition.lines[state.selectedLineIndex]?.id ?? null;

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

  const resetPresentation = useCallback((lineId = selectedLineIdRef.current) => {
    if (!mountedRef.current) return;
    setPresentation({ countInBeat: null, elapsedMs: null, lineId });
  }, []);

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
    recordingBackingRef.current?.stop();
    recordingBackingRef.current = null;
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    resetPresentation();
    if (discardTake) {
      pendingBlobRef.current = null;
      pendingLineIdRef.current = null;
      clearTakePreview();
    }
    return mediaGenerationRef.current;
  }, [clearTakePreview, resetPresentation]);

  const handleConsentLoss = useCallback(() => {
    const generation = cancelMedia(true);
    setLoadError("");
    setPlaybackLineIndex(0);
    resetPresentation(definition.lines[0]?.id ?? null);
    dispatch({ type: "LOADED", recordingEnabled: false, savedLineIds: [] });
    focusAfterRender(fullPlaybackButtonRef, generation);
  }, [cancelMedia, definition.lines, resetPresentation]);

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
    const backing = recordingBackingRef.current;
    recordingBackingRef.current = null;
    backing?.stop();
    resetPresentation();
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

  function failRecording(generation: number, captureStarted: boolean) {
    if (!mountedRef.current || generation !== mediaGenerationRef.current) return;
    const nextGeneration = cancelMedia(captureStarted);
    dispatch({ type: "OPERATION_FINISHED" });
    if (captureStarted || state.saveRecovery === null) {
      dispatch({ type: "SET_ERROR", message: "The melody could not start. Try recording again." });
    }
    focusAfterRender(recordButtonRef, nextGeneration);
  }

  async function startRecording() {
    if (isUnsafeOperation(state.operation)) return;
    const generation = cancelMedia(false);
    const line = definition.lines[state.selectedLineIndex];
    const controller = new AbortController();
    let backing: PreparedDubLineBacking | null = null;
    let backingPrepared = false;
    let captureStarted = false;
    let session: PreparedSpeechRecordingSession | null = null;
    recordingControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "mic-opening" });
    try {
      backing = await prepareDubLineBacking({
        definition,
        line,
        onEnded: () => void finishRecording(generation),
        onCountIn: (remainingBeats) => {
          if (mountedRef.current && generation === mediaGenerationRef.current) {
            setPresentation({
              countInBeat: remainingBeats,
              elapsedMs: null,
              lineId: line.id,
            });
          }
        },
        onDownbeat: () => {
          if (!mountedRef.current || generation !== mediaGenerationRef.current || !session) return;
          session.start();
          captureStarted = true;
          clearTakePreview();
          pendingBlobRef.current = null;
          pendingLineIdRef.current = line.id;
          setPresentation({ countInBeat: null, elapsedMs: 0, lineId: line.id });
          dispatch({ type: "OPERATION_STARTED", operation: "recording" });
        },
        onFailure: () => failRecording(generation, captureStarted),
        onTick: (elapsedMs) => {
          if (mountedRef.current && generation === mediaGenerationRef.current) {
            setPresentation({
              countInBeat: null,
              elapsedMs,
              lineId: line.id,
            });
          }
        },
        signal: controller.signal,
      });
      backingPrepared = true;
      session = await prepareSpeechRecording({ signal: controller.signal });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) {
        session.cancel();
        backing.stop();
        return;
      }
      recordingBackingRef.current = backing;
      recordingSessionRef.current = session;
      dispatch({ type: "OPERATION_STARTED", operation: "counting-in" });
      backing.start();
    } catch (error) {
      if (controller.signal.aborted || generation !== mediaGenerationRef.current) return;
      recordingControllerRef.current = null;
      if (recordingSessionRef.current === session) recordingSessionRef.current = null;
      session?.cancel();
      if (recordingBackingRef.current === backing) recordingBackingRef.current = null;
      backing?.stop();
      resetPresentation(line.id);
      dispatch({ type: "OPERATION_FINISHED" });
      if (captureStarted || state.saveRecovery === null) {
        dispatch({
          type: "SET_ERROR",
          message: !backingPrepared || session
            ? "The melody could not start. Try recording again."
            : microphoneMessage(error),
        });
      }
      focusAfterRender(recordButtonRef, generation);
    }
  }

  function handleRecord() {
    if (state.operation === "counting-in") {
      const generation = cancelMedia(false);
      dispatch({ type: "OPERATION_FINISHED" });
      focusAfterRender(recordButtonRef, generation);
      return;
    }
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
    const line = definition.lines[state.selectedLineIndex];
    guideControllerRef.current = controller;
    dispatch({ type: "OPERATION_STARTED", operation: "guide-playing" });
    void (async () => {
      try {
        const playback = await startDubPlayback({
          definition,
          includeOutro: false,
          lines: [line],
          onEnded() {
            if (generation !== mediaGenerationRef.current) return;
            playbackRef.current = null;
            guideControllerRef.current = null;
            dispatch({ type: "OPERATION_FINISHED" });
          },
          onTick() {},
          onLineUnavailable() {
            throw new Error("The guide source is unavailable.");
          },
          resolveAudioSource: resolveGuideOnlyDubLineAudioSource,
          signal: controller.signal,
        });
        if (generation !== mediaGenerationRef.current) playback.stop();
        else playbackRef.current = playback;
      } catch (error) {
        if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
        guideControllerRef.current = null;
        dispatch({ type: "OPERATION_FINISHED" });
        dispatch({ type: "SET_ERROR", message: "I could not play that example. You can still record the words you see." });
      }
    })();
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
      try {
        const audioUrl = preview?.url
          ?? getDubLineAudioUrl(line.id, { dubId: definition.id });
        const playback = await startDubPlayback({
          definition,
          includeOutro: false,
          lines: [line],
          onEnded() {
            if (generation !== mediaGenerationRef.current) return;
            playbackRef.current = null;
            takeControllerRef.current = null;
            dispatch({ type: "OPERATION_FINISHED" });
          },
          onTick() {},
          onLineUnavailable() {
            throw new Error("The saved take source is unavailable.");
          },
          resolveAudioSource: () => ({ preferredUrl: audioUrl }),
          signal: controller.signal,
        });
        if (generation !== mediaGenerationRef.current) playback.stop();
        else playbackRef.current = playback;
      } catch (error) {
        if (controller.signal.aborted || generation !== mediaGenerationRef.current || isAbortError(error)) return;
        if (error instanceof DubNotEnabledError) {
          handleConsentLoss();
          return;
        }
        dispatch({ type: "MARK_NEEDS_RETAKE", lineId: line.id });
        dispatch({ type: "SET_ERROR", message: "Your recording could not be played. Record the line again." });
        if (takeControllerRef.current === controller) takeControllerRef.current = null;
        dispatch({ type: "OPERATION_FINISHED" });
      }
    })();
  }

  function resolveLineAudio(line: Pick<DubLine, "id" | "guideAudioSrc">): DubAudioSource {
    return resolveDubLineAudioSource(line, state.saved, definition.id);
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
    const guideOnlyPlayback = state.view === "listen-only";
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
          if (!guideOnlyPlayback) dispatch({ type: "MARK_NEEDS_RETAKE", lineId });
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
        resolveAudioSource: guideOnlyPlayback
          ? resolveGuideOnlyDubLineAudioSource
          : resolveLineAudio,
        signal: controller.signal,
      });
      if (!mountedRef.current || generation !== mediaGenerationRef.current) {
        playback.stop();
        return;
      }
      if (guideOnlyPlayback && unavailableLineIds.size === lines.length) {
        playback.stop();
        playbackControllerRef.current = null;
        dispatch({ type: "OPERATION_FINISHED" });
        dispatch({ type: "SET_ERROR", message: "The video could not start. Try again." });
        focusAfterRender(fullPlaybackButtonRef, generation);
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
      focusAfterRender(
        scope === "full" ? fullPlaybackButtonRef : scenePlaybackButtonRef,
        generation,
      );
    }
  }

  function handleOpenScene(sceneIndex: number) {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const generation = cancelMedia(true);
    dispatch({ type: "OPEN_SCENE", sceneIndex });
    resetPresentation(definition.lines[sceneIndex * definition.linesPerScene]?.id ?? null);
    focusAfterRender(lineHeadingRef, generation);
  }

  function handleSelectLine(lineId: string) {
    if (isUnsafeOperation(state.operation) || state.saveRecovery === "save") return;
    const generation = cancelMedia(lineId !== definition.lines[state.selectedLineIndex].id);
    dispatch({ type: "SELECT_LINE", lineId });
    resetPresentation(lineId);
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
  let liveStatus = "";
  const activeError = state.error || loadError;
  if (state.operation === "mic-opening") {
    liveStatus = "Opening microphone…";
  } else if (state.operation === "counting-in") {
    liveStatus = "Get ready. Recording starts after two beats.";
  } else if (state.operation === "recording") {
    liveStatus = "Recording with melody…";
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
    liveStatus = "";
  } else if (state.view === "loading") {
    liveStatus = "Loading your private dub…";
  } else if (state.view === "listen-only" || state.view === "project") {
    liveStatus = "";
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
  } else if (state.view === "listen-only") {
    content = (
      <DubListenOnly
        definition={definition}
        error={state.error}
        onRetryLoad={handleRetryLoad}
        onTogglePlayback={() => void startPlayback("full")}
        playback={state.playbackScope === "full"
          ? state.operation === "playback"
            ? "playing"
            : state.operation === "playback-loading"
              ? "loading"
              : "idle"
          : "idle"}
        playbackButtonRef={fullPlaybackButtonRef}
        visualLine={visualLine}
      />
    );
  } else if (state.view === "project") {
    content = (
      <DubProjectHome
        activeLine={selectedLine}
        definition={definition}
        error={state.error}
        locked={locked}
        needsRetake={state.needsRetake}
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
        presentation={presentation}
        recordingStream={state.operation === "recording"
          ? recordingSessionRef.current?.stream ?? null
          : null}
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
            icon={<ChevronLeft />}
            onClick={handleBack}
          >
            Full video
          </HeaderButton>
        ) : (
          <HeaderLink
            aria-label="Back to Nursery rhymes"
            icon={<ChevronLeft />}
            to={getNurseryRhymesPath()}
          >
            Nursery rhymes
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
