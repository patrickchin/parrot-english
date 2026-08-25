import { Play, Square } from "lucide-react";
import { ActionButton, TextButton } from "../shared/ui";
import { DuckScene } from "./DuckScene";
import {
  DUB_LINES,
  DUB_LINES_PER_VERSE,
  DUB_VERSES,
  type DubLine,
} from "./dub-script";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  error?: string;
  needsRetake: ReadonlySet<string>;
  onContinue(): void;
  onDelete(): void;
  onOpenScene(sceneIndex: number): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  saved: Readonly<Record<string, string>>;
};

function sceneState({
  needsRetake,
  saved,
  sceneIndex,
}: Pick<DubProjectHomeProps, "needsRetake" | "saved"> & { sceneIndex: number }) {
  const lines = DUB_VERSES[sceneIndex];
  if (lines.some(({ id }) => needsRetake.has(id))) return "needs retake";
  if (lines.every(({ id }) => Object.hasOwn(saved, id))) return "recorded";
  if (lines.some(({ id }) => Object.hasOwn(saved, id))) return "in progress";
  return "draft";
}

export function DubProjectHome({
  activeLine,
  error = "",
  needsRetake,
  onContinue,
  onDelete,
  onOpenScene,
  onTogglePlayback,
  playback,
  saved,
}: DubProjectHomeProps) {
  const recorded = DUB_LINES.filter(({ id }) => Object.hasOwn(saved, id)).length;
  const allRecorded = recorded === DUB_LINES.length;
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
    <main className="min-h-dvh overflow-x-hidden bg-story-shelf px-3 pb-6 pt-20 md:px-6 md:pt-24">
      <section className="mx-auto grid w-full max-w-[1600px] gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-black uppercase tracking-[0.16em] text-brand-blue">
              {allRecorded ? "Your dub" : "Draft"}
            </p>
            <h1 className="m-0 text-3xl text-brand-ink md:text-5xl">Five Little Ducks</h1>
          </div>
          <p className="m-0 rounded-full bg-white/85 px-4 py-2 text-sm font-black text-brand-navy">
            {allRecorded ? "All scenes recorded" : `${recorded} of ${DUB_LINES.length} voice clips recorded`}
          </p>
        </header>

        <section
          aria-label="Full video player"
          className="grid aspect-video min-h-0 overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"
        >
          <DuckScene compact line={activeLine} playing={playback === "playing"} />
        </section>

        <div className="flex flex-wrap justify-between gap-3">
          <ActionButton
            aria-label={playback === "playing" ? "Stop full video" : "Play full video"}
            disabled={playback === "loading"}
            onClick={onTogglePlayback}
            size="large"
            variant="navy"
          >
            {playback === "playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playbackLabel}
          </ActionButton>
          {!allRecorded ? (
            <ActionButton onClick={onContinue} size="large">
              Continue Scene {continueSceneIndex + 1}
            </ActionButton>
          ) : null}
        </div>

        <nav aria-label="Scenes" className="grid grid-flow-col auto-cols-[minmax(8.5rem,1fr)] gap-2 overflow-x-auto pb-2 md:grid-flow-row md:grid-cols-6 md:overflow-visible">
          {DUB_VERSES.map((_, sceneIndex) => {
            const state = sceneState({ needsRetake, saved, sceneIndex });
            const selected = sceneIndex === activeSceneIndex;
            return (
              <ActionButton
                aria-current={selected ? "page" : undefined}
                aria-label={`Scene ${sceneIndex + 1}, ${state}`}
                className="min-h-20 flex-col rounded-2xl px-3 py-3 text-sm"
                key={sceneIndex}
                onClick={() => onOpenScene(sceneIndex)}
                shape="rounded"
                variant={selected ? "navy" : "surface"}
              >
                <span>Scene {sceneIndex + 1}</span>
                <span className="text-xs normal-case">{state}</span>
              </ActionButton>
            );
          })}
        </nav>

        {error ? (
          <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <details className="group justify-self-start rounded-2xl border-3 border-sky-200 bg-sky-50 p-3">
          <summary
            aria-label="Grown-up options"
            className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-ui font-black text-brand-blue focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden"
          >
            Grown-up options
            <span aria-hidden="true" className="group-open:rotate-180">▾</span>
          </summary>
          <TextButton className="mt-2 min-h-12 text-red-800" onClick={onDelete}>
            Delete my dub
          </TextButton>
        </details>
      </section>
    </main>
  );
}
