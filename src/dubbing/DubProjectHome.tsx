import {
  Circle,
  CircleCheck,
  CircleDashed,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { retryOriginalImage } from "../shared/responsive-image";
import type { DubState, DubSceneStatus } from "./dub-state";
import {
  getDubSceneStatus,
  getFirstActionableDubSceneIndex,
} from "./dub-state";
import {
  DubMelodyLane,
  DubTimedWords,
  type DubGuidancePosition,
} from "./DubKaraokeGuide";
import { IllustratedDubScene } from "./IllustratedDubScene";
import { dubArtworkSrcSet } from "./dub-artwork";
import {
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog";

const DUB_THUMBNAIL_IMAGE_SIZES =
  "(min-width: 560px) and (max-height: 620px) 1px, (max-width: 1023px) calc((100vw - 3.75rem) / 2), 12rem";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  definition: DubDefinition;
  editor?: ReactNode;
  error?: string;
  guidance?: DubGuidancePosition | null;
  locked: boolean;
  needsRetake: DubState["needsRetake"];
  onOpenScene(sceneIndex: number): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  playbackLocked?: boolean;
  saved: Readonly<Record<string, string>>;
  sceneButtonRef?: RefObject<HTMLButtonElement | null>;
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
  if (status.kind === "not-started") return "Ready to start";
  if (status.kind === "in-progress") {
    return `${status.recorded} of ${linesPerScene} lines ready`;
  }
  if (status.kind === "done") return "Scene ready";
  return "Needs a new take";
}

function SceneStatusIcon({ kind }: { kind: DubSceneStatus["kind"] }) {
  if (kind === "done") return <CircleCheck aria-hidden="true" className="size-5" />;
  if (kind === "needs-retake") return <RotateCcw aria-hidden="true" className="size-5" />;
  if (kind === "in-progress") return <CircleDashed aria-hidden="true" className="size-5" />;
  return <Circle aria-hidden="true" className="size-5" />;
}

export function DubProjectHome({
  activeLine,
  definition,
  editor,
  error = "",
  guidance = null,
  locked,
  needsRetake,
  onOpenScene,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  playbackLocked = locked,
  saved,
  sceneButtonRef,
  visualLine = activeLine,
}: DubProjectHomeProps) {
  const sceneLines = getSceneLines(definition);
  const ready = definition.lines.filter(
    ({ id }) => Object.hasOwn(saved, id) && !Object.hasOwn(needsRetake, id),
  ).length;
  const retakeCount = Object.keys(needsRetake).length;
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
  const activeLineIndex = Math.max(
    0,
    definition.lines.findIndex(({ id }) => id === activeLine.id),
  );
  const activeSceneIndex = Math.floor(activeLineIndex / definition.linesPerScene);
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";
  const guidanceLine = playback === "playing" && guidance?.lineId
    ? definition.lines.find(({ id }) => id === guidance.lineId)
    : undefined;

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24 short-wide:md:px-2 short-wide:md:pt-16">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3 short-wide:gap-2">
        <header className="grid min-w-0 items-start gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-center">
          <h1 className="m-0 min-w-0 text-2xl leading-tight text-brand-ink text-balance short-wide:text-xl md:text-4xl short-wide:md:text-xl">
            {definition.title}
          </h1>
          <p
            aria-label="Project recording progress"
            aria-valuemax={definition.lines.length}
            aria-valuemin={0}
            aria-valuenow={ready}
            aria-valuetext={progressText}
            className="m-0 shrink-0 rounded-full bg-white/90 px-3 py-2 text-sm font-black text-brand-navy"
            role="progressbar"
          >
            {progressText}
          </p>
        </header>

        <div className="grid min-w-0 items-start gap-4 short-wide:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] short-wide:gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)]">
          {editor}

          <div className={`grid min-w-0 content-start gap-3 short-wide:gap-2 ${editor ? "order-2 short-wide:order-1 lg:order-1" : ""}`}>
            <section
              aria-label="Full video player"
              className="grid aspect-video min-h-0 w-full overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:rounded-2xl"
            >
              <IllustratedDubScene
                compact
                definition={definition}
                line={visualLine}
                playing={playback === "playing"}
              />
            </section>

            {!editor && guidanceLine ? (
              <section aria-label="Karaoke guide" className="grid gap-1 rounded-2xl bg-white/90 px-3 py-2 text-center text-base font-black leading-snug text-brand-ink shadow-sm">
                <p className="m-0">
                  <DubTimedWords elapsedMs={guidance?.elapsedMs ?? null} line={guidanceLine} />
                </p>
                <DubMelodyLane
                  definition={definition}
                  elapsedMs={guidance?.elapsedMs ?? null}
                  line={guidanceLine}
                />
              </section>
            ) : null}

            {!editor ? (
              <ActionButton
                aria-label={playbackLabel}
                className="min-h-12 min-w-32 justify-self-start gap-2 px-4 text-base"
                disabled={playback === "loading" || playbackLocked}
                onClick={onTogglePlayback}
                ref={playbackButtonRef}
                size="none"
                variant="navy"
              >
                {playback === "playing"
                  ? <Square aria-hidden="true" />
                  : <Play aria-hidden="true" />}
                {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play video"}
              </ActionButton>
            ) : null}
          </div>

          {!editor ? (
            <aside aria-label="Scene selection" className="grid min-w-0 content-start gap-3 rounded-3xl border-4 border-white bg-white/95 p-4 shadow-card short-wide:max-h-full short-wide:min-h-0 short-wide:gap-2 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-3 md:p-5 short-wide:md:p-3">
              <h2 className="m-0 text-xl font-black text-brand-ink text-balance md:text-2xl short-wide:md:text-xl">
                Choose a scene
              </h2>
              {recommendedSceneIndex === null ? (
                <p className="m-0 rounded-2xl bg-emerald-100 p-3 text-center text-base font-black text-emerald-900">
                  Your video is ready — great singing!
                </p>
              ) : (
                <ActionButton
                  disabled={locked}
                  fullWidth
                  onClick={() => onOpenScene(recommendedSceneIndex)}
                  shape="rounded"
                  size="large"
                  variant="brand"
                >
                  {recommendedText}
                </ActionButton>
              )}

              <nav aria-label="Scenes" className={`grid min-w-0 gap-3 ${sceneLines.length === 1 ? "grid-cols-1" : "grid-cols-1 min-[360px]:grid-cols-2"}`}>
                {sceneLines.map((_, sceneIndex) => {
                  const status = sceneStatuses[sceneIndex];
                  const statusText = sceneStatusCopy(status, definition.linesPerScene);
                  const selected = sceneIndex === activeSceneIndex;
                  const artwork = definition.sceneArtwork[sceneIndex];
                  const title = definition.sceneTitles[sceneIndex];
                  return (
                    <ActionButton
                      aria-label={`Scene ${sceneIndex + 1}, ${title}, ${statusText}`}
                      className="min-w-0 flex-col items-stretch gap-2 overflow-hidden rounded-2xl p-2 text-left short-wide:gap-1 short-wide:rounded-xl"
                      disabled={locked}
                      key={sceneIndex}
                      onClick={() => onOpenScene(sceneIndex)}
                      ref={selected ? sceneButtonRef : undefined}
                      shape="rounded"
                      size="none"
                      variant="surface"
                    >
                      <img
                        alt=""
                        className="aspect-video w-full rounded-xl object-cover short-wide:hidden"
                        decoding="async"
                        height={artwork.height}
                        loading="lazy"
                        onError={({ currentTarget }) => retryOriginalImage(currentTarget)}
                        sizes={DUB_THUMBNAIL_IMAGE_SIZES}
                        src={artwork.src}
                        srcSet={dubArtworkSrcSet(artwork.src)}
                        width={artwork.width}
                      />
                      <span className="grid min-w-0 gap-1 px-1 short-wide:px-0">
                        <span className="text-sm font-black text-brand-blue">Scene {sceneIndex + 1}</span>
                        <strong className="line-clamp-2 text-base leading-snug text-brand-ink">{title}</strong>
                        <span className={`flex min-w-0 items-center gap-1.5 text-sm font-black ${
                          status.kind === "done"
                            ? "text-emerald-800"
                            : status.kind === "needs-retake"
                              ? "text-red-800"
                              : "text-brand-navy"
                        }`}>
                          <SceneStatusIcon kind={status.kind} />
                          <span className="min-w-0">{statusText}</span>
                        </span>
                      </span>
                    </ActionButton>
                  );
                })}
              </nav>
            </aside>
          ) : null}
        </div>

        {error ? (
          <p className="m-0 rounded-2xl bg-rose-50 p-3 text-base font-bold text-red-900" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
