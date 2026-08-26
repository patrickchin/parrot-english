import { Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { DuckScene } from "./DuckScene";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_VERSES,
  type DubLine,
} from "./dub-script";
import { getDubSceneStatus, type DubSceneStatus } from "./dub-state";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  error?: string;
  locked: boolean;
  needsRetake: ReadonlySet<string>;
  onContinue(): void;
  onOpenScene(sceneIndex: number): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  saved: Readonly<Record<string, string>>;
  visualLine?: DubLine;
};

function sceneStatusLabel(status: DubSceneStatus) {
  if (status.kind === "not-started") return "Not started";
  if (status.kind === "in-progress") return `${status.recorded} / 4`;
  if (status.kind === "done") return "Done";
  return "Needs retake";
}

export function DubProjectHome({
  activeLine,
  error = "",
  locked,
  needsRetake,
  onContinue,
  onOpenScene,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  saved,
  visualLine = activeLine,
}: DubProjectHomeProps) {
  const recorded = DUB_LINES.filter(({ id }) => Object.hasOwn(saved, id)).length;
  const allSaved = recorded === DUB_LINES.length;
  const allUsable = allSaved && needsRetake.size === 0;
  const retakeState: Record<string, true> = Object.fromEntries(
    [...needsRetake].map((lineId) => [lineId, true]),
  );
  const firstMissingLineIndex = DUB_LINES.findIndex(({ id }) => !Object.hasOwn(saved, id));
  const continueSceneIndex = Math.floor(firstMissingLineIndex / DUB_LINES_PER_VERSE);
  const activeSceneIndex = Math.max(
    0,
    Math.floor(DUB_LINES.indexOf(activeLine) / DUB_LINES_PER_VERSE),
  );
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-6 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-5 short-wide:min-h-full short-wide:grid-cols-[minmax(0,3fr)_minmax(15rem,2fr)] short-wide:grid-rows-[auto_auto] short-wide:gap-2">
        <header className="flex flex-wrap items-end justify-between gap-3 short-wide:col-span-2 short-wide:gap-2">
          <div>
            <p className="m-0 text-sm font-black uppercase tracking-[0.16em] text-brand-blue">
              {allUsable ? "Your dub" : "Draft"}
            </p>
            <h1 className="m-0 text-3xl text-brand-ink short-wide:text-xl md:text-5xl">Five Little Ducks</h1>
          </div>
          <p className="m-0 rounded-full bg-white/85 px-4 py-2 text-sm font-black text-brand-navy short-wide:px-2 short-wide:py-1 short-wide:text-xs">
            {allSaved ? "All scenes recorded" : `${recorded} of ${DUB_LINES.length} voice clips recorded`}
          </p>
        </header>

        <section
          aria-label="Full video player"
          className="grid aspect-video min-h-0 overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:col-start-1 short-wide:row-start-2 short-wide:max-h-full short-wide:self-center short-wide:rounded-2xl"
        >
          <DuckScene compact line={visualLine} playing={playback === "playing"} />
        </section>

        <div className="contents short-wide:col-start-2 short-wide:row-start-2 short-wide:grid short-wide:min-h-0 short-wide:grid-rows-[auto_minmax(0,1fr)] short-wide:gap-1">
          <div className="flex flex-wrap justify-between gap-3 short-wide:grid short-wide:grid-cols-2 short-wide:gap-1">
            <ActionButton
              aria-label={playbackLabel}
              className="short-wide:min-w-0 short-wide:gap-1 short-wide:px-1 short-wide:text-xs"
              disabled={playback === "loading" || locked}
              onClick={onTogglePlayback}
              ref={playbackButtonRef}
              size="large"
              variant="navy"
            >
              {playback === "playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playbackLabel}
            </ActionButton>
            {!allSaved ? (
              <ActionButton className="short-wide:min-w-0 short-wide:px-1 short-wide:text-xs" disabled={locked} onClick={onContinue} size="large">
                Continue Scene {continueSceneIndex + 1}
              </ActionButton>
            ) : null}
          </div>

          <nav aria-label="Scenes" className="relative grid min-w-0 max-w-full grid-flow-col auto-cols-[minmax(8.5rem,1fr)] gap-2 overflow-x-auto pb-2 short-wide:min-h-0 short-wide:grid-flow-row short-wide:grid-cols-3 short-wide:gap-1 short-wide:overflow-visible short-wide:pb-0 md:grid-flow-row md:grid-cols-6 md:overflow-visible">
            {DUB_VERSES.map((lines, sceneIndex) => {
              const status = getDubSceneStatus({ needsRetake: retakeState, saved }, sceneIndex);
              const statusLabel = sceneStatusLabel(status);
              const selected = sceneIndex === activeSceneIndex;
              return (
                <ActionButton
                  aria-current={selected ? "page" : undefined}
                  aria-label={`Scene ${sceneIndex + 1}, ${statusLabel}`}
                  className="min-h-24 min-w-0 flex-col gap-1 rounded-2xl px-2 py-2 text-sm short-wide:min-h-0 short-wide:h-20 short-wide:gap-0.5 short-wide:px-1 short-wide:py-1 short-wide:text-xs"
                  disabled={locked}
                  key={sceneIndex}
                  onClick={() => onOpenScene(sceneIndex)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <span aria-label={`Scene ${sceneIndex + 1} thumbnail`} className="block h-10 w-full overflow-hidden rounded-lg short-wide:h-7" role="img">
                    <DuckScene line={lines[0]} thumbnail />
                  </span>
                  <span>Scene {sceneIndex + 1}</span>
                  <span className="text-xs normal-case short-wide:text-[0.65rem]">{statusLabel}</span>
                </ActionButton>
              );
            })}
          </nav>
        </div>

        {error ? (
          <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
            {error}
          </p>
        ) : null}

      </section>
    </main>
  );
}
