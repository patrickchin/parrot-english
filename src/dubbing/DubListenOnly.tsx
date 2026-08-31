import { LoaderCircle, Play, Square } from "lucide-react";
import type { RefObject } from "react";
import { ActionButton } from "../shared/ui";
import { IllustratedDubScene } from "./IllustratedDubScene";
import type { DubDefinition, DubLine } from "./rhyme-catalog";

export type DubListenOnlyProps = {
  definition: DubDefinition;
  error: string;
  onTogglePlayback(): void;
  playback: "idle" | "loading" | "playing";
  playbackButtonRef?: RefObject<HTMLButtonElement | null>;
  visualLine: DubLine;
};

export function DubListenOnly({
  definition,
  error,
  onTogglePlayback,
  playback,
  playbackButtonRef,
  visualLine,
}: DubListenOnlyProps) {
  const playbackLabel = playback === "playing"
    ? "Stop full video"
    : playback === "loading"
      ? "Loading full video…"
      : "Play full video";

  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto overscroll-contain bg-story-shelf px-3 pb-5 pt-20 short-wide:px-2 short-wide:pb-2 short-wide:pt-16 md:px-6 md:pt-24">
      <section aria-label="Listen-only video" className="mx-auto grid w-full max-w-5xl gap-3">
        <h1 className="m-0 text-2xl leading-tight text-brand-ink md:text-4xl">
          {definition.title}
        </h1>
        <p className="m-0 rounded-2xl bg-white/90 p-3 font-bold leading-snug text-brand-ink shadow-sm">
          You can watch the video now. Ask a grown-up to turn on voice recording if you want to sing and save your own version.
        </p>
        <section aria-label="Full video player" className="grid aspect-video overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card">
          <IllustratedDubScene compact definition={definition} line={visualLine} playing={playback === "playing"} />
        </section>
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
        {error ? <p className="m-0 rounded-2xl bg-rose-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
