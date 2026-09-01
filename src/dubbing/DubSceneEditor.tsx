import { ArrowLeft, ArrowRight, ChevronLeft, LoaderCircle, Mic, Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton, TextButton } from "../shared/ui";
import { DubTimedWords, type DubGuidancePosition } from "./DubKaraokeGuide";
import type { DubOperation } from "./dub-state";
import { DubTakeWaveform } from "./DubTakeWaveform";
import {
  FIVE_LITTLE_DUCKS_DUB,
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog";

export type DubSceneEditorProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  error: string;
  hasSavedTake: boolean;
  locked: boolean;
  onBack(): void;
  onHearGuide(): void;
  onHearTake(): void;
  onNext(): void;
  onPrevious(): void;
  onRecord(): void;
  onRetrySave(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  presentation: DubGuidancePosition & Readonly<{ countInBeat: number | null }>;
  recordingStream: MediaStream | null;
  recordedPeakBars?: readonly number[] | null;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
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
  hasSavedTake,
  locked,
  onBack,
  onHearGuide,
  onHearTake,
  onNext,
  onPrevious,
  onRecord,
  onRetrySave,
  operation,
  pendingTake,
  presentation,
  recordingStream,
  recordedPeakBars,
  backButtonRef,
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
  const lineNumber = activeLineIndex + 1;
  const countingIn = operation === "counting-in";
  const recording = operation === "recording";
  const recordAgain = pendingTake !== null || hasSavedTake || saveRecovery !== null;
  const hasPlayableTake = pendingTake !== null || hasSavedTake;
  const mediaLocked = locked || recording;
  const navigationLocked = mediaLocked || saveRecovery === "save";
  const recordingDurationMs = activeLine.durationMs;
  const presentationElapsedMs = presentation.lineId === activeLine.id
    ? presentation.elapsedMs
    : null;
  const elapsedMs = Math.min(recordingDurationMs, Math.max(0, presentationElapsedMs ?? 0));
  const elapsedLabel = formatDuration(elapsedMs);
  const recordingLimitLabel = formatDuration(recordingDurationMs);
  const firstLine = lineNumber === 1;
  const lastLine = lineNumber === definition.lines.length;
  const recordLabel = operation === "mic-opening"
    ? "Starting microphone"
    : countingIn
      ? "Cancel count-in"
      : operation === "saving"
        ? "Saving recording"
        : recording
          ? "Stop recording"
          : recordAgain
            ? "Record again"
            : "Record line";
  const takeLabel = operation === "take-playing"
    ? "Stop my recording"
    : "Play my recording";
  const originalLabel = operation === "guide-playing"
    ? "Stop original"
    : "Play original";
  const feedbackError = Boolean(error)
    && operation !== "mic-opening"
    && operation !== "saving";
  const feedbackLabel = saveRecovery === "save"
    ? "Not saved"
    : error
      ? error
      : "";

  return (
    <aside aria-busy={locked} aria-label="Line recording controls" className="grid min-w-0 content-start gap-2 self-start rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:max-h-full short-wide:min-h-0 short-wide:gap-1 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-2 md:max-h-[calc(100dvh-10rem)] md:gap-1.5 md:overflow-y-auto md:p-4 short-wide:md:max-h-full short-wide:md:gap-1 short-wide:md:p-2 lg:h-full lg:max-h-none lg:self-stretch">
      <ActionButton
        aria-label="Back to all lyrics"
        className="min-h-12 justify-self-start px-3"
        disabled={navigationLocked}
        onClick={onBack}
        ref={backButtonRef}
        size="none"
        variant="surface"
      >
        <ChevronLeft aria-hidden="true" /> All lyrics
      </ActionButton>

      <p aria-current="step" className="m-0 text-center text-lg font-black leading-none text-brand-blue short-wide:text-base md:text-xl">
        Line {lineNumber} of {definition.lines.length}
      </p>
      <h2 className="m-0 rounded-2xl bg-sky-50 px-3 py-2 text-center text-lg font-black leading-snug text-brand-ink short-wide:py-1.5 short-wide:text-base md:text-xl" ref={lineHeadingRef} tabIndex={-1}>
        <DubTimedWords elapsedMs={presentationElapsedMs} line={activeLine} />
      </h2>

      <section aria-label="Recording feedback" className="grid content-start gap-1.5 rounded-2xl bg-sky-50 p-2 short-wide:gap-1 short-wide:p-0.5">
        <DubTakeWaveform
          blob={pendingTake}
          definition={definition}
          elapsedMs={presentationElapsedMs}
          hasRecording={hasPlayableTake}
          line={activeLine}
          originalAction={(
            <ActionButton
              aria-label={originalLabel}
              className="min-h-12 min-w-12 gap-1 px-2 text-sm"
              disabled={mediaLocked}
              onClick={onHearGuide}
              shape="rounded"
              size="none"
              variant="surface"
            >
              {operation === "guide-playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {operation === "guide-playing" ? "Stop" : "Play"}
            </ActionButton>
          )}
          recordedPeakBars={recordedPeakBars}
          recordingActions={(
            <>
              <ActionButton
                aria-label={takeLabel}
                className="min-h-12 min-w-12 gap-1 px-2 text-sm"
                disabled={mediaLocked || !hasPlayableTake}
                onClick={onHearTake}
                shape="rounded"
                size="none"
                variant="surface"
              >
                {operation === "take-playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
                {operation === "take-playing" ? "Stop" : "Play"}
              </ActionButton>
              <ActionButton
                aria-label={recordLabel}
                className="min-h-12 w-24 min-w-24 gap-1 overflow-hidden px-2 text-sm whitespace-nowrap"
                disabled={locked && !countingIn}
                onClick={onRecord}
                ref={recordButtonRef}
                shape="rounded"
                size="none"
                variant="brand"
              >
                {operation === "mic-opening" || operation === "saving"
                  ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  : recording || countingIn
                    ? <Square aria-hidden="true" />
                    : <Mic aria-hidden="true" />}
                {operation === "mic-opening"
                  ? "Start…"
                  : countingIn
                    ? "Cancel"
                    : operation === "saving"
                      ? "Save…"
                      : recording
                        ? "Stop"
                        : "Record"}
              </ActionButton>
              {pendingTake && saveRecovery === "save" ? (
                <TextButton
                  aria-label="Save again"
                  className="relative z-0 min-h-12 min-w-12 shrink-0 rounded-lg bg-white px-2 no-underline shadow-sm focus-visible:z-10 focus-visible:outline-offset-0 short-wide:text-sm"
                  disabled={locked}
                  onClick={onRetrySave}
                  ref={saveButtonRef}
                >
                  Save
                </TextButton>
              ) : null}
            </>
          )}
          recordingStream={recordingStream}
        />
        <div className="grid min-h-10 content-start gap-1.5">
          {recording ? (
            <>
              <p aria-label="Recording duration" className="m-0 flex items-center justify-between gap-2 text-sm font-black text-brand-rose" role="timer">
                <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full bg-red-600" />Recording with melody</span>
                <span>{elapsedLabel} / {recordingLimitLabel}</span>
              </p>
              <div
                aria-label="Recording time"
                aria-valuemax={recordingDurationMs}
                aria-valuemin={0}
                aria-valuenow={elapsedMs}
                aria-valuetext={`${elapsedLabel} of ${recordingLimitLabel}`}
                className="h-2 w-full overflow-hidden rounded-full bg-slate-300"
                role="progressbar"
              >
                <span
                  aria-hidden="true"
                  className="block h-full rounded-full bg-brand-rose transition-[width] duration-100 motion-reduce:transition-none"
                  style={{ width: `${elapsedMs / recordingDurationMs * 100}%` }}
                />
              </div>
            </>
          ) : countingIn ? (
            <p className="m-0 text-center text-sm font-black text-brand-rose">
              Count-in {presentation.countInBeat}
            </p>
          ) : feedbackLabel ? (
            <div className={`flex min-h-10 items-center justify-between gap-1 short-wide:min-h-12 ${feedbackError ? "flex-wrap short-wide:flex-nowrap" : ""}`}>
              <p
                aria-label={feedbackError ? error : undefined}
                className={`m-0 min-w-0 text-sm font-black short-wide:text-xs ${feedbackError ? "w-full flex-none break-words leading-tight text-red-800 short-wide:w-auto short-wide:flex-1" : "flex-1 truncate whitespace-nowrap " + (operation === "mic-opening" || operation === "saving" ? "text-brand-rose" : "text-slate-600")}`}
                role={feedbackError ? "alert" : undefined}
              >
                {feedbackLabel}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          aria-label="Previous line"
          disabled={navigationLocked || firstLine}
          fullWidth
          onClick={onPrevious}
          size="large"
          variant="surface"
        >
          <ArrowLeft aria-hidden="true" /> Previous
        </ActionButton>
        <ActionButton
          aria-label="Next line"
          disabled={navigationLocked || lastLine}
          fullWidth
          onClick={onNext}
          ref={nextButtonRef}
          size="large"
          variant="navy"
        >
          Next <ArrowRight aria-hidden="true" />
        </ActionButton>
      </div>
    </aside>
  );
}
