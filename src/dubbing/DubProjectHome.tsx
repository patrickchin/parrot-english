import { Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { FIVE_LITTLE_DUCKS_DUB } from "./dub-script";
import {
  getFirstActionableDubSceneIndex,
  getDubSceneStatus,
  type DubSceneStatus,
  type DubState,
} from "./dub-state";
import { IllustratedDubScene } from "./IllustratedDubScene";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  error?: string;
  locked: boolean;
  needsRetake: DubState["needsRetake"];
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

function sceneStatusCopy(status: DubSceneStatus, linesPerScene: number) {
  if (status.kind === "not-started") {
    return { accessible: "Ready to start", visible: "Ready to start" };
  }
  if (status.kind === "in-progress") {
    const progress = `${status.recorded} of ${linesPerScene} lines ready`;
    return { accessible: progress, visible: progress };
  }
  if (status.kind === "done") {
    return { accessible: "Scene ready", visible: "Scene ready" };
  }
  return { accessible: "Needs a new take", visible: "Needs a new take" };
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
  const retakeCount = Object.keys(needsRetake).length;
  const sceneLines = getSceneLines(definition);
  const ready = definition.lines.filter(
    ({ id }) => Object.hasOwn(saved, id) && !Object.hasOwn(needsRetake, id),
  ).length;
  const sceneStatuses = sceneLines.map((_, sceneIndex) =>
    getDubSceneStatus({ needsRetake, saved }, sceneIndex, definition),
  );
  const recommendedSceneIndex = getFirstActionableDubSceneIndex(
    { needsRetake, saved },
    definition,
  );
  const recommendedStatus = recommendedSceneIndex === null
    ? null
    : sceneStatuses[recommendedSceneIndex];
  const progressText = ready === 0 && retakeCount === 0
    ? "Ready to start"
    : ready === definition.lines.length
      ? `All ${definition.lines.length} lines ready`
      : `${ready} of ${definition.lines.length} lines ready`;
  const recommendedText = recommendedSceneIndex === null
    ? ""
    : ready === 0 && retakeCount === 0
      ? "Start with Scene 1"
      : recommendedStatus?.kind === "needs-retake"
        ? `Fix Scene ${recommendedSceneIndex + 1}`
        : `Continue with Scene ${recommendedSceneIndex + 1}`;
  const allComplete = recommendedSceneIndex === null;
  const activeLineIndex = Math.max(
    0,
    definition.lines.findIndex(({ id }) => id === activeLine.id),
  );
  const activeSceneIndex = Math.max(
    0,
    Math.floor(activeLineIndex / definition.linesPerScene),
  );
  const activeSceneComplete = sceneStatuses[activeSceneIndex]?.kind === "done";
  const completionText = allComplete
    ? "Your video is ready — great singing!"
    : activeSceneComplete
      ? `Scene ${activeSceneIndex + 1} is ready — great singing!`
      : "";
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24 short-wide:md:px-2 short-wide:md:pt-16">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3 short-wide:max-w-[38rem] short-wide:gap-2">
        <header className="grid min-w-0 items-start gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-center">
          <h1 className="m-0 min-w-0 text-xl leading-tight text-brand-ink short-wide:text-lg md:text-4xl short-wide:md:text-lg">{definition.title}</h1>
          <p
            aria-label="Project recording progress"
            aria-valuemax={definition.lines.length}
            aria-valuemin={0}
            aria-valuenow={ready}
            aria-valuetext={progressText}
            className="m-0 shrink-0 rounded-full bg-white/85 px-3 py-1.5 text-sm font-black text-brand-navy short-wide:px-2 short-wide:py-1 short-wide:text-xs"
            role="progressbar"
          >
            {progressText}
          </p>
        </header>

        <div className="grid min-w-0 items-start gap-4 short-wide:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)] short-wide:lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
          <div className="grid min-w-0 gap-3 short-wide:gap-1">
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

          <aside aria-label="Scene selection" className="grid min-w-0 content-start gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:gap-1.5 short-wide:rounded-2xl short-wide:p-2 md:p-4 short-wide:md:p-2">
            <h2 className="m-0 text-xl text-brand-ink short-wide:sr-only">Choose a scene</h2>
            {completionText ? <p className="m-0 text-center font-black text-brand-ink">{completionText}</p> : null}
            {recommendedSceneIndex !== null ? (
              <ActionButton
                disabled={locked}
                fullWidth
                onClick={() => onOpenScene(recommendedSceneIndex)}
                className="short-wide:h-12 short-wide:min-h-12 short-wide:px-2 short-wide:py-1 short-wide:text-sm short-wide:md:h-12 short-wide:md:text-sm"
                shape="rounded"
                size="large"
                variant="brand"
              >
                {recommendedText}
              </ActionButton>
            ) : null}
            <nav
              aria-label="Scenes"
              className={`grid min-w-0 gap-3 short-wide:gap-1.5 ${sceneLines.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
            >
            {sceneLines.map((_, sceneIndex) => {
              const status = sceneStatuses[sceneIndex];
              const { accessible: statusLabel, visible: statusText } = sceneStatusCopy(
                status,
                definition.linesPerScene,
              );
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
                  aria-current={selected ? "step" : undefined}
                  aria-label={`Scene ${sceneIndex + 1}, ${title}, ${statusLabel}`}
                  className="relative min-h-36 min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-2xl p-2 text-left short-wide:min-h-12 short-wide:gap-0.5 short-wide:rounded-xl short-wide:p-1"
                  disabled={locked}
                  key={sceneIndex}
                  onClick={() => onOpenScene(sceneIndex)}
                  shape="rounded"
                  size="none"
                  variant={selected ? "navy" : "surface"}
                >
                  <img
                    alt=""
                    className="aspect-video w-full rounded-xl object-cover short-wide:hidden"
                    decoding="async"
                    height={artwork.height}
                    loading="lazy"
                    src={artwork.src}
                    width={artwork.width}
                  />
                  <span className="grid min-w-0 gap-0.5 px-1 short-wide:grid-cols-[auto_minmax(0,1fr)] short-wide:items-center short-wide:gap-x-1 short-wide:gap-y-px short-wide:px-0">
                    <span className="text-xs font-black uppercase tracking-wide opacity-75 short-wide:leading-3">Scene {sceneIndex + 1}</span>
                    <strong className="line-clamp-2 text-base leading-tight short-wide:text-xs short-wide:leading-3">{title}</strong>
                    <span className="text-sm font-black short-wide:col-span-2 short-wide:text-xs short-wide:leading-3" data-status-icon={status.kind}>{statusIcon} {statusText}</span>
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
