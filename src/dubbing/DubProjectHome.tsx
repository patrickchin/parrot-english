import { Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import { getDubSceneStatus, type DubSceneStatus } from "./dub-state";
import { IllustratedDubScene } from "./IllustratedDubScene";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  error?: string;
  locked: boolean;
  needsRetake: ReadonlySet<string>;
  onOpenScene(sceneIndex: number): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  saved: Readonly<Record<string, string>>;
  visualLine?: DubLine;
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

function sceneStatusLabel(status: DubSceneStatus, linesPerScene: number) {
  if (status.kind === "not-started") return "Not started";
  if (status.kind === "in-progress") return `${status.recorded} / ${linesPerScene}`;
  if (status.kind === "done") return "Done";
  return "Needs retake";
}

function sceneStatusText(status: DubSceneStatus, linesPerScene: number) {
  if (status.kind === "done") return "Done";
  if (status.kind === "needs-retake") return "Retake";
  return `${status.recorded} / ${linesPerScene}`;
}

export function DubProjectHome({
  activeLine,
  definition = FIVE_LITTLE_DUCKS_DUB,
  error = "",
  locked,
  needsRetake,
  onOpenScene,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  saved,
  visualLine = activeLine,
}: DubProjectHomeProps) {
  const recorded = definition.lines.filter(({ id }) => Object.hasOwn(saved, id)).length;
  const retakeState: Record<string, true> = Object.fromEntries(
    [...needsRetake].map((lineId) => [lineId, true]),
  );
  const sceneLines = getSceneLines(definition);
  const activeLineIndex = Math.max(
    0,
    definition.lines.findIndex(({ id }) => id === activeLine.id),
  );
  const activeSceneIndex = Math.max(
    0,
    Math.floor(activeLineIndex / definition.linesPerScene),
  );
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3">
        <header className="flex min-w-0 items-center justify-between gap-3">
          <h1 className="m-0 truncate text-xl text-brand-ink short-wide:text-lg md:text-4xl">{definition.title}</h1>
          <p
            aria-label="Project recording progress"
            aria-valuemax={definition.lines.length}
            aria-valuemin={0}
            aria-valuenow={recorded}
            aria-valuetext={`${recorded} of ${definition.lines.length} clips recorded`}
            className="m-0 shrink-0 rounded-full bg-white/85 px-3 py-1.5 text-sm font-black text-brand-navy short-wide:px-2 short-wide:py-1 short-wide:text-xs"
            role="progressbar"
          >
            {recorded} / {definition.lines.length}
          </p>
        </header>

        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)]">
          <div className="grid min-w-0 gap-3">
            <section
              aria-label="Full video player"
              className="grid aspect-video min-h-0 w-full overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"
            >
              <IllustratedDubScene
                compact
                definition={definition}
                line={visualLine}
                playing={playback === "playing"}
              />
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

          <aside aria-label="Scene selection" className="grid min-w-0 content-start gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card md:p-4">
            <h2 className="m-0 text-xl text-brand-ink">Choose a scene</h2>
            <nav aria-label="Scenes" className="grid min-w-0 grid-cols-2 gap-3">
            {sceneLines.map((_, sceneIndex) => {
              const status = getDubSceneStatus({ needsRetake: retakeState, saved }, sceneIndex, definition);
              const statusLabel = sceneStatusLabel(status, definition.linesPerScene);
              const statusText = sceneStatusText(status, definition.linesPerScene);
              const statusIcon = status.kind === "done"
                ? "✓"
                : status.kind === "needs-retake"
                  ? "!"
                  : status.kind === "in-progress"
                    ? "◐"
                    : "○";
              const selected = sceneIndex === activeSceneIndex;
              const artwork = definition.sceneArtwork[sceneIndex];
              const title = definition.sceneTitles[sceneIndex];
              return (
                <ActionButton
                  aria-current={selected ? "page" : undefined}
                  aria-label={`Scene ${sceneIndex + 1}, ${title}, ${statusLabel}`}
                  className="relative min-h-36 min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-2xl p-2 text-left short-wide:min-h-28"
                  disabled={locked}
                  key={sceneIndex}
                  onClick={() => onOpenScene(sceneIndex)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <img
                    alt=""
                    className="aspect-video w-full rounded-xl object-cover"
                    decoding="async"
                    height={artwork.height}
                    loading="lazy"
                    src={artwork.src}
                    width={artwork.width}
                  />
                  <span className="grid min-w-0 gap-0.5 px-1">
                    <span className="text-xs font-black uppercase tracking-wide opacity-75">Scene {sceneIndex + 1}</span>
                    <strong className="truncate text-base leading-tight">{title}</strong>
                    <span className="text-sm font-black" data-status-icon={status.kind}>{statusIcon} {statusText}</span>
                  </span>
                </ActionButton>
              );
            })}
            </nav>
          </aside>
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
