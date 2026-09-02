import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Mic,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { DubTimedWords, type DubGuidancePosition } from "./DubKaraokeGuide";
import type { DubOperation } from "./dub-state";
import {
  FIVE_LITTLE_DUCKS_DUB,
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog";

export type DubSceneEditorProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  error: string;
  errorHelper?: ReactNode;
  hasSavedTake: boolean;
  locked: boolean;
  needsRetake: boolean;
  onHearGuide(): void;
  onHearTake(): void;
  onNext(): void;
  onPrevious(): void;
  onRecord(): void;
  onRetrySave(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  presentation: DubGuidancePosition & Readonly<{ countInBeat: number | null }>;
  nextButtonRef?: RefObject<HTMLButtonElement | null>;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  saveButtonRef?: RefObject<HTMLButtonElement | null>;
  saveRecovery: "record" | "save" | null;
  lineHeadingRef?: RefObject<HTMLHeadingElement | null>;
};

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DubSceneEditor({
  activeLine,
  definition = FIVE_LITTLE_DUCKS_DUB,
  error,
  errorHelper,
  hasSavedTake,
  locked,
  needsRetake,
  onHearGuide,
  onHearTake,
  onNext,
  onPrevious,
  onRecord,
  onRetrySave,
  operation,
  pendingTake,
  presentation,
  nextButtonRef,
  recordButtonRef,
  saveButtonRef,
  saveRecovery,
  lineHeadingRef,
}: DubSceneEditorProps) {
  const activeLineIndex = Math.max(
    0,
    definition.lines.findIndex(({ id }) => id === activeLine.id),
  );
  const sceneNumber = Math.floor(activeLineIndex / definition.linesPerScene) + 1;
  const lineNumber = activeLineIndex % definition.linesPerScene + 1;
  const countingIn = operation === "counting-in";
  const recording = operation === "recording";
  const recordAgain = pendingTake !== null || hasSavedTake || needsRetake || saveRecovery !== null;
  const hasPlayableTake = !needsRetake && (pendingTake !== null || hasSavedTake);
  const showTakeActions = hasPlayableTake
    && !recording
    && !countingIn
    && operation !== "mic-opening"
    && operation !== "saving";
  const mediaLocked = locked || recording;
  const navigationLocked = mediaLocked || saveRecovery === "save";
  const recordingDurationMs = activeLine.durationMs;
  const presentationElapsedMs = presentation.lineId === activeLine.id
    ? presentation.elapsedMs
    : null;
  const elapsedMs = Math.min(
    recordingDurationMs,
    Math.max(0, presentationElapsedMs ?? 0),
  );
  const elapsedLabel = formatDuration(elapsedMs);
  const recordingLimitLabel = formatDuration(recordingDurationMs);
  const firstLineInScene = lineNumber === 1;
  const lastLineInScene = lineNumber === definition.linesPerScene;
  const recordLabel = operation === "mic-opening"
    ? "Cancel microphone start"
    : countingIn
      ? "Cancel count-in"
      : operation === "saving"
        ? "Saving recording"
        : recording
          ? "Stop recording"
          : recordAgain
            ? "Record again"
            : "Record line";
  const guideLabel = operation === "guide-playing"
    ? "Stop example"
    : "Hear example";
  const takeLabel = operation === "take-playing"
    ? "Stop my recording"
    : "Play my recording";
  const feedbackError = Boolean(error)
    && operation !== "mic-opening"
    && operation !== "saving";
  const status = operation === "mic-opening"
    ? "Opening microphone…"
    : countingIn
      ? "Get ready"
      : recording
        ? "Recording"
        : operation === "saving"
          ? "Saving…"
          : operation === "take-playing"
            ? "Playing"
            : feedbackError
              ? "Needs attention"
              : needsRetake
              ? "Try again"
              : saveRecovery === "save"
              ? "Not saved"
              : saveRecovery === "record"
                ? "Try again"
                : hasPlayableTake
                ? "Saved"
                  : "Ready";
  const savedStatus = status === "Saved";
  const attentionStatus = status === "Needs attention"
    || status === "Try again"
    || status === "Not saved";

  return (
    <aside
      aria-busy={locked}
      aria-label="Line recording controls"
      className="order-1 grid min-w-0 content-start gap-3 self-start rounded-3xl border-4 border-white bg-white/95 p-4 shadow-card short-wide:order-2 short-wide:max-h-full short-wide:min-h-0 short-wide:gap-2 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-3 md:p-5 short-wide:md:p-3 lg:order-2"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="m-0 rounded-full bg-brand-yellow px-3 py-1.5 text-sm font-black text-brand-ink">
          Scene {sceneNumber}
        </p>
        <p aria-current="step" className="m-0 text-base font-black text-brand-blue">
          Line {lineNumber} of {definition.linesPerScene}
        </p>
      </div>

      <h2
        className="m-0 rounded-2xl bg-brand-navy px-4 py-5 text-center text-xl font-black leading-snug text-white text-balance short-wide:px-3 short-wide:py-3 short-wide:text-lg md:text-2xl"
        ref={lineHeadingRef}
        tabIndex={-1}
      >
        <DubTimedWords elapsedMs={presentationElapsedMs} line={activeLine} />
      </h2>

      <div className="grid min-w-0 divide-y-3 divide-sky-200 border-y-3 border-sky-200">
        <div className="py-3 short-wide:py-2">
          <ActionButton
            aria-label={guideLabel}
            className="min-h-12 gap-2 px-4 text-base"
            disabled={mediaLocked}
            fullWidth
            onClick={onHearGuide}
            shape="rounded"
            size="none"
            variant="surface"
          >
            {operation === "guide-playing"
              ? <Square aria-hidden="true" />
              : <Play aria-hidden="true" />}
            {operation === "guide-playing" ? "Stop" : "Hear example"}
          </ActionButton>
        </div>

        <section aria-label="Your recording" className="grid min-w-0 gap-3 py-3 short-wide:gap-2 short-wide:py-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="m-0 text-base font-black text-brand-ink">Your turn</p>
            <p
              className={`m-0 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black ${
                savedStatus
                  ? "bg-emerald-100 text-emerald-900"
                  : attentionStatus
                    ? "bg-rose-100 text-red-900"
                    : "bg-sky-100 text-brand-navy"
              }`}
            >
              {savedStatus
                ? <CheckCircle2 aria-hidden="true" className="size-4" />
                : null}
              {status}
            </p>
          </div>

          {countingIn ? (
            <div className="flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-amber-100 px-4 py-2 text-brand-ink">
              <span className="text-base font-black">Recording starts in</span>
              <strong className="text-3xl tabular-nums">{presentation.countInBeat}</strong>
            </div>
          ) : null}

          {recording ? (
            <div className="grid gap-2">
              <p
                aria-label="Recording duration"
                className="m-0 flex items-center justify-between gap-3 text-base font-black text-brand-rose"
                role="timer"
              >
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 rounded-full bg-red-600" />
                  Recording
                </span>
                <span className="tabular-nums">{elapsedLabel} / {recordingLimitLabel}</span>
              </p>
              <div
                aria-label="Recording time"
                aria-valuemax={recordingDurationMs}
                aria-valuemin={0}
                aria-valuenow={elapsedMs}
                aria-valuetext={`${elapsedLabel} of ${recordingLimitLabel}`}
                className="h-3 w-full overflow-hidden rounded-full bg-slate-300"
                role="progressbar"
              >
                <span
                  aria-hidden="true"
                  className="block h-full rounded-full bg-brand-rose transition-[width] duration-100 motion-reduce:transition-none"
                  style={{ width: `${elapsedMs / recordingDurationMs * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          {feedbackError ? (
            <p
              aria-label={error}
              className="m-0 break-words rounded-2xl bg-rose-50 p-3 text-base font-bold leading-snug text-red-900"
              role="alert"
            >
              {error}
              {errorHelper ? <span className="mt-1 block">{errorHelper}</span> : null}
            </p>
          ) : null}

          {saveRecovery === "save" ? (
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <ActionButton
                aria-label={takeLabel}
                disabled={mediaLocked || !hasPlayableTake}
                fullWidth
                onClick={onHearTake}
                shape="rounded"
                size="compact"
                variant="surface"
              >
                {operation === "take-playing"
                  ? <Square aria-hidden="true" />
                  : <Play aria-hidden="true" />}
                {operation === "take-playing" ? "Stop" : "Play mine"}
              </ActionButton>
              <ActionButton
                aria-label="Save again"
                disabled={locked}
                fullWidth
                onClick={onRetrySave}
                ref={saveButtonRef}
                shape="rounded"
                size="compact"
                variant="brand"
              >
                Save again
              </ActionButton>
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-2 ${showTakeActions ? "min-[360px]:grid-cols-2" : ""}`}>
              <ActionButton
                aria-label={recordLabel}
                className={showTakeActions ? "order-2" : ""}
                disabled={operation === "saving"}
                fullWidth
                onClick={onRecord}
                ref={recordButtonRef}
                shape="rounded"
                size={showTakeActions ? "compact" : "large"}
                variant={showTakeActions
                  ? "surface"
                  : recording || countingIn
                    ? "rose"
                    : "brand"}
              >
                {operation === "saving"
                  ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  : operation === "mic-opening" || recording || countingIn
                    ? <Square aria-hidden="true" />
                    : showTakeActions
                      ? <RotateCcw aria-hidden="true" />
                      : <Mic aria-hidden="true" />}
                {operation === "mic-opening"
                  ? "Cancel"
                  : countingIn
                    ? "Cancel"
                    : operation === "saving"
                      ? "Saving…"
                      : recording
                        ? "Stop recording"
                        : recordAgain
                          ? "Record again"
                          : "Record"}
              </ActionButton>

              {showTakeActions ? (
                <ActionButton
                  aria-label={takeLabel}
                  className="order-1"
                  disabled={mediaLocked}
                  fullWidth
                  onClick={onHearTake}
                  shape="rounded"
                  size="compact"
                  variant="surface"
                >
                  {operation === "take-playing"
                    ? <Square aria-hidden="true" />
                    : <Play aria-hidden="true" />}
                  {operation === "take-playing" ? "Stop" : "Play mine"}
                </ActionButton>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <ActionButton
          aria-label="Previous line"
          disabled={navigationLocked || firstLineInScene}
          fullWidth
          onClick={onPrevious}
          size="large"
          variant="surface"
        >
          <ArrowLeft aria-hidden="true" /> Previous
        </ActionButton>
        <ActionButton
          aria-label={lastLineInScene ? "Finish scene" : "Next line"}
          disabled={navigationLocked}
          fullWidth
          onClick={onNext}
          ref={nextButtonRef}
          size="large"
          variant={hasPlayableTake && saveRecovery === null ? "navy" : "surface"}
        >
          {lastLineInScene ? "Finish scene" : "Next"} <ArrowRight aria-hidden="true" />
        </ActionButton>
      </div>
    </aside>
  );
}
