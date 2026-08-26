import { Mic, Play, Square, Volume2 } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton, TextButton } from "../shared/ui";
import { DuckScene } from "./DuckScene";
import { DubTakeWaveform } from "./DubTakeWaveform";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
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
  onRecord(): void;
  onRetrySave(): void;
  onSelectLine(lineId: string): void;
  onToggleScenePlayback(): void;
  operation: DubOperation;
  pendingTake: Blob | null;
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  recordButtonRef?: RefObject<HTMLButtonElement | null>;
  saveButtonRef?: RefObject<HTMLButtonElement | null>;
  saveRecovery: "record" | "save" | null;
  sceneHeadingRef?: RefObject<HTMLHeadingElement | null>;
  saved: Readonly<Record<string, string>>;
  lineHeadingRef?: RefObject<HTMLHeadingElement | null>;
  visualLine: DubLine;
};

function getLineState({
  activeLine,
  line,
  needsRetake,
  saved,
}: Pick<DubSceneEditorProps, "activeLine" | "needsRetake" | "saved"> & { line: DubLine }) {
  const label = needsRetake.has(line.id)
    ? "Needs retake"
    : Object.hasOwn(saved, line.id)
      ? "Recorded"
      : "Generated";
  const selected = line.id === activeLine.id;
  return {
    accessible: `${selected ? "selected, " : ""}${label.toLowerCase()}`,
    label: selected ? `Selected · ${label}` : label,
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
  onRecord,
  onRetrySave,
  onSelectLine,
  onToggleScenePlayback,
  operation,
  pendingTake,
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
  const playbackLabel = operation === "playback"
    ? "Stop this scene"
    : operation === "playback-loading"
      ? "Loading scene…"
      : "Play this scene";
  const takeLabel = operation === "take-playing" ? "Stop my voice" : "Hear my voice";

  return (
    <main aria-busy={locked} className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-6 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Scene editor workspace" className="mx-auto grid w-full max-w-[1600px] gap-5 short-wide:h-full short-wide:min-h-0 short-wide:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.9fr)]">
        <section className="grid content-start gap-4 short-wide:min-h-0 short-wide:grid-rows-[auto_minmax(0,1fr)] short-wide:gap-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TextButton className="min-h-12 gap-1" disabled={navigationLocked} onClick={onBack}>Back to full video</TextButton>
            <p aria-current="page" className="m-0 font-black text-brand-blue">
              Scene {sceneNumber} of {DUB_VERSES.length}
            </p>
          </div>
          <section aria-label="Scene video" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:max-h-full short-wide:rounded-2xl">
            <DuckScene compact line={visualLine} playing={operation === "playback"} />
          </section>
        </section>

        <aside aria-label="Scene line controls" className="grid content-start gap-4 rounded-3xl border-4 border-white bg-white/90 p-4 shadow-card short-wide:min-h-0 short-wide:grid-cols-[6.5rem_minmax(0,1fr)] short-wide:grid-rows-[auto_minmax(0,1fr)] short-wide:content-stretch short-wide:gap-1 short-wide:rounded-2xl short-wide:p-2">
          <div className="short-wide:col-span-2 short-wide:flex short-wide:items-end short-wide:justify-between short-wide:gap-2">
            <p className="m-0 text-sm font-black uppercase tracking-[0.16em] text-brand-blue">Choose a line</p>
            <div>
              <h1 className="m-0 text-2xl text-brand-ink short-wide:text-lg" ref={sceneHeadingRef} tabIndex={-1}>{sceneTitle}</h1>
              <p className="m-0 text-sm font-black text-brand-blue short-wide:text-xs">{sceneStatus.recorded} of 4 recorded</p>
            </div>
          </div>
          <section aria-label="Scene line selectors" className="grid grid-cols-2 gap-2 short-wide:grid-cols-1 short-wide:gap-1">
            {sceneLines.map((line, index) => {
              const selected = line.id === activeLine.id;
              const state = getLineState({ activeLine, line, needsRetake, saved });
              return (
                <ActionButton
                  align="start"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Line ${index + 1}, ${state.accessible}`}
                  className="grid min-h-16 w-full min-w-0 content-center justify-items-start gap-1 rounded-2xl px-2 py-2 text-left text-sm short-wide:min-h-12 short-wide:gap-0 short-wide:px-1.5 short-wide:py-1 short-wide:text-xs"
                  disabled={navigationLocked}
                  key={line.id}
                  onClick={() => onSelectLine(line.id)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <span>Line {index + 1}</span>
                  <span className="text-xs normal-case short-wide:text-[0.65rem]">{state.label}</span>
                </ActionButton>
              );
            })}
          </section>

          <section aria-label="Line controls" className="grid gap-3 rounded-2xl bg-sky-50 p-3 short-wide:col-start-2 short-wide:row-start-2 short-wide:min-h-0 short-wide:content-start short-wide:gap-1 short-wide:p-1.5">
            <h2 className="m-0 text-xl font-black leading-snug text-brand-ink short-wide:text-sm" ref={lineHeadingRef} tabIndex={-1}>{activeLine.text}</h2>
            <ActionButton
              aria-label={playbackLabel}
              disabled={operation === "playback-loading" || navigationLocked}
              onClick={onToggleScenePlayback}
              ref={playbackButtonRef}
              size="large"
              variant="navy"
            >
              {operation === "playback" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playbackLabel}
            </ActionButton>
            <TextButton className="min-h-12 justify-self-start gap-2" disabled={mediaLocked} onClick={onHearGuide}>
              <Volume2 aria-hidden="true" /> Hear example
            </TextButton>
            <ActionButton
              aria-label={recording ? "Stop recording" : recordAgain ? "Record again" : "Record line"}
              disabled={locked}
              fullWidth
              onClick={onRecord}
              ref={recordButtonRef}
              size="large"
              variant="rose"
            >
              {recording ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
              {recording ? "Stop recording" : recordAgain ? "Record again" : "Record line"}
            </ActionButton>
            {saveRecovery === "save" ? (
              <TextButton className="min-h-12 justify-self-start" disabled={locked} onClick={onRetrySave} ref={saveButtonRef}>Save again</TextButton>
            ) : null}
          </section>

          {operation === "mic-opening" || operation === "recording" || operation === "saving" ? (
            <p className="m-0 font-black text-brand-rose">
              {operation === "mic-opening"
                ? "Opening microphone…"
                : operation === "recording"
                  ? "Recording…"
                  : "Saving your take…"}
            </p>
          ) : null}

          {pendingTake ? (
            <section aria-label="Your recorded line" className="grid gap-2 rounded-2xl border-3 border-cyan-200 bg-cyan-50 p-3">
              <DubTakeWaveform blob={pendingTake} />
              <TextButton aria-label={takeLabel} className="min-h-12 justify-self-start gap-2" disabled={mediaLocked} onClick={onHearTake}>
                {operation === "take-playing" ? <Square aria-hidden="true" /> : <Volume2 aria-hidden="true" />} {takeLabel}
              </TextButton>
            </section>
          ) : null}
          {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
        </aside>
      </section>
    </main>
  );
}
