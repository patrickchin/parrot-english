import { Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton, TextButton } from "../shared/ui";
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
  deleting: boolean;
  error?: string;
  locked: boolean;
  needsRetake: ReadonlySet<string>;
  onContinue(): void;
  onDelete(): void;
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
  deleting,
  error = "",
  locked,
  needsRetake,
  onContinue,
  onDelete,
  onOpenScene,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  saved,
  visualLine = activeLine,
}: DubProjectHomeProps) {
  const recorded = DUB_LINES.filter(({ id }) => Object.hasOwn(saved, id)).length;
  const allSaved = recorded === DUB_LINES.length;
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
    <main aria-busy={deleting} className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3 short-wide:h-full short-wide:min-h-0 short-wide:grid-cols-[minmax(0,3fr)_minmax(17rem,1fr)] short-wide:grid-rows-[auto_minmax(0,1fr)] short-wide:gap-2 tall-wide:h-full tall-wide:min-h-0 tall-wide:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] tall-wide:grid-rows-[auto_minmax(0,1fr)]">
        <header className="flex min-w-0 items-center justify-between gap-3 short-wide:col-span-2 tall-wide:col-span-2">
          <h1 className="m-0 truncate text-xl text-brand-ink short-wide:text-lg md:text-4xl">Five Little Ducks</h1>
          <p
            aria-label="Project recording progress"
            aria-valuemax={DUB_LINES.length}
            aria-valuemin={0}
            aria-valuenow={recorded}
            aria-valuetext={`${recorded} of ${DUB_LINES.length} clips recorded`}
            className="m-0 shrink-0 rounded-full bg-white/85 px-3 py-1.5 text-sm font-black text-brand-navy short-wide:px-2 short-wide:py-1 short-wide:text-xs"
            role="progressbar"
          >
            {recorded} / {DUB_LINES.length}
          </p>
        </header>

        <div className="grid min-h-0 gap-2 short-wide:col-start-1 short-wide:row-start-2 short-wide:h-full short-wide:max-h-full short-wide:grid-rows-[minmax(0,1fr)_3rem] short-wide:self-center tall-wide:col-start-1 tall-wide:row-start-2 tall-wide:h-full tall-wide:max-h-full tall-wide:grid-rows-[minmax(0,1fr)_3rem] tall-wide:self-center">
          <section
            aria-label="Full video player"
            className="grid aspect-video min-h-0 w-full overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:h-full short-wide:w-auto short-wide:max-w-full short-wide:justify-self-center short-wide:rounded-2xl tall-wide:h-full tall-wide:w-auto tall-wide:max-w-full tall-wide:justify-self-center"
          >
            <DuckScene compact line={visualLine} playing={playback === "playing"} />
          </section>
          <ActionButton
            aria-label={playbackLabel}
            className="h-12 min-h-12 min-w-28 justify-self-start gap-2 border-2 bg-brand-navy/95 px-4 text-base short-wide:px-3 short-wide:text-sm"
            disabled={playback === "loading" || locked}
            onClick={onTogglePlayback}
            ref={playbackButtonRef}
            size="none"
            variant="navy"
          >
            {playback === "playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play"}
          </ActionButton>
        </div>

        <div className="grid min-w-0 gap-3 short-wide:col-start-2 short-wide:row-start-2 short-wide:min-h-0 short-wide:grid-rows-[auto_minmax(0,1fr)_auto] short-wide:gap-2 tall-wide:col-start-2 tall-wide:row-start-2 tall-wide:min-h-0 tall-wide:grid-rows-[auto_minmax(0,1fr)_auto]">
          <div className="flex justify-end">
            {!allSaved ? (
              <ActionButton aria-label={`Continue Scene ${continueSceneIndex + 1}`} className="w-full short-wide:h-12 short-wide:min-h-12 short-wide:px-3 short-wide:text-base" disabled={locked} onClick={onContinue} size="large">
                Continue
              </ActionButton>
            ) : null}
          </div>

          <nav aria-label="Scenes" className="relative grid min-w-0 max-w-full grid-flow-col auto-cols-[minmax(6.5rem,1fr)] gap-2 overflow-x-auto pb-2 short-wide:min-h-0 short-wide:grid-flow-row short-wide:grid-cols-3 short-wide:content-start short-wide:gap-1 short-wide:overflow-visible short-wide:pb-0 md:grid-flow-row md:grid-cols-6 md:overflow-visible short-wide:md:grid-cols-3 tall-wide:min-h-0 tall-wide:grid-flow-row tall-wide:grid-cols-2 tall-wide:content-start tall-wide:overflow-visible tall-wide:pb-0">
            {DUB_VERSES.map((lines, sceneIndex) => {
              const status = getDubSceneStatus({ needsRetake: retakeState, saved }, sceneIndex);
              const statusLabel = sceneStatusLabel(status);
              const statusIcon = status.kind === "done"
                ? "✓"
                : status.kind === "needs-retake"
                  ? "!"
                  : status.kind === "in-progress"
                    ? "◐"
                    : "○";
              const selected = sceneIndex === activeSceneIndex;
              return (
                <ActionButton
                  aria-current={selected ? "page" : undefined}
                  aria-label={`Scene ${sceneIndex + 1}, ${statusLabel}`}
                  className="relative min-h-20 min-w-0 flex-col gap-1 overflow-hidden rounded-2xl px-1.5 py-1.5 text-sm short-wide:h-[4.55rem] short-wide:min-h-0 short-wide:gap-0 short-wide:p-1"
                  disabled={locked}
                  key={sceneIndex}
                  onClick={() => onOpenScene(sceneIndex)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <span aria-label={`Scene ${sceneIndex + 1} thumbnail`} className="block h-10 w-full overflow-hidden rounded-xl short-wide:h-8" role="img">
                    <DuckScene line={lines[0]} thumbnail />
                  </span>
                  <span aria-hidden="true" className="leading-none">{sceneIndex + 1}</span>
                  <span
                    aria-hidden="true"
                    className={`absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full text-[0.72rem] font-black leading-none ring-2 ring-white ${
                      status.kind === "done"
                        ? "bg-emerald-600 text-white"
                        : status.kind === "needs-retake"
                          ? "bg-rose-600 text-white"
                          : status.kind === "in-progress"
                            ? "bg-amber-300 text-slate-950"
                            : "bg-slate-100 text-slate-700"
                    }`}
                    data-status-icon={status.kind}
                  >
                    {statusIcon}
                  </span>
                </ActionButton>
              );
            })}
          </nav>

          <details className="group justify-self-start rounded-xl bg-white/70 px-2">
            <summary
              aria-label="More grown-up options"
              className="flex min-h-12 cursor-pointer list-none items-center gap-1 px-1 font-ui text-sm font-black text-brand-blue focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
            >
              More
              <span aria-hidden="true" className="group-open:rotate-180">▾</span>
            </summary>
            <TextButton className="mb-2 min-h-12 text-red-800" disabled={locked} onClick={onDelete}>
              {deleting ? "Deleting my dub…" : "Delete my dub"}
            </TextButton>
          </details>
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
