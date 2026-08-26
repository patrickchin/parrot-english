import { ArrowRight, LoaderCircle, Mic, Play, Square, Volume2 } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton, TextButton } from "../shared/ui";
import { DuckScene } from "./DuckScene";
import { DubTakeWaveform } from "./DubTakeWaveform";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_RECORDING_MS,
  DUB_SCENE_TITLES,
  DUB_VERSES,
  type DubLine,
} from "./dub-script";
import { getDubSceneStatus, type DubOperation } from "./dub-state";

export type DubSceneEditorProps = {
  activeLine: DubLine;
  activeSceneIndex: number;
  error: string;
  locked: boolean;
  needsRetake: ReadonlySet<string>;
  onBack(): void;
  onHearGuide(): void;
  onHearTake(): void;
  onNext(): void;
  onRecord(): void;
  onRetrySave(): void;
  onSelectLine(lineId: string): void;
  onToggleScenePlayback(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  recordingElapsedMs: number;
  nextButtonRef?: RefObject<HTMLButtonElement | null>;
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  saveButtonRef?: RefObject<HTMLButtonElement | null>;
  saveRecovery: "record" | "save" | null;
  sceneHeadingRef?: RefObject<HTMLHeadingElement | null>;
  saved: Readonly<Record<string, string>>;
  lineHeadingRef?: RefObject<HTMLHeadingElement | null>;
  visualLine: DubLine;
};

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getLineState({
  activeLine,
  line,
  needsRetake,
  saved,
}: Pick<DubSceneEditorProps, "activeLine" | "needsRetake" | "saved"> & { line: DubLine }) {
  const kind = needsRetake.has(line.id)
    ? "needs-retake"
    : Object.hasOwn(saved, line.id)
      ? "recorded"
      : "generated";
  const selected = line.id === activeLine.id;
  return {
    accessible: `${selected ? "selected, " : ""}${kind.replace("-", " ")}`,
    kind,
  };
}

export function DubSceneEditor({
  activeLine,
  activeSceneIndex,
  error,
  locked,
  needsRetake,
  onBack,
  onHearGuide,
  onHearTake,
  onNext,
  onRecord,
  onRetrySave,
  onSelectLine,
  onToggleScenePlayback,
  operation,
  pendingTake,
  recordingElapsedMs,
  nextButtonRef,
  playbackButtonRef,
  recordButtonRef,
  saveButtonRef,
  saveRecovery,
  sceneHeadingRef,
  saved,
  lineHeadingRef,
  visualLine,
}: DubSceneEditorProps) {
  const sceneLines = DUB_VERSES[activeSceneIndex] ?? DUB_VERSES[0];
  const sceneTitle = DUB_SCENE_TITLES[activeSceneIndex] ?? DUB_SCENE_TITLES[0];
  const retakeState: Record<string, true> = Object.fromEntries(
    [...needsRetake].map((lineId) => [lineId, true]),
  );
  const sceneStatus = getDubSceneStatus({ needsRetake: retakeState, saved }, activeSceneIndex);
  const activeSceneLineIndex = Math.max(0, DUB_LINES.indexOf(activeLine));
  const sceneNumber = Math.floor(activeSceneLineIndex / DUB_LINES_PER_VERSE) + 1;
  const recording = operation === "recording";
  const recordAgain = pendingTake !== null || saveRecovery !== null;
  const mediaLocked = locked || recording;
  const navigationLocked = mediaLocked || saveRecovery === "save";
  const elapsedMs = Math.min(DUB_RECORDING_MS, Math.max(0, recordingElapsedMs));
  const elapsedLabel = formatDuration(elapsedMs);
  const recordingLimitLabel = formatDuration(DUB_RECORDING_MS);
  const lastLineInScene = activeSceneLineIndex % DUB_LINES_PER_VERSE === DUB_LINES_PER_VERSE - 1;
  const recordLabel = operation === "mic-opening"
    ? "Starting microphone"
    : operation === "saving"
      ? "Saving recording"
      : recording
        ? "Stop recording"
        : recordAgain
          ? "Record again"
          : "Record line";
  const playbackLabel = operation === "playback"
    ? "Stop scene"
    : operation === "playback-loading"
      ? "Loading scene…"
      : "Play scene";
  const takeLabel = operation === "take-playing" ? "Stop my voice" : "Hear my voice";

  return (
    <main aria-busy={locked} className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-4 pt-[3.75rem] short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Scene editor workspace" className="mx-auto grid w-full max-w-[1600px] gap-1.5 short-wide:h-full short-wide:min-h-0 short-wide:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(21rem,0.8fr)] md:gap-3">
        <section className="grid content-start gap-2 short-wide:min-h-0 short-wide:grid-rows-[auto_minmax(0,1fr)] short-wide:gap-1">
          <div className="flex items-center justify-between gap-3">
            <TextButton aria-label="Back to full video" className="min-h-12 gap-1" disabled={navigationLocked} onClick={onBack}>← Video</TextButton>
            <p aria-current="page" className="m-0 font-black text-brand-blue">
              Scene {sceneNumber} of {DUB_VERSES.length}
            </p>
          </div>
          <section aria-label="Scene video" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:max-h-full short-wide:rounded-2xl">
            <DuckScene compact line={visualLine} playing={operation === "playback"} />
          </section>
        </section>

        <aside aria-label="Scene line controls" className="grid content-start gap-1.5 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:min-h-0 short-wide:content-start short-wide:gap-2 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-3 md:gap-3 md:p-4">
          <header className="flex min-w-0 items-center justify-between gap-3">
            <h1 className="m-0 truncate text-lg text-brand-ink short-wide:text-base md:text-2xl" ref={sceneHeadingRef} tabIndex={-1}>{sceneTitle}</h1>
            <p
              aria-label="Scene recording progress"
              aria-valuemax={4}
              aria-valuemin={0}
              aria-valuenow={sceneStatus.recorded}
              aria-valuetext={`${sceneStatus.recorded} of 4 lines recorded`}
              className="m-0 shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-sm font-black text-brand-blue short-wide:text-xs"
              role="progressbar"
            >
              {sceneStatus.recorded} / 4
            </p>
          </header>
          <section aria-label="Scene line selectors" className="grid grid-cols-4 gap-2 short-wide:gap-1">
            {sceneLines.map((line, index) => {
              const selected = line.id === activeLine.id;
              const state = getLineState({ activeLine, line, needsRetake, saved });
              const statusIcon = state.kind === "recorded"
                ? "✓"
                : state.kind === "needs-retake"
                  ? "!"
                  : "○";
              return (
                <ActionButton
                  align="start"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Line ${index + 1}, ${state.accessible}`}
                  className="relative grid min-h-12 min-w-0 place-items-center rounded-xl p-0 text-base short-wide:text-sm"
                  disabled={navigationLocked}
                  key={line.id}
                  onClick={() => onSelectLine(line.id)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <span>{index + 1}</span>
                  <span
                    aria-hidden="true"
                    className={`absolute right-1 top-1 grid size-4 place-items-center rounded-full text-[0.65rem] font-black leading-none ring-1 ring-white ${
                      state.kind === "recorded"
                        ? "bg-emerald-600 text-white"
                        : state.kind === "needs-retake"
                          ? "bg-rose-600 text-white"
                          : selected
                            ? "bg-white text-brand-navy"
                            : "bg-slate-100 text-slate-700"
                    }`}
                    data-status-icon={state.kind}
                  >
                    {statusIcon}
                  </span>
                </ActionButton>
              );
            })}
          </section>

          <section aria-label="Line controls" className="grid gap-2 rounded-2xl bg-sky-50 p-2 short-wide:content-start short-wide:gap-2 short-wide:p-2 md:gap-3 md:p-3">
            <h2 className="m-0 text-lg font-black leading-snug text-brand-ink short-wide:text-base md:text-xl" ref={lineHeadingRef} tabIndex={-1}>{activeLine.text}</h2>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                aria-label={playbackLabel}
                disabled={operation === "playback-loading" || navigationLocked}
                onClick={onToggleScenePlayback}
                ref={playbackButtonRef}
                shape="rounded"
                size="compact"
                variant="surface"
              >
                {operation === "playback" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
                {playbackLabel}
              </ActionButton>
              <ActionButton
                disabled={mediaLocked}
                onClick={onHearGuide}
                shape="rounded"
                size="compact"
                variant="surface"
              >
                <Volume2 aria-hidden="true" /> Hear example
              </ActionButton>
            </div>
            <ActionButton
              aria-label={recordLabel}
              disabled={locked}
              fullWidth
              onClick={onRecord}
              ref={recordButtonRef}
              size="large"
              variant="rose"
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
                      : "Record line"}
            </ActionButton>
            <div className="grid min-h-12 content-center gap-1" aria-label="Recording status">
              {recording ? (
                <>
                  <p aria-label="Recording duration" className="m-0 flex items-center justify-between gap-2 text-sm font-black text-brand-rose" role="timer">
                    <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full bg-red-600" />Recording</span>
                    <span>{elapsedLabel} / {recordingLimitLabel}</span>
                  </p>
                  <div
                    aria-label="Recording time"
                    aria-valuemax={DUB_RECORDING_MS}
                    aria-valuemin={0}
                    aria-valuenow={elapsedMs}
                    aria-valuetext={`${elapsedLabel} of ${recordingLimitLabel}`}
                    className="h-2 w-full overflow-hidden rounded-full bg-slate-300"
                    role="progressbar"
                  >
                    <span
                      aria-hidden="true"
                      className="block h-full rounded-full bg-brand-rose transition-[width] duration-100 motion-reduce:transition-none"
                      style={{ width: `${elapsedMs / DUB_RECORDING_MS * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className={`m-0 text-center text-sm font-black ${operation === "mic-opening" || operation === "saving" ? "text-brand-rose" : "text-slate-600"}`}>
                  {operation === "mic-opening"
                    ? "Connecting microphone…"
                    : operation === "saving"
                      ? "Saving your voice…"
                      : saveRecovery === "save"
                        ? "Not saved"
                        : pendingTake
                          ? "Saved ✓"
                          : `Up to ${DUB_RECORDING_MS / 1_000} seconds`}
                </p>
              )}
            </div>
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
            {pendingTake ? (
              <section aria-label="Your recorded line" className="grid gap-2 rounded-xl bg-cyan-50 p-2">
                <DubTakeWaveform blob={pendingTake} />
                <TextButton aria-label={takeLabel} className="min-h-12 justify-self-start gap-2" disabled={mediaLocked} onClick={onHearTake}>
                  {operation === "take-playing" ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />} {takeLabel}
                </TextButton>
                {saveRecovery === "save" ? (
                  <TextButton className="min-h-12 justify-self-start" disabled={locked} onClick={onRetrySave} ref={saveButtonRef}>Save again</TextButton>
                ) : null}
              </section>
            ) : null}
          </section>

          {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
        </aside>
      </section>
    </main>
  );
}
