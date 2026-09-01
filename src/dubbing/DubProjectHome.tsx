import { Mic, Play, Square } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { ActionButton } from "../shared/ui";
import type { DubState } from "./dub-state";
import {
  DubMelodyLane,
  DubTimedWords,
  type DubGuidancePosition,
} from "./DubKaraokeGuide";
import { IllustratedDubScene } from "./IllustratedDubScene";
import {
  FIVE_LITTLE_DUCKS_DUB,
  type DubDefinition,
  type DubLine,
} from "./rhyme-catalog";

export type DubProjectHomeProps = {
  activeLine: DubLine;
  definition?: DubDefinition;
  editor?: ReactNode;
  error?: string;
  guidance?: DubGuidancePosition | null;
  lineButtonRef?: RefObject<HTMLButtonElement | null>;
  locked: boolean;
  needsRetake: DubState["needsRetake"];
  onEditLine(lineId: string): void;
  onPlayLine(lineId: string): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  playbackLocked?: boolean;
  playingLineId?: string | null;
  saved: Readonly<Record<string, string>>;
  visualLine?: DubLine;
};

function lineStatus(
  lineId: string,
  saved: Readonly<Record<string, string>>,
  needsRetake: DubState["needsRetake"],
) {
  if (Object.hasOwn(needsRetake, lineId)) return "Record again";
  if (Object.hasOwn(saved, lineId)) return "Recorded";
  return "Not recorded";
}

export function DubProjectHome({
  activeLine,
  definition = FIVE_LITTLE_DUCKS_DUB,
  editor,
  error = "",
  guidance = null,
  lineButtonRef,
  locked,
  needsRetake,
  onEditLine,
  onPlayLine,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  playbackLocked = locked,
  playingLineId = null,
  saved,
  visualLine = activeLine,
}: DubProjectHomeProps) {
  const ready = definition.lines.filter(
    ({ id }) => Object.hasOwn(saved, id) && !Object.hasOwn(needsRetake, id),
  ).length;
  const retakeCount = Object.keys(needsRetake).length;
  const progressText = ready === 0 && retakeCount === 0
    ? "Ready to start"
    : ready === definition.lines.length
      ? `All ${definition.lines.length} lines ready`
      : `${ready} of ${definition.lines.length} lines ready`;
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";
  const guidanceLine = playback === "playing" && guidance?.lineId
    ? definition.lines.find(({ id }) => id === guidance.lineId)
    : undefined;

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24 short-wide:md:px-2 short-wide:md:pt-16 lg:overflow-y-hidden">
      <section aria-label="Dub project workspace" className="mx-auto grid min-w-0 w-full max-w-[1600px] gap-3 short-wide:h-full short-wide:max-w-none short-wide:gap-2 lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
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

        <div className="grid min-w-0 items-start gap-4 short-wide:min-h-0 short-wide:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] short-wide:gap-2 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1.7fr)_minmax(24rem,0.8fr)] short-wide:lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="grid min-w-0 content-start gap-3 short-wide:min-h-0 short-wide:gap-1 lg:h-full lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:content-stretch">
            <section
              aria-label="Full video player"
              className="grid aspect-video min-h-0 w-full overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card short-wide:max-h-full short-wide:rounded-2xl lg:h-full lg:w-auto lg:max-w-full lg:justify-self-start"
            >
              <IllustratedDubScene
                compact
                definition={definition}
                line={visualLine}
                playing={playback === "playing" || playingLineId !== null}
              />
            </section>
            {guidanceLine ? (
              <section aria-label="Karaoke guide" className="grid gap-1 rounded-2xl bg-white/90 px-3 py-2 text-center text-base font-black leading-snug text-brand-ink shadow-sm short-wide:px-2 short-wide:py-1 short-wide:text-sm">
                <p className="m-0"><DubTimedWords elapsedMs={guidance?.elapsedMs ?? null} line={guidanceLine} /></p>
                <DubMelodyLane definition={definition} elapsedMs={guidance?.elapsedMs ?? null} line={guidanceLine} />
              </section>
            ) : null}
            <ActionButton
              aria-label={playbackLabel}
              className="h-12 min-h-12 min-w-28 justify-self-start gap-2 border-2 bg-brand-navy/95 px-4 text-base short-wide:px-3 short-wide:text-sm"
              disabled={playback === "loading" || playbackLocked}
              onClick={onTogglePlayback}
              ref={playbackButtonRef}
              size="none"
              variant="navy"
            >
              {playback === "playing" ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play"}
            </ActionButton>
          </div>

          {editor ?? (
            <aside aria-label="Lyrics and recordings" className="grid min-w-0 content-start gap-2 self-start rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card short-wide:max-h-full short-wide:min-h-0 short-wide:overflow-y-auto short-wide:rounded-2xl short-wide:p-2 md:max-h-[calc(100dvh-10rem)] md:overflow-y-auto md:p-4 short-wide:md:max-h-full short-wide:md:p-2 lg:h-full lg:max-h-none lg:self-stretch">
              <h2 className="m-0 text-lg font-black text-brand-ink short-wide:text-base">Lyrics</h2>
              <ol className="m-0 grid list-none gap-2 p-0">
                {definition.lines.map((line, index) => {
                  const status = lineStatus(line.id, saved, needsRetake);
                  const selected = line.id === activeLine.id;
                  const playable = status === "Recorded";
                  const playing = playingLineId === line.id;
                  return (
                    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_3.25rem] gap-1 rounded-2xl bg-white/80 p-1 shadow-sm" key={line.id}>
                      <ActionButton
                        aria-current={selected ? "step" : undefined}
                        aria-label={`Edit line ${index + 1}: ${line.text} ${status}`}
                        className="!grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl p-2 text-left"
                        disabled={locked}
                        onClick={() => onEditLine(line.id)}
                        ref={selected ? lineButtonRef : undefined}
                        shape="rounded"
                        size="none"
                        variant={selected ? "navy" : "surface"}
                      >
                        <span className="text-xs font-black opacity-75">{index + 1}</span>
                        <strong className="min-w-0 text-sm leading-tight md:text-base short-wide:md:text-sm">{line.text}</strong>
                      </ActionButton>
                      <ActionButton
                        aria-label={`${playing ? "Stop" : "Play"} line ${index + 1} recording`}
                        className="h-full min-h-12 min-w-12 rounded-xl p-0"
                        disabled={locked || !playable}
                        onClick={() => onPlayLine(line.id)}
                        shape="rounded"
                        size="none"
                        variant={playing ? "navy" : "surface"}
                      >
                        {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
                      </ActionButton>
                    </li>
                  );
                })}
              </ol>
              {ready === definition.lines.length ? (
                <p className="m-0 text-center font-black text-brand-ink">Your video is ready — great singing!</p>
              ) : (
                <p className="m-0 flex items-center justify-center gap-2 text-center text-sm font-black text-brand-navy">
                  <Mic aria-hidden="true" /> Choose a line to record.
                </p>
              )}
            </aside>
          )}
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
