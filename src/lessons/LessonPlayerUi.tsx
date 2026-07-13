import { ChevronLeft, ChevronRight, Mic } from "lucide-react";
import {
  forwardRef,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { ActionButton, cx } from "../shared/ui";

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
        {children}
      </section>
    </main>
  );
}

export function LessonHud({
  currentScene,
  sceneCount,
  title,
  versionLabel,
}: {
  currentScene: number;
  sceneCount: number;
  title: string;
  versionLabel: string;
}) {
  return (
    <>
      <header
        aria-label="Lesson progress"
        className="lesson-hud absolute left-1/2 top-20 z-30 grid -translate-x-1/2 justify-items-center gap-2 short:top-16 md:top-6"
        role="region"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border-4 border-white bg-brand-pink text-xl font-black text-white shadow-control-pink md:size-16 md:text-3xl">
            {currentScene}
          </span>
          <h1 className="m-0 flex min-h-13 max-w-40 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border-4 border-white bg-white/90 px-3 text-base font-black leading-none text-brand-ink shadow-md short:min-h-11 short:text-sm md:min-h-16 md:max-w-sm md:px-5 md:text-xl">
            {title}
          </h1>
        </div>
        <div aria-label="Scene progress" className="flex gap-1.5 pl-1">
          {Array.from({ length: sceneCount }, (_, index) => (
            <span
              aria-hidden="true"
              className={cx(
                "size-3.5 rounded-full border-2 border-white/90 bg-white/55 md:size-5",
                index < currentScene &&
                  "bg-brand-pink shadow-control-pink",
              )}
              key={index}
            />
          ))}
        </div>
      </header>

      <span
        aria-label={`Build version ${versionLabel}`}
        className="absolute left-4 top-24 z-30 hidden max-w-full whitespace-nowrap rounded-full border-2 border-white/90 bg-white/80 px-2.5 py-1 text-xs font-black leading-none text-brand-navy shadow-md md:block lg:left-7"
      >
        {versionLabel}
      </span>
    </>
  );
}

export const LessonStartAction = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    onClick: () => void;
  }
>(function LessonStartAction({ label, onClick }, ref) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-4">
      <button
        aria-label={label}
        className="pointer-events-auto min-h-28 w-3/4 max-w-2xl translate-y-5 cursor-pointer rounded-full border-6 border-white bg-brand-pink px-8 py-4 font-ui text-4xl font-black leading-none text-white shadow-card transition hover:-translate-y-1 hover:brightness-105 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink short:min-h-24 short:text-3xl md:min-h-40 md:translate-y-0 md:text-7xl"
        onClick={onClick}
        ref={ref}
        type="button"
      >
        {label}
      </button>
    </div>
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
            "lesson-character-slot absolute bottom-44 z-10 flex h-2/5 min-w-30 w-1/3 max-w-56 -translate-x-1/2 flex-col items-center justify-end drop-shadow-xl transition short:bottom-24 short:h-1/2 md:bottom-36 md:h-1/2 md:w-1/4 md:max-w-80",
            character.isActive &&
              "z-20 -translate-y-1 scale-105 drop-shadow-2xl",
          )}
          data-character={character.id}
          data-emote={character.emote}
          key={character.id}
          style={{
            "--character-count": characters.length,
            "--character-index": index,
          } as React.CSSProperties}
        >
          <img
            alt={character.asset.alt}
            className="block h-full min-h-0 w-full flex-1 select-none object-contain object-bottom"
            draggable="false"
            src={character.asset.src}
          />
          <span className="inline-block min-w-20 rounded-full border-3 border-white bg-brand-navy/90 px-3 py-1 text-center text-base font-black leading-none capitalize text-white shadow-control-navy short:min-w-16 short:text-sm">
            {character.name}
          </span>
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
  if (speech.kind === "user") return null;

  if (
    speech.kind === "narration" ||
    (speech.kind === "feedback" && speech.speaker === "narrator") ||
    speech.kind === "finished"
  ) {
    return (
      <div
        aria-live="polite"
        className={cx(
          "lesson-speech-overlay absolute left-1/2 top-40 z-20 w-11/12 max-w-3xl -translate-x-1/2 rounded-3xl border-5 border-white bg-brand-navy/95 px-5 py-4 text-center text-white shadow-control-navy short:top-34 md:top-56 md:px-7 lg:top-48",
          speech.kind === "feedback" && "bg-emerald-700/95",
          speech.kind === "finished" && "bg-brand-rose/95",
        )}
        role="status"
      >
        <span className="mb-1 block text-sm font-black uppercase tracking-widest text-brand-yellow">
          Narrator
        </span>
        <p className="m-0 text-2xl font-black leading-tight short:text-xl md:text-4xl">
          {speech.text}
        </p>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="lesson-character-slot lesson-speech-overlay lesson-speech-tail absolute top-40 z-20 w-3/5 max-w-xs -translate-x-1/2 rounded-3xl border-4 border-white bg-white/95 px-4 py-3 text-center shadow-control-surface short:top-34 md:top-56 md:w-2/5 md:max-w-sm md:px-6 md:py-4 lg:top-48 lg:w-1/3"
      data-speaker={speech.speaker}
      role="status"
      style={{
        "--character-count": characterCount,
        "--character-index": Math.max(0, characterIndex),
      } as React.CSSProperties}
    >
      <span className="mb-1 block text-sm font-black uppercase tracking-widest text-brand-rose">
        {speech.speaker}
      </span>
      <p className="m-0 text-2xl font-black leading-tight short:text-xl md:text-4xl">
        {speech.text}
      </p>
    </div>
  );
}

function LessonSceneButton({
  direction,
  ...props
}: {
  direction: "next" | "previous";
  disabled: boolean;
  onClick: () => void;
}) {
  const label = direction === "previous" ? "Previous scene" : "Next scene";
  return (
    <ActionButton
      aria-label={label}
      className="size-13 min-h-0 min-w-0 shrink-0 rounded-full border-4 border-white p-0 short:size-11 md:size-16"
      size="bare"
      type="button"
      {...props}
    >
      {direction === "previous" ? (
        <ChevronLeft aria-hidden="true" className="size-7 md:size-9" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-7 md:size-9" />
      )}
    </ActionButton>
  );
}

function LessonPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex min-h-13 max-w-full min-w-0 items-center justify-center overflow-hidden rounded-full border-4 border-white px-3 font-ui text-base font-black leading-none short:min-h-11 short:text-sm md:min-h-16 md:px-5 md:text-base",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LessonControls({
  atFinalScene,
  atFirstScene,
  dialogue,
  isEvaluating,
  isRecording,
  onKeyDown,
  onKeyUp,
  onNext,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  onPrevious,
  progressLabel,
  showUserTurn,
}: {
  atFinalScene: boolean;
  atFirstScene: boolean;
  dialogue: string;
  isEvaluating: boolean;
  isRecording: boolean;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onKeyUp: KeyboardEventHandler<HTMLButtonElement>;
  onNext: () => void;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
  onPrevious: () => void;
  progressLabel: string;
  showUserTurn: boolean;
}) {
  return (
    <nav
      aria-label="Lesson controls"
      className="absolute bottom-3 left-1/2 z-40 flex w-full max-w-6xl -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-2 short:bottom-1.5 short:flex-nowrap short:gap-1.5 md:bottom-6 md:flex-nowrap md:gap-3 md:px-6"
    >
      <div className="order-first flex w-full min-w-0 justify-center short:order-none short:w-auto md:order-none md:w-auto">
        {showUserTurn ? (
          <strong
            aria-live="assertive"
            className="inline-flex min-h-13 w-full max-w-sm min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border-4 border-white bg-white/95 px-3 text-center font-ui text-base font-black leading-none text-brand-ink shadow-control-surface short:min-h-11 short:max-w-64 short:text-sm md:min-h-16 md:max-w-lg md:px-5 md:text-base"
            role="status"
          >
            {dialogue}
          </strong>
        ) : (
          <LessonPill className="w-full max-w-sm bg-brand-ink text-center text-white shadow-control-navy short:max-w-64 md:max-w-lg">
            {progressLabel}
          </LessonPill>
        )}
      </div>

      <div className="flex w-full max-w-sm items-center justify-between gap-2 short:contents md:contents">
        <LessonSceneButton
          direction="previous"
          disabled={atFirstScene}
          onClick={onPrevious}
        />

        {showUserTurn ? (
          isEvaluating ? (
            <LessonPill className="bg-brand-ink text-white shadow-control-navy">
              Checking your speech...
            </LessonPill>
          ) : (
            <ActionButton
              aria-label={
                isRecording
                  ? "Release when you finish"
                  : "Press and hold to speak"
              }
              className={cx(
                "min-h-13 min-w-13 touch-none select-none gap-2 rounded-full border-4 border-white px-3 short:min-h-11 short:min-w-11 short:px-2 short:text-sm md:min-h-16 md:px-5 md:text-base",
                isRecording &&
                  "animate-pulse motion-reduce:animate-none",
              )}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onPointerCancel={onPointerCancel}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              size="bare"
              type="button"
              variant={isRecording ? "brand" : "success"}
            >
              <Mic aria-hidden="true" className="size-6 md:size-8" />
              <span className="short:hidden">
                {isRecording
                  ? "Release when you finish"
                  : "Press and hold to speak"}
              </span>
            </ActionButton>
          )
        ) : null}

        <LessonSceneButton
          direction="next"
          disabled={atFinalScene}
          onClick={onNext}
        />
      </div>
    </nav>
  );
}

export function LessonErrorBanner({ error }: { error: string }) {
  if (!error) return null;

  return (
    <div
      className="absolute bottom-36 right-4 z-50 w-11/12 max-w-md rounded-2xl border-4 border-white bg-red-800 px-4 py-3 font-extrabold text-white shadow-md short:bottom-24 sm:w-auto"
      role="alert"
    >
      {error}
    </div>
  );
}
