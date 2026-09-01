import { LoaderCircle, Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { IllustratedDubScene } from "./IllustratedDubScene";
import {
  DubMelodyLane,
  DubTimedWords,
  type DubGuidancePosition,
} from "./DubKaraokeGuide";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubListenOnlyProps = {
  definition: DubDefinition;
  error: string;
  onRetryLoad(): void;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  visualLine: DubLine;
  guidance?: DubGuidancePosition | null;
};

export function DubListenOnly({
  definition,
  error,
  onRetryLoad,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  visualLine,
  guidance = null,
}: DubListenOnlyProps) {
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
      <section aria-label="Listen-only video" className="mx-auto grid w-full max-w-5xl gap-3 short-wide:max-w-[38rem] short-wide:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] short-wide:gap-2">
        <h1 className="m-0 text-2xl leading-tight text-brand-ink short-wide:col-span-2 short-wide:text-xl md:text-4xl short-wide:md:text-xl">
          {definition.title}
        </h1>
        <section aria-label="Full video player" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card">
          <IllustratedDubScene compact definition={definition} line={visualLine} playing={playback === "playing"} />
        </section>
        {guidanceLine ? (
          <section aria-label="Karaoke guide" className="grid gap-1 rounded-2xl bg-white/90 px-3 py-2 text-center text-base font-black leading-snug text-brand-ink shadow-sm short-wide:px-2 short-wide:py-1 short-wide:text-sm">
            <p className="m-0"><DubTimedWords elapsedMs={guidance?.elapsedMs ?? null} line={guidanceLine} /></p>
            <DubMelodyLane definition={definition} elapsedMs={guidance?.elapsedMs ?? null} line={guidanceLine} />
          </section>
        ) : null}
        <div className="grid min-w-0 content-start gap-3 short-wide:gap-2">
          <p className="m-0 rounded-2xl bg-white/90 p-3 font-bold leading-snug text-brand-ink shadow-sm">
            You can watch the video now. Your saved voice clips are being
            cleared, so try recording again in a moment.
          </p>
          <ActionButton
            aria-label={playbackLabel}
            className="min-h-12 min-w-36 justify-self-start gap-2"
            disabled={playback === "loading"}
            onClick={onTogglePlayback}
            ref={playbackButtonRef}
            size="compact"
            variant="navy"
          >
            {playback === "loading"
              ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              : playback === "playing"
                ? <Square aria-hidden="true" />
                : <Play aria-hidden="true" />}
            {playback === "playing" ? "Stop" : playback === "loading" ? "Loading…" : "Play"}
          </ActionButton>
          <ActionButton
            className="min-h-12 min-w-36 justify-self-start"
            onClick={onRetryLoad}
            size="compact"
            variant="surface"
          >
            Try recording again
          </ActionButton>
          {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
