import { ArrowLeft, ArrowRight, LoaderCircle, Mic, Square, Volume2 } from "lucide-react";
import type { RefObject } from "react";
import { getStaticAudioLineForSpeech } from "../../lib/static-audio";
import { ActionButton, TextButton } from "../shared/ui";
import { DubTakeWaveform } from "./DubTakeWaveform";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import type { DubOperation } from "./dub-state";
import { IllustratedDubScene } from "./IllustratedDubScene";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubSceneEditorProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  error: string;
  hasSavedTake: boolean;
  locked: boolean;
  onHearGuide(): void;
  onHearTake(): void;
  onNext(): void;
  onPrevious(): void;
  onRecord(): void;
  onRetrySave(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  recordingElapsedMs: number;
  recordingStream: MediaStream | null;
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

function getGuideAudioId(text: string) {
  try {
    return getStaticAudioLineForSpeech("narrator", text).id;
  } catch {
    return "";
  }
}

export function DubSceneEditor({
  activeLine,
  definition = FIVE_LITTLE_DUCKS_DUB,
  error,
  hasSavedTake,
  locked,
  onHearGuide,
  onHearTake,
  onNext,
  onPrevious,
  onRecord,
  onRetrySave,
  operation,
  pendingTake,
  recordingElapsedMs,
  recordingStream,
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
  const lineNumber = activeLineIndex % definition.linesPerScene + 1;
  const recording = operation === "recording";
  const recordAgain = pendingTake !== null || hasSavedTake || saveRecovery !== null;
  const hasPlayableTake = pendingTake !== null || hasSavedTake;
  const mediaLocked = locked || recording;
  const navigationLocked = mediaLocked || saveRecovery === "save";
  const elapsedMs = Math.min(definition.recordingMs, Math.max(0, recordingElapsedMs));
  const elapsedLabel = formatDuration(elapsedMs);
  const recordingLimitLabel = formatDuration(definition.recordingMs);
  const firstLineInScene = lineNumber === 1;
  const lastLineInScene = lineNumber === definition.linesPerScene;
  const recordLabel = operation === "mic-opening"
    ? "Starting microphone"
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
  const guideAudioId = getGuideAudioId(activeLine.text);
  const feedbackError = Boolean(error)
    && operation !== "mic-opening"
    && operation !== "saving";
  const feedbackLabel = operation === "mic-opening"
    ? "Starting microphone…"
    : operation === "saving"
      ? "Saving your voice…"
      : saveRecovery === "save"
        ? "Not saved"
        : error
          ? error
          : hasPlayableTake
            ? "Recorded ✓"
            : `Up to ${definition.recordingMs / 1_000} seconds`;

  return (
    <main aria-busy={locked} className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-4 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Scene editor workspace" className="mx-auto grid w-full max-w-[1600px] gap-2 short-wide:h-full short-wide:min-h-0 short-wide:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.75fr)_minmax(21rem,0.7fr)] md:gap-4">
        <section className="grid content-start gap-2 short-wide:min-h-0 short-wide:gap-1.5">
          <section aria-label="Scene video" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:max-h-full short-wide:rounded-2xl">
            <IllustratedDubScene compact definition={definition} line={activeLine} />
          </section>
          <h1 className="m-0 rounded-2xl border-4 border-white bg-white/90 px-3 py-2 text-center text-xl font-black leading-snug text-brand-ink shadow-card short-wide:py-1.5 short-wide:text-base md:text-2xl" ref={lineHeadingRef} tabIndex={-1}>
            {activeLine.text}
          </h1>
        </section>

        <aside aria-label="Scene line controls" className="grid content-start gap-2 self-start rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:max-h-full short-wide:min-h-0 short-wide:gap-0.5 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-2 md:gap-3 md:p-4 short-wide:md:gap-0.5 short-wide:md:p-2">
          <p aria-current="step" className="m-0 grid h-7 place-items-center text-center text-lg font-black leading-none text-brand-blue short-wide:h-6 short-wide:text-base md:text-xl">
            Line {lineNumber} of {definition.linesPerScene}
          </p>

          <ActionButton
            disabled={mediaLocked}
            fullWidth
            onClick={onHearGuide}
            shape="rounded"
            size="large"
            variant="surface"
          >
            <Volume2 aria-hidden="true" /> Hear line
          </ActionButton>

          <ActionButton
            aria-label={recordLabel}
            disabled={locked}
            fullWidth
            onClick={onRecord}
            ref={recordButtonRef}
            size="large"
            variant="brand"
          >
            {operation === "mic-opening" || operation === "saving"
              ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              : recording
                ? <Square aria-hidden="true" />
                : <Mic aria-hidden="true" />}
            {operation === "mic-opening"
              ? "Starting…"
              : operation === "saving"
                ? "Saving…"
                : recording
                  ? "Stop"
                  : recordAgain
                    ? "Record again"
                    : "Record"}
          </ActionButton>

          <section aria-label="Recording feedback" className="grid h-36 content-start gap-1.5 overflow-visible rounded-2xl bg-sky-50 p-2 short-wide:h-[5.5rem] short-wide:gap-1 short-wide:p-0.5">
            <DubTakeWaveform
              blob={pendingTake}
              guideAudioId={guideAudioId}
              recordingElapsedMs={recordingElapsedMs}
              recordingStream={recordingStream}
            />
            {recording ? (
              <>
                <p aria-label="Recording duration" className="m-0 flex items-center justify-between gap-2 text-sm font-black text-brand-rose" role="timer">
                  <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full bg-red-600" />Recording</span>
                  <span>{elapsedLabel} / {recordingLimitLabel}</span>
                </p>
                <div
                  aria-label="Recording time"
                  aria-valuemax={definition.recordingMs}
                  aria-valuemin={0}
                  aria-valuenow={elapsedMs}
                  aria-valuetext={`${elapsedLabel} of ${recordingLimitLabel}`}
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-300"
                  role="progressbar"
                >
                  <span
                    aria-hidden="true"
                    className="block h-full rounded-full bg-brand-rose transition-[width] duration-100 motion-reduce:transition-none"
                    style={{ width: `${elapsedMs / definition.recordingMs * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <div className={`flex min-h-10 items-center justify-between gap-1 short-wide:min-h-12 ${feedbackError ? "flex-wrap short-wide:flex-nowrap" : ""}`}>
                <p
                  aria-label={feedbackError ? error : undefined}
                  className={`m-0 min-w-0 text-sm font-black short-wide:text-xs ${feedbackError ? "w-full flex-none break-words leading-tight text-red-800 short-wide:w-auto short-wide:flex-1" : "flex-1 truncate whitespace-nowrap " + (operation === "mic-opening" || operation === "saving" ? "text-brand-rose" : "text-slate-600")}`}
                  role={feedbackError ? "alert" : undefined}
                >
                  {feedbackLabel}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {hasPlayableTake ? (
                    <TextButton aria-label={takeLabel} className="relative z-0 min-h-12 min-w-12 shrink-0 gap-1 rounded-lg bg-white px-2 no-underline shadow-sm focus-visible:z-10 focus-visible:outline-offset-0 short-wide:text-sm" disabled={mediaLocked} onClick={onHearTake}>
                      {operation === "take-playing" ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />} {saveRecovery === "save" ? (operation === "take-playing" ? "Stop" : "Play") : takeLabel}
                    </TextButton>
                  ) : null}
                  {pendingTake && saveRecovery === "save" ? (
                    <TextButton aria-label="Save again" className="relative z-0 min-h-10 shrink-0 rounded-lg bg-white px-2 no-underline shadow-sm focus-visible:z-10 focus-visible:outline-offset-0 short-wide:min-h-12 short-wide:min-w-12 short-wide:text-sm" disabled={locked} onClick={onRetrySave} ref={saveButtonRef}>Save</TextButton>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
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
              aria-label={lastLineInScene ? "Next, finish scene" : "Next line"}
              disabled={navigationLocked}
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
      </section>
    </main>
  );
}
