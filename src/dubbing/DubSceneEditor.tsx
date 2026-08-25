import { Mic, Play, Square, Volume2 } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton, TextButton } from "../shared/ui";
import { DuckScene } from "./DuckScene";
import { DubTakeWaveform } from "./DubTakeWaveform";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_VERSES,
  type DubLine,
} from "./dub-script";
import type { DubOperation } from "./dub-state";

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

function lineState({
  activeLine,
  line,
  needsRetake,
  saved,
}: Pick<DubSceneEditorProps, "activeLine" | "needsRetake" | "saved"> & { line: DubLine }) {
  const state = needsRetake.has(line.id)
    ? "needs retake"
    : Object.hasOwn(saved, line.id)
      ? "recorded"
      : "generated";
  return line.id === activeLine.id ? `selected, ${state}` : state;
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
    <main aria-busy={locked} className="min-h-dvh overflow-x-hidden bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section aria-label="Scene editor workspace" className="mx-auto grid w-full max-w-[1600px] gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.9fr)]">
        <section className="grid content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TextButton className="min-h-12 gap-1" disabled={navigationLocked} onClick={onBack}>Back to full video</TextButton>
            <p aria-current="page" className="m-0 font-black text-brand-blue">
              Scene {sceneNumber} of {DUB_VERSES.length}
            </p>
          </div>
          <section aria-label="Scene video" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card">
            <DuckScene compact line={visualLine} playing={operation === "playback"} />
          </section>
        </section>

        <aside aria-label="Scene line controls" className="grid content-start gap-4 rounded-3xl border-4 border-white bg-white/90 p-4 shadow-card">
          <div>
            <p className="m-0 text-sm font-black uppercase tracking-[0.16em] text-brand-blue">Choose a line</p>
            <h1 className="m-0 text-2xl text-brand-ink" ref={sceneHeadingRef} tabIndex={-1}>Record this scene</h1>
          </div>
          <section aria-label="Scene line selectors" className="grid grid-cols-2 gap-2">
            {sceneLines.map((line, index) => {
              const selected = line.id === activeLine.id;
              return (
                <ActionButton
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Line ${index + 1}, ${lineState({ activeLine, line, needsRetake, saved })}`}
                  className="min-h-16 rounded-2xl px-3 py-2 text-left text-sm"
                  disabled={navigationLocked}
                  key={line.id}
                  onClick={() => onSelectLine(line.id)}
                  shape="rounded"
                  variant={selected ? "navy" : "surface"}
                >
                  Line {index + 1}
                </ActionButton>
              );
            })}
          </section>

          <section aria-label="Line controls" className="grid gap-3 rounded-2xl bg-sky-50 p-3">
            <h2 className="m-0 text-xl font-black leading-snug text-brand-ink" ref={lineHeadingRef} tabIndex={-1}>{activeLine.text}</h2>
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
