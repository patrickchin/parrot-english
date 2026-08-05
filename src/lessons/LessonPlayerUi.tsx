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
}: {
  background: LessonBackgroundAsset;
  children: ReactNode;
}) {
  return (
    <main className="h-dvh min-h-svh w-screen overflow-hidden text-slate-900">
      <section
        aria-label="Parrot English speaking lesson"
        className="relative isolate h-full w-full overflow-hidden bg-sky-300"
      >
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
        {children}
      </section>
    </main>
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
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sm font-black uppercase tracking-wider text-brand-blue">
          <Sparkles aria-hidden="true" className="size-4" />
          Story lesson
        </span>
        <h1 className="m-0 text-3xl font-black leading-tight text-brand-ink short:text-2xl md:text-5xl">
          {lessonTitle}
        </h1>
        <p className="mb-0 mt-3 text-base font-black text-brand-rose md:text-xl">
          {sceneCount} scenes
        </p>
        <p className="mx-auto mb-5 mt-2 max-w-md text-base font-bold leading-snug text-slate-600 md:mb-7 md:text-xl">
          Listen to the story, then speak when it is your turn.
        </p>
        <ActionButton
          aria-label="Start lesson"
          className="max-w-sm"
          fullWidth
          onClick={onStart}
          ref={ref}
          size="hero"
          type="button"
        >
          Start lesson
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
          Story complete!
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
  speech,
}: {
  characterCount: number;
  characterIndex: number;
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
      aria-label={isNarration ? "Story narration" : `${speakerName} is speaking`}
      aria-live="polite"
      className={cx(
        "lesson-dialogue-overlay absolute left-1/2 top-36 z-30 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-3xl border-4 border-white px-4 py-3 text-center shadow-control-surface short:top-32 md:top-28 md:px-7 md:py-4",
        isNarration
          ? "bg-brand-navy/95 text-white shadow-control-navy"
          : "lesson-speech-tail bg-white/95 text-brand-ink",
      )}
      role="status"
      style={{ "--speech-tail-position": tailPosition } as CSSProperties}
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

export function LessonUserPrompt({ dialogue }: { dialogue: string }) {
  return (
    <section
      aria-label="Your turn"
      className="lesson-dialogue-overlay lesson-user-prompt absolute left-1/2 top-36 z-30 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-3xl border-4 border-white bg-white/95 px-2.5 py-2 text-center text-brand-ink shadow-control-surface short:top-32 min-[340px]:px-4 min-[340px]:py-3 md:top-28 md:px-7 md:py-4"
      role="region"
    >
      <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-green md:text-sm">
        <Mic aria-hidden="true" className="size-4" />
        Your turn
      </span>
      <p className="m-0 text-base font-black leading-[1.15] min-[340px]:text-[clamp(1.125rem,4vw,1.75rem)] min-[340px]:leading-tight md:text-[clamp(1.25rem,3.5vw,2rem)]">
        {dialogue}
      </p>
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
  const pauseLabel = isPaused ? "Resume story" : "Pause story";

  return (
    <nav
      aria-label="Story playback controls"
      className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 md:bottom-6 md:gap-3"
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
  onSkip,
  onToggleRecording,
}: {
  isEvaluating: boolean;
  isRecording: boolean;
  onSkip: () => void;
  onToggleRecording: () => void;
}) {
  return (
    <nav
      aria-label="Speaking controls"
      className="absolute bottom-3 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 justify-center gap-2 md:bottom-6 md:max-w-lg md:gap-2.5"
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
          <ActionButton
            aria-label="Microphone"
            aria-pressed={isRecording}
            className={cx(
              "min-w-0 flex-1",
              isRecording && "animate-pulse motion-reduce:animate-none",
            )}
            onClick={onToggleRecording}
            size="large"
            type="button"
            variant={isRecording ? "brand" : "success"}
          >
            <Mic aria-hidden="true" className="size-7 md:size-8" />
            {isRecording ? "Tap when done" : "Tap to talk"}
          </ActionButton>
          <ActionButton
            aria-label="Skip speaking turn"
            className="shrink-0"
            onClick={onSkip}
            size="large"
            type="button"
            variant="navy"
          >
            Skip
          </ActionButton>
        </>
      )}
    </nav>
  );
}

export function LessonErrorBanner({ error }: { error: string }) {
  if (!error) return null;

  return (
    <div
      className="absolute bottom-24 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border-4 border-white bg-red-800 px-4 py-3 text-center text-sm font-extrabold leading-tight text-white shadow-md md:bottom-30 md:text-base"
      role="alert"
    >
      {error}
    </div>
  );
}
