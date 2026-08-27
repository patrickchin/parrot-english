import {
  ChevronLeft,
  ChevronRight,
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
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ActionButton,
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

function scrollOverflowText(event: KeyboardEvent<HTMLParagraphElement>) {
  const target = event.currentTarget;
  if (target.scrollHeight <= target.clientHeight) return;

  const lineHeight = Number.parseFloat(getComputedStyle(target).lineHeight) || 24;
  const pageDistance = Math.max(lineHeight, target.clientHeight - lineHeight);
  const nextScrollTop =
    event.key === "ArrowDown"
      ? target.scrollTop + lineHeight
      : event.key === "ArrowUp"
        ? target.scrollTop - lineHeight
        : event.key === "PageDown"
          ? target.scrollTop + pageDistance
          : event.key === "PageUp"
            ? target.scrollTop - pageDistance
            : event.key === "End"
              ? target.scrollHeight
              : event.key === "Home"
                ? 0
                : null;

  if (nextScrollTop === null) return;
  event.preventDefault();
  target.scrollTop = nextScrollTop;
}

function useOverflowText(text: string) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    let active = true;
    const update = () => {
      if (!active) return;
      setIsOverflowing(target.scrollHeight - target.clientHeight > 1);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);

    update();
    resizeObserver?.observe(target);
    window.addEventListener("resize", update);
    void document.fonts?.ready.then(update);

    return () => {
      active = false;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [text]);

  return { ref, tabIndex: isOverflowing ? 0 : undefined };
}

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

export function BoxedFullSceneStage({
  decoded = false,
  image,
  onDecoded,
  onFailed,
  onRetry,
  reserved = false,
}: {
  decoded?: boolean;
  image: FullSceneImage;
  onDecoded?: (src: string) => void;
  onFailed?: (src: string) => void;
  onRetry?: (src: string) => void;
  reserved?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [decodedRequest, setDecodedRequest] = useState("");
  const [failedRequest, setFailedRequest] = useState("");
  const [retrySequence, setRetrySequence] = useState(0);
  const requestKey = `${image.src}:${retrySequence}`;
  const isDecoded = decoded || decodedRequest === requestKey;
  const didFail = failedRequest === requestKey;

  useEffect(() => {
    if (decoded) return;
    const element = imageRef.current;
    if (!element) return;
    let active = true;
    let settled = false;
    let decoding = false;
    let timeoutId: number | undefined;

    const clearLoadTimeout = () => {
      if (timeoutId === undefined) return;
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    };

    const reportFailure = () => {
      if (!active || settled) return;
      settled = true;
      clearLoadTimeout();
      setFailedRequest(requestKey);
      onFailed?.(image.src);
    };
    const reportDecoded = async () => {
      if (!active || settled || decoding) return;
      decoding = true;
      try {
        if (typeof element.decode === "function") await element.decode();
      } catch {
        if (!element.complete || element.naturalWidth === 0) {
          reportFailure();
          return;
        }
      }
      if (!active || settled || element !== imageRef.current) return;
      if (!element.complete || element.naturalWidth === 0) {
        reportFailure();
        return;
      }
      settled = true;
      clearLoadTimeout();
      setDecodedRequest(requestKey);
      onDecoded?.(image.src);
    };
    const handleLoad = () => void reportDecoded();

    element.addEventListener("load", handleLoad);
    element.addEventListener("error", reportFailure);
    timeoutId = window.setTimeout(reportFailure, 8_000);
    if (element.complete && element.naturalWidth > 0) void reportDecoded();

    return () => {
      active = false;
      clearLoadTimeout();
      element.removeEventListener("load", handleLoad);
      element.removeEventListener("error", reportFailure);
    };
  }, [decoded, image.src, onDecoded, onFailed, requestKey]);

  return (
    <section
      aria-label="Lesson artwork"
      className={cx(
        "lesson-full-scene-art z-10 aspect-video overflow-hidden rounded-2xl border-4 border-white bg-white/90 shadow-card md:rounded-3xl",
        reserved
          ? "relative h-[min(100cqh,56.25cqw)] w-[min(100cqw,177.78cqh)]"
          : "absolute left-1/2 top-1/2 max-h-[52dvh] w-[min(calc(100%_-_2rem),92dvh,56rem)] -translate-x-1/2 -translate-y-1/2",
      )}
      role="region"
    >
      <img
        alt={image.alt}
        className={cx(
          "block size-full select-none object-contain transition-opacity motion-reduce:transition-none",
          isDecoded ? "opacity-100" : "opacity-0",
        )}
        decoding="async"
        draggable="false"
        fetchPriority="high"
        key={requestKey}
        loading="eager"
        ref={imageRef}
        src={image.src}
      />
      {isDecoded ? null : (
        <div className="absolute inset-0 grid place-items-center bg-sky-100/95 p-4 text-center text-brand-ink">
          {didFail ? (
            <div className="grid max-w-xs place-items-center gap-3" role="alert">
              <p className="m-0 text-lg font-black">No picture yet.</p>
              <ActionButton
                aria-label="Try loading picture again"
                onClick={() => {
                  onRetry?.(image.src);
                  setRetrySequence((current) => current + 1);
                }}
                size="large"
                type="button"
                variant="navy"
              >
                Try again
              </ActionButton>
            </div>
          ) : (
            <div
              aria-live="polite"
              className="grid place-items-center gap-2 font-black"
              role="status"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-8 animate-spin text-brand-blue motion-reduce:animate-none"
              />
              Loading picture…
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function BoxedLessonSceneLayout({
  artworkDecoded = false,
  controls,
  dialogue,
  hud,
  image,
  notice,
  onArtworkDecoded,
}: {
  artworkDecoded?: boolean;
  controls: ReactNode;
  dialogue: ReactNode;
  hud: ReactNode;
  image: FullSceneImage;
  notice: ReactNode;
  onArtworkDecoded?: (src: string) => void;
}) {
  const useSceneSafePanel = !notice;
  const isRibbon = image.panelLayout === "ribbon";
  const [panelX, panelY, panelWidth, panelHeight] = image.panelSafeRect;
  const panelStyle = {
    "--lesson-panel-height": `${panelHeight * 100}%`,
    "--lesson-panel-left": `${(panelX + panelWidth / 2) * 100}%`,
    "--lesson-panel-top": `${panelY * 100}%`,
    "--lesson-panel-width": `${panelWidth * 100}%`,
  } as CSSProperties;

  return (
    <section
      aria-label="Active lesson content"
      className={cx(
        "absolute inset-x-2 bottom-2 top-20 z-10 grid min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_minmax(0,auto)_auto_auto] gap-1.5 [container-type:size] short:top-16 md:inset-x-3 md:bottom-4 md:top-24 md:gap-3 short-wide:inset-x-2 short-wide:bottom-2 short-wide:top-16 short-wide:gap-2 min-[560px]:landscape:grid-cols-[minmax(0,3fr)_minmax(14rem,2fr)] min-[560px]:landscape:grid-rows-[auto_minmax(0,1fr)_auto_auto] wide:inset-x-6 wide:gap-4",
        useSceneSafePanel
          ? "tall-wide:grid-cols-1 tall-wide:grid-rows-1 tall-wide:place-items-center"
          : "tall-wide:grid-cols-[minmax(0,1fr)_clamp(20rem,24vw,28rem)] tall-wide:grid-rows-1",
      )}
    >
      <div
        className={cx(
          "contents",
          useSceneSafePanel &&
            "tall-wide:relative tall-wide:block tall-wide:h-[min(100cqh,56.25cqw)] tall-wide:w-[min(100cqw,177.78cqh)]",
        )}
      >
        <div
          className={cx(
            "row-start-2 grid min-h-0 min-w-0 place-items-center [container-type:size] min-[560px]:landscape:col-start-1 min-[560px]:landscape:row-span-4 min-[560px]:landscape:row-start-1",
            useSceneSafePanel &&
              "tall-wide:absolute tall-wide:inset-0 tall-wide:z-0 tall-wide:col-auto tall-wide:row-auto tall-wide:row-span-1",
            !useSceneSafePanel &&
              "tall-wide:row-span-1 tall-wide:row-start-1",
          )}
        >
          <BoxedFullSceneStage
            decoded={artworkDecoded}
            image={image}
            onDecoded={onArtworkDecoded}
            reserved
          />
        </div>
        <div
          aria-label="Lesson words and controls"
          className={cx(
            "contents min-[560px]:landscape:col-start-2 min-[560px]:landscape:row-span-4 min-[560px]:landscape:row-start-1 min-[560px]:landscape:grid min-[560px]:landscape:min-h-0 min-[560px]:landscape:grid-rows-[auto_minmax(0,1fr)_auto_auto] min-[560px]:landscape:gap-2",
            useSceneSafePanel &&
              "tall-wide:absolute tall-wide:left-[var(--lesson-panel-left)] tall-wide:top-[var(--lesson-panel-top)] tall-wide:z-20 tall-wide:col-auto tall-wide:row-auto tall-wide:max-h-[var(--lesson-panel-height)] tall-wide:w-[min(var(--lesson-panel-width),28rem)] tall-wide:-translate-x-1/2 tall-wide:gap-0.5 tall-wide:overflow-hidden tall-wide:rounded-3xl tall-wide:border-4 tall-wide:border-white tall-wide:bg-white/90 tall-wide:p-1 tall-wide:shadow-card",
            useSceneSafePanel &&
              isRibbon &&
              "tall-wide:w-[var(--lesson-panel-width)] tall-wide:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.4fr)_auto] tall-wide:grid-rows-1 tall-wide:items-center tall-wide:gap-2",
            !useSceneSafePanel &&
              "tall-wide:self-center tall-wide:row-span-1 tall-wide:row-start-1 tall-wide:grid-rows-[auto_auto_auto_auto] tall-wide:content-center tall-wide:gap-2 tall-wide:rounded-3xl tall-wide:border-4 tall-wide:border-white tall-wide:bg-white/90 tall-wide:p-2 tall-wide:shadow-card",
          )}
          role="region"
          style={useSceneSafePanel ? panelStyle : undefined}
        >
          <div
            className={cx(
              "col-start-1 row-start-1 min-w-0",
              useSceneSafePanel && isRibbon && "tall-wide:self-center",
            )}
          >
            {hud}
          </div>
          <div
            className={cx(
              "col-start-1 row-start-3 flex min-h-0 min-w-0 items-start overflow-hidden min-[560px]:landscape:row-start-2",
              useSceneSafePanel &&
                isRibbon &&
                "tall-wide:col-start-2 tall-wide:row-start-1 tall-wide:items-center",
            )}
          >
            {dialogue}
          </div>
          {notice ? (
            <div className="col-start-1 row-start-4 min-w-0 min-[560px]:landscape:row-start-3">
              {notice}
            </div>
          ) : null}
          <div
            className={cx(
              "col-start-1 row-start-5 min-w-0 min-[560px]:landscape:row-start-4",
              useSceneSafePanel &&
                isRibbon &&
                "tall-wide:col-start-3 tall-wide:row-start-1",
            )}
          >
            {controls}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LessonHud({
  currentScene,
  reserved = false,
  sceneCount,
  title,
}: {
  currentScene: number;
  reserved?: boolean;
  sceneCount: number;
  title: string;
}) {
  const progress = `${(currentScene / sceneCount) * 100}%`;

  return (
    <header
      aria-label="Lesson progress"
      className={cx(
        "lesson-hud z-30",
        reserved
          ? "relative w-full min-w-0 max-w-none"
          : "absolute left-1/2 top-20 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 short:top-16 md:top-5 md:max-w-xl",
      )}
      role="region"
    >
      <div
        className={cx(
          "flex min-h-11 min-w-0 items-center gap-2 rounded-full border-3 border-white bg-white/95 px-3 py-1.5 text-brand-ink shadow-md md:min-h-14 md:gap-3 md:px-4",
          reserved &&
            "short-wide:min-h-11 short-wide:gap-2 short-wide:px-3 short-wide:py-1 tall-wide:min-h-10 tall-wide:gap-1.5 tall-wide:border-0 tall-wide:px-2.5 tall-wide:py-1 tall-wide:shadow-none",
        )}
      >
        <span
          className={cx(
            "shrink-0 text-xs font-black uppercase tracking-wide text-brand-rose md:text-sm",
            reserved &&
              "short-wide:text-xs tall-wide:text-[0.65rem] tall-wide:tracking-normal",
          )}
        >
          Scene {currentScene} of {sceneCount}
        </span>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-sky-200" />
        <h1
          className={cx(
            "m-0 min-w-0 flex-1 truncate text-base font-black leading-tight md:text-xl",
            reserved &&
              "short-wide:text-base tall-wide:text-base",
          )}
        >
          {title}
        </h1>
      </div>
      <div
        aria-label="Scene progress"
        aria-valuemax={sceneCount}
        aria-valuemin={1}
        aria-valuenow={currentScene}
        className={cx(
          "mx-5 mt-1.5 h-2 overflow-hidden rounded-full border border-white/90 bg-white/65 shadow-sm md:mx-7 md:h-2.5",
          reserved &&
            "short-wide:mx-4 short-wide:mt-1 short-wide:h-1.5 tall-wide:mx-3 tall-wide:mt-0.5 tall-wide:h-1.5 tall-wide:border-0 tall-wide:shadow-none",
        )}
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
    ready?: boolean;
    sceneCount: number;
  }
>(function LessonIntroduction(
  { lessonTitle, onStart, ready = true, sceneCount },
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
          {lessonTitle} · {sceneCount} parts
        </span>
        <h1 className="m-0 text-3xl font-black leading-tight text-brand-ink short:text-2xl md:text-5xl">
          Watch and join in
        </h1>
        <p className="mx-auto mb-6 mt-3 max-w-md text-lg font-bold leading-snug text-slate-600 short:mb-4 md:mb-8 md:mt-4 md:text-2xl">
          Watch the story and say the big words with the group whenever you like.
        </p>
        <ActionButton
          className="max-w-sm"
          disabled={!ready}
          fullWidth
          onClick={onStart}
          ref={ref}
          size="hero"
          type="button"
        >
          {ready ? (
            "Let's go"
          ) : (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-7 animate-spin motion-reduce:animate-none"
              />
              Loading picture…
            </>
          )}
        </ActionButton>
      </Card>
    </section>
  );
});

export type LessonCompletionSaveState = "failed" | "idle" | "pending";

export const LessonCompletion = forwardRef<
  HTMLButtonElement,
  {
    lessonTitle: string;
    onBack: () => void;
    onReplay: () => void;
    onRetrySaving: () => void;
    saveState: LessonCompletionSaveState;
  }
>(function LessonCompletion(
  {
    lessonTitle,
    onBack,
    onReplay,
    onRetrySaving,
    saveState,
  },
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
        <p className="mb-4 mt-3 text-lg font-bold leading-snug text-slate-600 md:text-2xl">
          You finished {lessonTitle}!
        </p>
        {saveState === "pending" ? (
          <p
            aria-live="polite"
            className="mb-4 mt-0 font-bold text-slate-600"
            role="status"
          >
            Saving your voices…
          </p>
        ) : null}
        {saveState === "failed" ? (
          <div
            aria-live="polite"
            className="mb-4 grid place-items-center gap-2"
            role="status"
          >
            <p className="m-0 font-bold text-slate-600">
              Some voices have not saved yet.
            </p>
            <ActionButton
              onClick={onRetrySaving}
              shape="rounded"
              size="compact"
              type="button"
              variant="navy"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Try saving again
            </ActionButton>
          </div>
        ) : null}
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
    <div
      className="lesson-character-layer pointer-events-none absolute inset-0 z-10"
      data-character-count={characters.length}
    >
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
  reserved = false,
  showTail = true,
  speech,
}: {
  characterCount: number;
  characterIndex: number;
  reserved?: boolean;
  showTail?: boolean;
  speech: LessonSpeechPresentation;
}) {
  const overflowText = useOverflowText(speech.text);
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
        "lesson-dialogue-overlay z-30 rounded-3xl border-4 border-white px-4 py-3 text-center shadow-control-surface md:px-7 md:py-4",
        reserved
          ? "relative max-h-full w-full min-w-0 max-w-none overflow-hidden short-wide:rounded-2xl short-wide:px-3 short-wide:py-1.5 tall-wide:rounded-xl tall-wide:border-0 tall-wide:px-3 tall-wide:py-1.5 tall-wide:shadow-none"
          : "absolute left-1/2 top-36 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 short:top-32 md:top-28",
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
      <p
        className={cx(
          "m-0 max-h-32 overflow-y-auto text-[clamp(1.25rem,5.4vw,2.25rem)] font-black leading-tight focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-2 md:max-h-40",
          reserved &&
            "min-h-0 overscroll-contain short-wide:text-xl tall-wide:text-[clamp(1.125rem,1.7vw,1.5rem)]",
          isNarration
            ? "focus-visible:outline-brand-yellow"
            : "focus-visible:outline-brand-ink",
        )}
        onKeyDown={scrollOverflowText}
        ref={overflowText.ref}
        tabIndex={overflowText.tabIndex}
      >
        {speech.text}
      </p>
    </div>
  );
}

export function LessonJoinInPrompt({
  dialogue,
  recording,
  reserved = false,
}: {
  dialogue: string;
  recording: boolean;
  reserved?: boolean;
}) {
  const headingId = useId();
  const overflowText = useOverflowText(dialogue);

  return (
    <section
      aria-labelledby={headingId}
      className={cx(
        "lesson-dialogue-overlay lesson-user-prompt z-30 grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-3xl border-4 border-white bg-white/95 px-3 py-3 text-center text-brand-ink shadow-control-surface min-[340px]:px-4 md:px-7 md:py-4",
        reserved
          ? "relative max-h-full w-full min-w-0 max-w-none overflow-hidden short-wide:rounded-2xl short-wide:px-3 short-wide:py-1.5 tall-wide:rounded-xl tall-wide:border-0 tall-wide:px-3 tall-wide:py-1.5 tall-wide:shadow-none"
          : "absolute left-1/2 top-36 max-h-[calc(72dvh-15rem)] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 short:top-32 md:top-28",
      )}
      role="region"
    >
      <h2
        className="m-0 inline-flex items-center justify-self-center gap-1.5 text-sm font-black uppercase tracking-widest text-brand-green md:text-base"
        id={headingId}
      >
        <Mic aria-hidden="true" className="size-4" />
        Join in
      </h2>
      <p
        className={cx(
          "m-0 min-h-0 overflow-y-auto overscroll-contain py-1 text-[clamp(1.65rem,8vw,3.5rem)] font-black leading-none focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-ink",
          reserved &&
            "max-h-32 short-wide:text-[clamp(1.4rem,4.5vw,2.25rem)] tall-wide:max-h-20 tall-wide:text-[clamp(1.25rem,2.2vw,2rem)]",
        )}
        onKeyDown={scrollOverflowText}
        ref={overflowText.ref}
        tabIndex={overflowText.tabIndex}
      >
        {dialogue}
      </p>
      <div
        aria-live="polite"
        className="m-0 inline-flex min-h-5 items-center justify-center gap-1.5 text-sm font-extrabold text-slate-600"
        role="status"
      >
        {recording ? (
          <Mic aria-hidden="true" className="size-4 text-brand-green" />
        ) : (
          <Ear aria-hidden="true" className="size-4 text-brand-blue" />
        )}
        {recording
          ? "Your microphone is joining in too"
          : "Voices are joining in"}
      </div>
    </section>
  );
}

export function LessonUserPrompt({
  dialogue,
  portrait,
  reserved = false,
  status = "ready",
}: {
  dialogue: string;
  portrait?: PersonalizedStoryArtwork | null;
  reserved?: boolean;
  status?: "checking" | "ready" | "recording";
}) {
  const overflowText = useOverflowText(dialogue);
  const promptLabel =
    status === "recording"
      ? "Listening"
      : status === "checking"
        ? "Checking"
        : "Your turn";

  return (
    <section
      aria-label="Your turn"
      className={cx(
        "lesson-dialogue-overlay lesson-user-prompt z-30 rounded-3xl border-4 border-white bg-white/95 px-2.5 py-2 text-center text-brand-ink shadow-control-surface min-[340px]:px-4 min-[340px]:py-3 md:px-7 md:py-4",
        reserved
          ? "relative max-h-full w-full min-w-0 max-w-none overflow-hidden short-wide:rounded-2xl short-wide:px-3 short-wide:py-1.5 tall-wide:rounded-xl tall-wide:border-0 tall-wide:px-3 tall-wide:py-1.5 tall-wide:shadow-none"
          : "absolute left-1/2 top-36 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 short:top-32 md:top-28",
        portrait && "lesson-user-prompt-with-portrait",
        portrait && reserved && "tall-wide:flex tall-wide:items-center tall-wide:gap-2",
      )}
      role="region"
    >
      {portrait ? (
        <img
          alt="You in storybook style"
          className="lesson-user-portrait mx-auto mb-2 size-20 rounded-[1.4rem] border-3 border-white object-cover shadow-control-surface md:mb-3 md:size-24 tall-wide:mb-0 tall-wide:size-12 tall-wide:shrink-0 tall-wide:rounded-xl tall-wide:border-2"
          src={portrait.src}
        />
      ) : null}
      <div
        className={cx(
          "lesson-user-prompt-copy min-w-0",
          reserved && "grid min-h-0 grid-rows-[auto_minmax(0,1fr)]",
          portrait && reserved && "tall-wide:flex-1",
        )}
      >
        <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-brand-green md:text-sm">
          {status === "checking" ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Mic aria-hidden="true" className="size-4" />
          )}
          {promptLabel}
        </span>
        <p
          className={cx(
            "m-0 text-base font-black leading-[1.15] focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-ink min-[340px]:text-[clamp(1.125rem,4vw,1.75rem)] min-[340px]:leading-tight md:text-[clamp(1.25rem,3.5vw,2rem)]",
            reserved &&
              "min-h-0 overflow-y-auto overscroll-contain short-wide:text-xl tall-wide:text-[clamp(1.125rem,1.7vw,1.5rem)]",
          )}
          onKeyDown={scrollOverflowText}
          ref={overflowText.ref}
          tabIndex={overflowText.tabIndex}
        >
          {dialogue}
        </p>
      </div>
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
  reserved = false,
}: {
  atFinalScene: boolean;
  atFirstScene: boolean;
  isPaused: boolean;
  onNext: () => void;
  onPauseResume: () => void;
  onPrevious: () => void;
  reserved?: boolean;
}) {
  const pauseLabel = isPaused ? "Resume lesson" : "Pause lesson";

  return (
    <nav
      aria-label="Lesson playback controls"
      className={cx(
        "lesson-playback-controls z-40 flex items-center gap-2.5 md:gap-3",
        reserved
          ? "relative w-full justify-center"
          : "absolute bottom-3 left-1/2 -translate-x-1/2 md:bottom-6",
      )}
    >
      <IconButton
        aria-label="Previous scene"
        className={reserved ? "tall-wide:size-12" : undefined}
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
        className={reserved ? "tall-wide:size-12" : undefined}
        elevation="raised"
        frame="white"
        onClick={onPauseResume}
        size="large"
        type="button"
        variant="rose"
      >
        {isPaused ? (
          <Play aria-hidden="true" className="size-6 fill-current md:size-8" />
        ) : (
          <Pause aria-hidden="true" className="size-6 fill-current md:size-8" />
        )}
      </IconButton>
      <IconButton
        aria-label="Next scene"
        className={reserved ? "tall-wide:size-12" : undefined}
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

export function LessonErrorBanner({
  error,
  onRetry,
  onSkip,
  reserved = false,
  tone = "error",
}: {
  error: string;
  onRetry?: () => void;
  onSkip?: () => void;
  reserved?: boolean;
  tone?: "error" | "help";
}) {
  if (!error) return null;

  return (
    <div
      aria-label={tone === "help" ? "Speaking help" : undefined}
      className={cx(
        "lesson-error-banner z-50 grid gap-3 rounded-2xl border-4 border-white px-4 py-3 text-center text-sm font-extrabold leading-tight text-white shadow-md md:text-base",
        reserved
          ? "relative w-full min-w-0 max-w-none short-wide:gap-2 short-wide:px-3 short-wide:py-2 short-wide:text-sm"
          : "absolute bottom-24 left-1/2 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 md:bottom-30",
        tone === "help" ? "bg-brand-navy" : "bg-red-800",
      )}
      data-tone={tone}
      aria-live={tone === "help" ? "polite" : undefined}
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
