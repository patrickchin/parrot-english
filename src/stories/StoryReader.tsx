import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getStaticAudioLineForSpeech } from "../../lib/static-audio";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import {
  isAbortError,
  playAudioLine,
  type PlaybackControl,
} from "../media/audio-playback";
import { playDeviceSpeech } from "../media/device-speech";
import { ActionButton, ActionLink, cx } from "../shared/ui";
import {
  getPersonalizedStoryArtOverride,
  type PersonalizedStoryArtMetadata,
} from "./personalized-story-art-client";
import { StoryArtwork } from "./StoryArtwork";
import type { Story } from "./story-catalog";

type NarrationState =
  | "complete"
  | "idle"
  | "join-in"
  | "paused"
  | "playing";

export function StoryReader({
  backToStories,
  onNavigatePage,
  pageIndex,
  personalizationPanel,
  personalizedOverrides,
  story,
}: {
  backToStories: string;
  onNavigatePage: (pageIndex: number) => void;
  pageIndex: number;
  personalizationPanel?: ReactNode;
  personalizedOverrides?: PersonalizedStoryArtMetadata["stories"];
  story: Story;
}) {
  const [error, setError] = useState("");
  const [isStoryComplete, setIsStoryComplete] = useState(false);
  const [narrationState, setNarrationState] =
    useState<NarrationState>("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const playbackControlRef = useRef<PlaybackControl | null>(null);
  const playbackGenerationRef = useRef(0);
  const resumeNarrationStateRef = useRef<"join-in" | "playing">("playing");
  const pageTextRef = useRef<HTMLParagraphElement | null>(null);
  const page = story.pages[pageIndex];
  const personalizedOverride = getPersonalizedStoryArtOverride(
    { stories: personalizedOverrides ?? {} },
    story.id,
    page.id,
  );
  const isFirstPage = pageIndex === 0;
  const isLastPage = pageIndex === story.pages.length - 1;

  const stopNarration = useCallback(() => {
    playbackGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    playbackControlRef.current = null;
  }, []);

  useEffect(() => {
    stopNarration();
    setNarrationState("idle");
    setError("");
    setIsStoryComplete(false);

    return stopNarration;
  }, [pageIndex, stopNarration, story.id]);

  useEffect(() => {
    pageTextRef.current?.focus({ preventScroll: true });
  }, [pageIndex, story.id]);

  function startNarration() {
    stopNarration();
    const controller = new AbortController();
    const generation = playbackGenerationRef.current;

    abortControllerRef.current = controller;
    setError("");
    setNarrationState("playing");
    resumeNarrationStateRef.current = "playing";

    const onPlaybackControl = (control: PlaybackControl | null) => {
      if (generation === playbackGenerationRef.current) {
        playbackControlRef.current = control;
      }
    };

    let narrationPromise: Promise<void>;
    try {
      if (page.narrationAudioId) {
        const narration = getStaticAudioLineForSpeech(
          "narrator",
          `${page.text} ${page.joinIn}`,
        );
        if (narration.id !== page.narrationAudioId) {
          throw new Error(
            `Expected ${page.narrationAudioId}, received ${narration.id}`,
          );
        }
        narrationPromise = playAudioLine({
          audioId: narration.id,
          audioSrc: narration.src,
          lang: narration.lang,
          onPlaybackControl,
          signal: controller.signal,
          text: narration.text,
        });
      } else {
        narrationPromise = (async () => {
          await playDeviceSpeech({
            onPlaybackControl,
            signal: controller.signal,
            speaker: "narrator",
            text: page.text,
          });
          if (generation !== playbackGenerationRef.current) return;
          resumeNarrationStateRef.current = "join-in";
          setNarrationState("join-in");
          await playDeviceSpeech({
            onPlaybackControl,
            signal: controller.signal,
            speaker: "narrator",
            text: page.joinIn,
          });
        })();
      }
    } catch {
      abortControllerRef.current = null;
      setNarrationState("idle");
      setError(
        "I can’t read aloud on this device. You can still read together.",
      );
      return;
    }

    void narrationPromise
      .then(() => {
        if (generation !== playbackGenerationRef.current) return;
        abortControllerRef.current = null;
        playbackControlRef.current = null;
        setNarrationState("complete");
      })
      .catch((caughtError: unknown) => {
        if (
          generation !== playbackGenerationRef.current ||
          isAbortError(caughtError)
        ) {
          return;
        }
        abortControllerRef.current = null;
        playbackControlRef.current = null;
        setNarrationState("idle");
        setError(
          "I can’t read aloud on this device. You can still read together.",
        );
      });
  }

  function toggleNarration() {
    if (narrationState === "playing" || narrationState === "join-in") {
      resumeNarrationStateRef.current = narrationState;
      playbackControlRef.current?.pause();
      setNarrationState("paused");
      return;
    }
    if (narrationState === "paused") {
      playbackControlRef.current?.resume();
      setNarrationState(resumeNarrationStateRef.current);
      return;
    }
    startNarration();
  }

  function navigatePage(nextPageIndex: number) {
    stopNarration();
    setNarrationState("idle");
    setError("");
    onNavigatePage(nextPageIndex);
  }

  function finishStory() {
    stopNarration();
    setNarrationState("idle");
    setIsStoryComplete(true);
  }

  if (isStoryComplete) {
    return (
      <main className="relative grid h-dvh w-screen place-items-center overflow-x-hidden overflow-y-auto bg-story-reader px-3 pb-6 pt-24 short:pt-20 sm:px-6 md:pt-28">
        <RouteHeader>
          <HeaderLink
            aria-label="Back to stories"
            icon={<ArrowLeft />}
            to={backToStories}
          >
            Back to stories
          </HeaderLink>
        </RouteHeader>
        <section
          aria-label="Story finished"
          className="my-auto grid w-full max-w-3xl overflow-hidden rounded-[2rem] border-4 border-white bg-white/95 text-center shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]"
        >
          <StoryArtwork
            artwork={story.cover}
            className="max-h-72 sm:max-h-none"
            priority
          />
          <div className="grid content-center justify-items-center gap-4 p-6 sm:p-8">
            <BookOpenCheck
              aria-hidden="true"
              className="size-14 rounded-full bg-brand-green p-3 text-white shadow-control-green"
            />
            <div>
              <p className="m-0 text-sm font-black uppercase tracking-wider text-brand-green">
                The end!
              </p>
              <h1 className="mb-0 mt-1 text-3xl leading-none text-brand-ink sm:text-4xl">
                Great job!
              </h1>
              <p className="mb-0 mt-3 font-bold leading-relaxed text-slate-700">
                {story.completionText}
              </p>
            </div>
            <div className="grid w-full gap-3">
              <ActionButton
                className="w-full gap-2 rounded-full border-4 border-white"
                onClick={() => navigatePage(0)}
                type="button"
                variant="success"
              >
                <RotateCcw aria-hidden="true" className="size-5" /> Listen again
              </ActionButton>
              <ActionLink
                className="w-full rounded-full border-4 border-white"
                to={backToStories}
                variant="surface"
              >
                Pick another story
              </ActionLink>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const narrationLabel =
    narrationState === "playing" || narrationState === "join-in"
      ? "Pause story"
      : narrationState === "paused"
        ? "Resume story"
        : narrationState === "complete"
          ? "Listen again"
          : "Listen";

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-story-reader px-2.5 pb-4 pt-20 short:pt-16 sm:px-4 md:px-7 md:pb-7 md:pt-24">
      <RouteHeader>
        <HeaderLink
          aria-label="Back to stories"
          icon={<ArrowLeft />}
          to={backToStories}
        >
          Back to stories
        </HeaderLink>
      </RouteHeader>

      <section
        aria-label="Story reader"
        className="mx-auto grid h-[calc(100dvh-6rem)] min-h-0 w-full max-w-7xl content-start overflow-x-hidden overflow-y-auto rounded-[1.75rem] border-4 border-white bg-[#fffaf0] shadow-card short-wide:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] short-wide:grid-rows-[minmax(0,1fr)] short-wide:overflow-hidden md:rounded-[2.25rem] lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]"
      >
        <figure className="relative m-0 aspect-[3/2] w-full overflow-hidden border-b-4 border-white bg-brand-navy short:h-40 short:aspect-auto short-wide:h-full short-wide:border-b-0 short-wide:border-r-4 lg:h-full lg:aspect-auto lg:border-b-0 lg:border-r-4">
          <StoryArtwork
            artwork={page.artwork}
            className="aspect-[3/2] max-h-[52dvh] min-h-40 short:h-40 short:aspect-auto short-wide:h-full short-wide:max-h-none lg:h-full lg:max-h-none"
            key={page.id}
            personalizedOverride={personalizedOverride}
            priority
          />
          <figcaption className="absolute bottom-2 left-2 rounded-full border-2 border-white bg-brand-navy/90 px-3 py-1 text-xs font-black text-white sm:bottom-3 sm:left-3">
            Page {pageIndex + 1} of {story.pages.length}
          </figcaption>
        </figure>

        <div className="grid content-start gap-3 p-4 pb-24 short:p-3 short:pb-24 short-wide:min-h-0 short-wide:grid-rows-[minmax(0,1fr)_auto] short-wide:gap-2 short-wide:overflow-hidden short-wide:pb-3 sm:gap-4 sm:p-6 sm:pb-24 lg:min-h-[calc(100dvh-6.5rem)] lg:content-between lg:p-8">
          <div className="grid gap-3 short-wide:-mx-2 short-wide:min-h-0 short-wide:min-w-0 short-wide:gap-2 short-wide:overflow-x-hidden short-wide:overflow-y-auto short-wide:px-2 sm:gap-4">
            <header className="grid gap-2.5 short-wide:gap-1">
              <h1 className="m-0 text-xl leading-none text-brand-ink sm:text-3xl lg:text-4xl">
                {story.title}
              </h1>
              <div
                aria-label="Story progress"
                aria-valuemax={story.pages.length}
                aria-valuemin={1}
                aria-valuenow={pageIndex + 1}
                aria-valuetext={`Page ${pageIndex + 1} of ${story.pages.length}`}
                className="h-2 overflow-hidden rounded-full bg-sky-100"
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-brand-pink transition-[width] duration-300"
                  style={{
                    width: `${((pageIndex + 1) / story.pages.length) * 100}%`,
                  }}
                />
              </div>
            </header>

            <p
              aria-label={`Page ${pageIndex + 1} of ${story.pages.length}. ${page.text}`}
              className="relative m-0 text-[1.35rem] font-black leading-snug text-slate-800 outline-none before:absolute before:inset-y-0 before:-left-2 before:w-1 before:content-[''] focus:before:bg-brand-blue forced-colors:before:hidden forced-colors:focus:outline-2 forced-colors:focus:outline-solid forced-colors:focus:outline-offset-2 sm:text-2xl lg:text-3xl lg:leading-snug"
              ref={pageTextRef}
              tabIndex={-1}
            >
              {page.text}
            </p>

            <aside
              aria-label={`Say it: ${page.joinIn}`}
              className="flex items-start gap-3 rounded-2xl border-3 border-amber-300 bg-amber-100 p-3 text-amber-950 short-wide:gap-2 short-wide:p-2 sm:p-4"
            >
              <Sparkles
                aria-hidden="true"
                className="mt-0.5 size-6 shrink-0 text-amber-700"
              />
              <div className="grid gap-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-amber-800">
                  {narrationState === "complete"
                    ? "Your turn"
                    : narrationState === "join-in"
                      ? "Listen and say it"
                      : narrationState === "playing"
                        ? "Listen"
                        : narrationState === "paused"
                          ? "Story paused"
                          : "Tap Listen"}
                </span>
                <span className="text-lg font-black leading-snug sm:text-xl">
                  {page.joinIn}
                </span>
              </div>
            </aside>

            {personalizationPanel ? (
              <details className="group min-w-0">
                <summary
                  aria-label="Grown-up options"
                  className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-sky-100 px-3 text-sm font-black text-brand-blue [&::-webkit-details-marker]:hidden"
                >
                  Grown-up options
                  <span aria-hidden="true" className="group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="mt-3">{personalizationPanel}</div>
              </details>
            ) : null}

            {error ? (
              <p
                className="m-0 rounded-xl bg-red-800 px-3 py-2 text-sm font-extrabold leading-snug text-white"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {narrationState === "playing"
                ? `Reading page ${pageIndex + 1} of ${story.pages.length}.`
                : narrationState === "join-in"
                  ? `Listen, then say: ${page.joinIn}`
                : narrationState === "paused"
                  ? "Story paused."
                  : narrationState === "complete"
                    ? `Your turn. Say: ${page.joinIn}`
                    : ""}
            </p>
          </div>

          <nav
            aria-label="Story controls"
            className="fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom))] left-2 right-2 z-30 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,0.8fr)] gap-2 rounded-2xl border-3 border-white bg-[#fffaf0]/95 p-2 shadow-card short-wide:static short-wide:rounded-none short-wide:border-x-0 short-wide:border-b-0 short-wide:border-t-3 short-wide:border-sky-100 short-wide:bg-[#fffaf0] short-wide:p-0 short-wide:pt-3 short-wide:shadow-none sm:gap-3 lg:static lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-t-3 lg:border-sky-100 lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          >
            <ActionButton
              aria-label="Previous page"
              className="min-h-12 min-w-0 gap-1 rounded-xl px-1 text-xs shadow-control-surface min-[360px]:text-sm"
              disabled={isFirstPage}
              frame="none"
              onClick={() => navigatePage(pageIndex - 1)}
              shape="rounded"
              size="inline"
              type="button"
              variant="surface"
            >
              <ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
              <span>Back</span>
            </ActionButton>

            <ActionButton
              aria-label={narrationLabel}
              className={cx(
                "min-h-12 min-w-0 gap-1.5 rounded-xl px-1 text-xs min-[360px]:px-2 min-[360px]:text-sm",
                narrationState === "paused" && "bg-brand-navy shadow-control-navy",
              )}
              frame="none"
              onClick={toggleNarration}
              shape="rounded"
              size="inline"
              type="button"
              variant={narrationState === "paused" ? "navy" : "brand"}
            >
              {narrationState === "playing" || narrationState === "join-in" ? (
                <Pause aria-hidden="true" className="size-5 shrink-0 fill-current" />
              ) : narrationState === "complete" ? (
                <RotateCcw aria-hidden="true" className="size-5 shrink-0" />
              ) : narrationState === "paused" ? (
                <Play aria-hidden="true" className="size-5 shrink-0 fill-current" />
              ) : (
                <Volume2 aria-hidden="true" className="size-5 shrink-0" />
              )}
              <span className="leading-tight">{narrationLabel}</span>
            </ActionButton>

            <ActionButton
              aria-label={isLastPage ? "Finish story" : "Next page"}
              className="min-h-12 min-w-0 gap-1 rounded-xl px-1 text-xs min-[360px]:text-sm"
              frame="none"
              onClick={() =>
                isLastPage ? finishStory() : navigatePage(pageIndex + 1)
              }
              shape="rounded"
              size="inline"
              type="button"
              variant={narrationState === "complete" ? "success" : "surface"}
            >
              <span>{isLastPage ? "Done" : "Next"}</span>
              {isLastPage ? (
                <BookOpenCheck aria-hidden="true" className="size-5 shrink-0" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
              )}
            </ActionButton>
          </nav>
        </div>
      </section>
    </main>
  );
}
