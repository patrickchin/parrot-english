import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Ear,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ActionButton,
  controlClassName,
  cx,
  IconButton,
  Card,
} from "../shared/ui";
import type { PersonalizedStoryArtwork } from "../stories/personalized-story-art-client";
import type { FullSceneImage } from "./full-scene-lessons";

type LessonBackgroundAsset = {
  alt: string;
  src: string;
};

type LessonCharacterPresentation = {
  asset: LessonBackgroundAsset;
  emote: string;
  id: string;
  isActive: boolean;
  name: string;
};

type LessonSpeechPresentation = {
  kind: string;
  speaker: string;
  text: string;
};

type LessonFeedbackOutcome =
  | "correct"
  | "incorrect"
  | "incorrectFinal"
  | "noInput"
  | "noInputFinal"
  | null;

export function LessonStage({
  background,
  children,
  presentation = "layered",
}: {
  background: LessonBackgroundAsset;
  children: ReactNode;
  presentation?: "boxed" | "layered";
}) {
  return (
    <main className="h-dvh min-h-svh w-screen overflow-hidden text-slate-900">
      <section
        aria-label="Parrot English speaking lesson"
        className={cx(
          "relative isolate h-full w-full overflow-hidden bg-sky-300",
          presentation === "boxed" && "bg-conversation",
        )}
        data-presentation={presentation}
      >
        {presentation === "layered" ? (
          <>
            <img
              alt={background.alt}
              className="absolute inset-0 z-0 size-full select-none object-cover"
              draggable="false"
              src={background.src}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 z-0 bg-linear-to-b from-sky-950/10 via-transparent to-sky-950/20"
            />
          </>
        ) : null}
        {children}
      </section>
    </main>
  );
}

export function BoxedFullSceneStage({ image }: { image: FullSceneImage }) {
  return (
    <section
      aria-label="Lesson artwork"
      className="lesson-full-scene-art absolute left-1/2 top-1/2 z-10 aspect-video max-h-[52dvh] w-[min(calc(100%_-_2rem),92dvh,56rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border-4 border-white bg-white/90 shadow-card"
      role="region"
    >
      <img
        alt={image.alt}
        className="block size-full select-none object-contain"
        draggable="false"
        src={image.src}
      />
    </section>
  );
}

export function LessonHud({
  currentScene,
  sceneCount,
  title,
}: {
  currentScene: number;
  sceneCount: number;
  title: string;
}) {
  const progress = `${(currentScene / sceneCount) * 100}%`;

  return (
    <header
      aria-label="Lesson progress"
      className="lesson-hud absolute left-1/2 top-20 z-30 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 short:top-16 md:top-5 md:max-w-xl"
      role="region"
    >
      <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-full border-3 border-white bg-white/95 px-3 py-1.5 text-brand-ink shadow-md md:min-h-14 md:gap-3 md:px-4">
        <span className="shrink-0 text-xs font-black uppercase tracking-wide text-brand-rose md:text-sm">
          Scene {currentScene} of {sceneCount}
        </span>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-sky-200" />
        <h1 className="m-0 min-w-0 flex-1 truncate text-base font-black leading-tight md:text-xl">
          {title}
        </h1>
      </div>
      <div
        aria-label="Scene progress"
        aria-valuemax={sceneCount}
        aria-valuemin={1}
        aria-valuenow={currentScene}
        className="mx-5 mt-1.5 h-2 overflow-hidden rounded-full border border-white/90 bg-white/65 shadow-sm md:mx-7 md:h-2.5"
        role="progressbar"
      >
        <span
          aria-hidden="true"
          className="block h-full rounded-full bg-brand-pink transition-[width]"
          style={{ width: progress }}
        />
      </div>
    </header>
  );
}

export const LessonIntroduction = forwardRef<
  HTMLButtonElement,
  {
    lessonTitle: string;
    onStart: () => void;
    sceneCount: number;
  }
>(function LessonIntroduction(
  { lessonTitle, onStart, sceneCount },
  ref,
) {
  return (
    <section
      aria-label="Lesson introduction"
      className="absolute inset-0 z-10 grid place-items-center bg-brand-navy/30 px-4 pb-5 pt-20 backdrop-blur-[2px]"
      role="region"
    >
      <Card className="w-full max-w-xl px-5 py-6 text-center short:py-5 md:px-10 md:py-9">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sm font-black text-brand-blue">
          <Sparkles aria-hidden="true" className="size-4" />
          {sceneCount} parts
        </span>
        <h1 className="m-0 text-3xl font-black leading-tight text-brand-ink short:text-2xl md:text-5xl">
          {lessonTitle}
        </h1>
        <div
          aria-label="How to play"
          className="mx-auto my-5 grid max-w-md grid-cols-2 gap-2 text-brand-ink md:my-7 md:gap-3"
          role="list"
        >
          <span
            className="grid min-h-20 place-items-center gap-1 rounded-2xl bg-sky-100 p-3 text-lg font-black md:min-h-24 md:text-xl"
            role="listitem"
          >
            <Ear aria-hidden="true" className="size-7 text-brand-blue md:size-9" />
            1. Listen
          </span>
          <span
            className="grid min-h-20 place-items-center gap-1 rounded-2xl bg-emerald-100 p-3 text-lg font-black md:min-h-24 md:text-xl"
            role="listitem"
          >
            <Mic aria-hidden="true" className="size-7 text-brand-green md:size-9" />
            2. Talk
          </span>
        </div>
        <ActionButton
          aria-label="Start lesson"
          className="max-w-sm"
          fullWidth
          onClick={onStart}
          ref={ref}
          size="hero"
          type="button"
        >
          Let’s go!
        </ActionButton>
      </Card>
    </section>
  );
});

export const LessonCompletion = forwardRef<
  HTMLButtonElement,
  {
    lessonTitle: string;
    onBack: () => void;
    onReplay: () => void;
  }
>(function LessonCompletion(
  { lessonTitle, onBack, onReplay },
  ref,
) {
  return (
    <section
      aria-label="Lesson completion"
      className="absolute inset-0 z-10 grid place-items-center bg-brand-navy/35 px-4 pb-5 pt-20 backdrop-blur-[2px]"
      role="region"
    >
      <Card className="w-full max-w-xl px-5 py-6 text-center short:py-5 md:px-10 md:py-9">
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-amber-100 text-brand-rose md:size-20">
          <Sparkles aria-hidden="true" className="size-8 md:size-11" />
        </span>
        <h1 className="m-0 text-3xl font-black leading-tight text-brand-ink short:text-2xl md:text-5xl">
          Lesson complete!
        </h1>
        <p className="mb-5 mt-3 text-lg font-bold leading-snug text-slate-600 md:mb-7 md:text-2xl">
          You finished {lessonTitle}!
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionButton
            aria-label="Replay lesson"
            onClick={onReplay}
            ref={ref}
            size="large"
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-6" />
            Replay lesson
          </ActionButton>
          <ActionButton
            onClick={onBack}
            size="large"
            type="button"
            variant="navy"
          >
            Back to lessons
          </ActionButton>
        </div>
      </Card>
    </section>
  );
});

export function LessonCharacters({
  characters,
}: {
  characters: LessonCharacterPresentation[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {characters.map((character, index) => (
        <div
          className={cx(
            "lesson-character-slot absolute bottom-24 z-10 flex h-[20dvh] w-1/3 min-w-24 max-w-44 -translate-x-1/2 items-end justify-center drop-shadow-xl transition short:bottom-22 min-[340px]:h-[28dvh] min-[340px]:w-2/5 md:bottom-30 md:h-[44dvh] md:w-1/4 md:max-w-80",
            character.isActive &&
              "z-20 -translate-y-1 scale-105 drop-shadow-2xl",
          )}
          data-character={character.id}
          data-emote={character.emote}
          key={character.id}
          style={{
            "--character-count": characters.length,
            "--character-index": index,
          } as CSSProperties}
        >
          <img
            alt={character.asset.alt}
            className="block size-full select-none object-contain object-bottom"
            draggable="false"
            src={character.asset.src}
          />
        </div>
      ))}
    </div>
  );
}

export function LessonSpeech({
  characterCount,
  characterIndex,
  showTail = true,
  speech,
}: {
  characterCount: number;
  characterIndex: number;
  showTail?: boolean;
  speech: LessonSpeechPresentation;
}) {
  if (speech.kind === "user" || speech.kind === "feedback") return null;

  const isNarration = speech.kind === "narration";
  const speakerName =
    speech.speaker[0]?.toUpperCase() + speech.speaker.slice(1);
  const tailPosition = `${
    ((Math.max(0, characterIndex) + 1) * 100) / (characterCount + 1)
  }%`;

  return (
    <div
      aria-label={isNarration ? "Lesson narration" : `${speakerName} is speaking`}
      aria-live="polite"
      className={cx(
        "lesson-dialogue-overlay absolute left-1/2 top-36 z-30 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-3xl border-4 border-white px-4 py-3 text-center shadow-control-surface short:top-32 md:top-28 md:px-7 md:py-4",
        isNarration
          ? "bg-brand-navy/95 text-white shadow-control-navy"
          : cx(
              "bg-white/95 text-brand-ink",
              showTail && "lesson-speech-tail",
            ),
      )}
      role="status"
      style={
        showTail
          ? ({ "--speech-tail-position": tailPosition } as CSSProperties)
          : undefined
      }
    >
      <span
        className={cx(
          "mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest md:text-sm",
          isNarration ? "text-brand-yellow" : "text-brand-rose",
        )}
      >
        {isNarration ? (
          <>
            <Sparkles aria-hidden="true" className="size-4" />
            Story
          </>
        ) : (
          <>
            <Ear aria-hidden="true" className="size-4" />
            Listen · {speakerName}
          </>
        )}
      </span>
      <p className="m-0 max-h-32 overflow-y-auto text-[clamp(1.25rem,5.4vw,2.25rem)] font-black leading-tight md:max-h-40">
        {speech.text}
      </p>
    </div>
  );
}

export function LessonUserPrompt({
  dialogue,
  portrait,
  status = "ready",
}: {
  dialogue: string;
  portrait?: PersonalizedStoryArtwork | null;
  status?: "checking" | "opening" | "ready" | "recording";
}) {
  const promptLabel =
    status === "recording"
      ? "Listening"
      : status === "opening"
        ? "Opening mic"
      : status === "checking"
        ? "Checking"
        : "Your turn";

  return (
    <section
      aria-label="Your turn"
      className={cx(
        "lesson-dialogue-overlay lesson-user-prompt absolute left-1/2 top-36 z-30 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-3xl border-4 border-white bg-white/95 px-2.5 py-2 text-center text-brand-ink shadow-control-surface short:top-32 min-[340px]:px-4 min-[340px]:py-3 md:top-28 md:px-7 md:py-4",
        portrait && "lesson-user-prompt-with-portrait",
      )}
      role="region"
    >
      {portrait ? (
        <img
          alt="You in storybook style"
          className="lesson-user-portrait mx-auto mb-2 size-20 rounded-[1.4rem] border-3 border-white object-cover shadow-control-surface md:mb-3 md:size-24"
          src={portrait.src}
        />
      ) : null}
      <div className="lesson-user-prompt-copy min-w-0">
        <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-green md:text-sm">
          {status === "checking" || status === "opening" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Mic aria-hidden="true" className="size-4" />
          )}
          {promptLabel}
        </span>
        <p className="m-0 text-base font-black leading-[1.15] min-[340px]:text-[clamp(1.125rem,4vw,1.75rem)] min-[340px]:leading-tight md:text-[clamp(1.25rem,3.5vw,2rem)]">
          {dialogue}
        </p>
      </div>
    </section>
  );
}

export function LessonFeedback({
  outcome,
  speech,
}: {
  outcome: LessonFeedbackOutcome;
  speech: LessonSpeechPresentation;
}) {
  const isCorrect = outcome === "correct";
  const isRetry = outcome === "incorrect" || outcome === "noInput";
  const heading = isCorrect
    ? "You did it!"
    : isRetry
      ? "Try once more"
      : "Keep going!";

  return (
    <section
      aria-label="Speaking feedback"
      className={cx(
        "lesson-dialogue-overlay absolute left-1/2 top-36 z-30 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-3xl border-4 border-white px-4 py-3 text-center text-white shadow-control-navy short:top-32 md:top-28 md:px-7 md:py-4",
        isCorrect
          ? "bg-emerald-700/95"
          : isRetry
            ? "bg-amber-700/95"
            : "bg-brand-navy/95",
      )}
      role="region"
    >
      <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-white/85 md:text-sm">
        <CircleCheckBig aria-hidden="true" className="size-4" />
        {heading}
      </span>
      <p
        aria-live="polite"
        className="m-0 text-[clamp(1.25rem,5.4vw,2.25rem)] font-black leading-tight"
        role="status"
      >
        {speech.text}
      </p>
    </section>
  );
}

export function LessonPlaybackControls({
  atFinalScene,
  atFirstScene,
  isPaused,
  onNext,
  onPauseResume,
  onPrevious,
}: {
  atFinalScene: boolean;
  atFirstScene: boolean;
  isPaused: boolean;
  onNext: () => void;
  onPauseResume: () => void;
  onPrevious: () => void;
}) {
  const pauseLabel = isPaused ? "Resume lesson" : "Pause lesson";

  return (
    <nav
      aria-label="Lesson playback controls"
      className="lesson-playback-controls absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 md:bottom-6 md:gap-3"
    >
      <IconButton
        aria-label="Previous scene"
        disabled={atFirstScene}
        elevation="raised"
        frame="white"
        onClick={onPrevious}
        size="large"
        type="button"
        variant="navy"
      >
        <ChevronLeft aria-hidden="true" className="size-7 md:size-9" />
      </IconButton>
      <IconButton
        aria-label={pauseLabel}
        elevation="raised"
        frame="white"
        onClick={onPauseResume}
        size="large"
        type="button"
        variant="brand"
      >
        {isPaused ? (
          <Play aria-hidden="true" className="size-6 fill-current md:size-8" />
        ) : (
          <Pause aria-hidden="true" className="size-6 fill-current md:size-8" />
        )}
      </IconButton>
      <IconButton
        aria-label="Next scene"
        disabled={atFinalScene}
        elevation="raised"
        frame="white"
        onClick={onNext}
        size="large"
        type="button"
        variant="navy"
      >
        <ChevronRight aria-hidden="true" className="size-7 md:size-9" />
      </IconButton>
    </nav>
  );
}

export function LessonSpeakingControls({
  isEvaluating,
  isRecording,
  isStartingRecording,
  onSkip,
  onToggleRecording,
  usePracticeFallback = false,
}: {
  isEvaluating: boolean;
  isRecording: boolean;
  isStartingRecording: boolean;
  onSkip: () => void;
  onToggleRecording: () => void;
  usePracticeFallback?: boolean;
}) {
  return (
    <nav
      aria-label="Speaking controls"
      className="lesson-speaking-controls absolute bottom-3 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 justify-center gap-2 md:bottom-6 md:max-w-lg md:gap-2.5"
    >
      {isEvaluating ? (
        <span
          aria-live="assertive"
          className={controlClassName({
            fullWidth: true,
            interaction: "static",
            size: "large",
            variant: "navy",
          })}
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-6 animate-spin motion-reduce:animate-none"
          />
          Checking your words…
        </span>
      ) : (
        <>
          {usePracticeFallback ? (
            <ActionButton
              aria-label="Done with speaking"
              className="min-w-0 flex-1"
              onClick={onSkip}
              size="large"
              type="button"
              variant="success"
            >
              Done
              <ChevronRight aria-hidden="true" className="size-6 md:size-7" />
            </ActionButton>
          ) : null}
          <ActionButton
            aria-label={
              usePracticeFallback ? "Try microphone again" : "Microphone"
            }
            aria-pressed={isRecording}
            aria-busy={isStartingRecording || undefined}
            className={cx(
              usePracticeFallback ? "shrink-0" : "min-w-0 flex-1",
              isRecording && "animate-pulse motion-reduce:animate-none",
            )}
            disabled={isStartingRecording}
            onClick={onToggleRecording}
            size="large"
            type="button"
            variant={
              isRecording ? "brand" : usePracticeFallback ? "navy" : "success"
            }
          >
            {isStartingRecording ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-7 animate-spin motion-reduce:animate-none md:size-8"
              />
            ) : (
              <Mic aria-hidden="true" className="size-7 md:size-8" />
            )}
            {isStartingRecording
              ? "Opening mic…"
              : isRecording
                ? "Tap when done"
                : usePracticeFallback
                  ? "Try mic"
                  : "Tap to talk"}
          </ActionButton>
          {usePracticeFallback ? null : (
            <ActionButton
              aria-label="Skip speaking turn"
              className="shrink-0"
              disabled={isStartingRecording}
              onClick={onSkip}
              size="large"
              type="button"
              variant="navy"
            >
              Skip
            </ActionButton>
          )}
        </>
      )}
    </nav>
  );
}

export function LessonErrorBanner({
  error,
  onRetry,
  onSkip,
  tone = "error",
}: {
  error: string;
  onRetry?: () => void;
  onSkip?: () => void;
  tone?: "error" | "help";
}) {
  if (!error) return null;

  return (
    <div
      aria-label={tone === "help" ? "Speaking help" : undefined}
      className={cx(
        "lesson-error-banner absolute bottom-24 left-1/2 z-50 grid w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 gap-3 rounded-2xl border-4 border-white px-4 py-3 text-center text-sm font-extrabold leading-tight text-white shadow-md md:bottom-30 md:text-base",
        tone === "help" ? "bg-brand-navy" : "bg-red-800",
      )}
      role={tone === "help" ? "status" : "alert"}
    >
      <p className="m-0">{error}</p>
      {onRetry && onSkip ? (
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            frame="none"
            onClick={onRetry}
            shape="rounded"
            size="compact"
            type="button"
            variant="surface"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Try sound
          </ActionButton>
          <ActionButton
            frame="none"
            onClick={onSkip}
            shape="rounded"
            size="compact"
            type="button"
            variant="navy"
          >
            Skip sound
            <ChevronRight aria-hidden="true" className="size-4" />
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
