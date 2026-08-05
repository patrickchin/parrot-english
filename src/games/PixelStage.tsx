import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheckBig,
  LoaderCircle,
  MapPin,
  MessageCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import type {
  PixelLesson,
  PixelLessonMission,
  PixelLessonTargetId,
} from "../../lib/pixel-lesson-data";
import { ActionButton, cx } from "../shared/ui";
import type {
  PixelStageController,
  PixelStageDirection,
} from "./pixel-stage-engine";

type GamePhase = "complete" | "practice" | "search" | "success";
type EngineState = "error" | "loading" | "ready";

const DIRECTIONS: PixelStageDirection[] = ["up", "left", "down", "right"];

const TARGET_LABELS: Record<PixelLessonTargetId, string> = {
  "apple-counter": "apple counter",
  "flower-patch": "flower patch",
  "lesson-basket": "lesson basket",
  "lesson-tree": "lesson tree",
};

const PHASE_LABELS: Record<GamePhase, string> = {
  complete: "Adventure complete",
  practice: "Speaking practice",
  search: "Find the marker",
  success: "Mission complete",
};

function stopAllDirections(controller: PixelStageController | null) {
  for (const direction of DIRECTIONS) {
    controller?.setDirection(direction, false);
  }
}

function getSpeechCopy(
  lesson: PixelLesson,
  mission: PixelLessonMission | undefined,
  phase: GamePhase,
) {
  if (phase === "complete" || !mission) {
    return {
      label: "Adventure complete",
      text: lesson.completion,
    };
  }
  if (phase === "practice") {
    return {
      label: "Say it out loud",
      text: mission.phrase,
    };
  }
  if (phase === "success") {
    return {
      label: "You did it",
      text: mission.success,
    };
  }
  return {
    label: `Find the ${TARGET_LABELS[mission.targetId]}`,
    text: mission.instruction,
  };
}

function DirectionButton({
  direction,
  disabled,
  icon,
  onNudge,
  onStart,
  onStop,
}: {
  direction: PixelStageDirection;
  disabled: boolean;
  icon: ReactNode;
  onNudge: (direction: PixelStageDirection) => void;
  onStart: (
    direction: PixelStageDirection,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onStop: (direction: PixelStageDirection) => void;
}) {
  return (
    <ActionButton
      aria-label={`Move ${direction}`}
      className={cx(
        "size-12 min-h-12 min-w-12 touch-none rounded-xl p-0 text-brand-navy shadow-control-surface",
        direction === "up" && "col-start-2",
        direction === "left" && "col-start-1 row-start-2",
        direction === "down" && "col-start-2 row-start-2",
        direction === "right" && "col-start-3 row-start-2",
      )}
      disabled={disabled}
      onClick={() => onNudge(direction)}
      onLostPointerCapture={() => onStop(direction)}
      onPointerCancel={() => onStop(direction)}
      onPointerDown={(event) => onStart(direction, event)}
      onPointerLeave={() => onStop(direction)}
      onPointerUp={() => onStop(direction)}
      size="inline"
      type="button"
      variant="surface"
    >
      {icon}
    </ActionButton>
  );
}

export function PixelStage({ lesson }: { lesson: PixelLesson }) {
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [engineError, setEngineError] = useState("");
  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [missionIndex, setMissionIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>(
    lesson.missions.length > 0 ? "search" : "complete",
  );
  const controllerRef = useRef<PixelStageController | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lessonRef = useRef(lesson);
  const missionIndexRef = useRef(missionIndex);
  const phaseRef = useRef(phase);
  const targetReachedHandlerRef = useRef<
    (targetId: PixelLessonTargetId) => void
  >(() => undefined);

  lessonRef.current = lesson;
  missionIndexRef.current = missionIndex;
  phaseRef.current = phase;

  const mission = lesson.missions[missionIndex];
  const missionCount = lesson.missions.length;
  const completedMissionCount =
    phase === "complete"
      ? missionCount
      : Math.min(
          missionCount,
          missionIndex + (phase === "success" ? 1 : 0),
        );
  const progress =
    missionCount === 0 ? 100 : (completedMissionCount / missionCount) * 100;
  const speech = getSpeechCopy(lesson, mission, phase);
  const movementDisabled = engineState !== "ready" || phase !== "search";

  targetReachedHandlerRef.current = (targetId) => {
    const activeMission =
      lessonRef.current.missions[missionIndexRef.current];
    if (
      !activeMission ||
      activeMission.targetId !== targetId ||
      phaseRef.current !== "search"
    ) {
      return;
    }

    phaseRef.current = "practice";
    setPhase("practice");
    controllerRef.current?.setEmote("talking");
  };

  useEffect(() => {
    const firstMission = lesson.missions[0];
    const nextPhase: GamePhase = firstMission ? "search" : "complete";
    lessonRef.current = lesson;
    missionIndexRef.current = 0;
    phaseRef.current = nextPhase;
    setMissionIndex(0);
    setPhase(nextPhase);
    stopAllDirections(controllerRef.current);
    controllerRef.current?.setEmote(firstMission ? "idle" : "happy");
    controllerRef.current?.setTarget(firstMission?.targetId ?? null);
  }, [lesson]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engineHost = host;

    let cancelled = false;
    let initializationFailed = false;
    let mountedController: PixelStageController | null = null;
    setEngineError("");
    setEngineState("loading");

    async function mountEngine() {
      try {
        const [{ default: Phaser }, { createPixelStageEngine }] =
          await Promise.all([
            import("phaser"),
            import("./pixel-stage-engine"),
          ]);
        if (cancelled) return;

        mountedController = createPixelStageEngine(
          engineHost,
          {
            onError(error) {
              if (cancelled) return;
              initializationFailed = true;
              setEngineError(error.message);
              setEngineState("error");
            },
            onReady() {
              if (cancelled || initializationFailed) return;
              setEngineState("ready");
            },
            onTargetReached(targetId) {
              if (cancelled) return;
              targetReachedHandlerRef.current(targetId);
            },
          },
          Phaser,
        );
        controllerRef.current = mountedController;

        const activeMission =
          lessonRef.current.missions[missionIndexRef.current];
        mountedController.setTarget(
          phaseRef.current === "complete"
            ? null
            : (activeMission?.targetId ?? null),
        );
        mountedController.setEmote(
          phaseRef.current === "search"
            ? "idle"
            : phaseRef.current === "practice"
              ? "talking"
              : phaseRef.current === "success"
                ? (activeMission?.emote ?? "happy")
                : "happy",
        );
      } catch (caughtError) {
        if (cancelled) return;
        setEngineError(
          caughtError instanceof Error
            ? caughtError.message
            : "The pixel lesson game could not start.",
        );
        setEngineState("error");
      }
    }

    void mountEngine();
    return () => {
      cancelled = true;
      mountedController?.destroy();
      if (controllerRef.current === mountedController) {
        controllerRef.current = null;
      }
    };
  }, [engineAttempt]);

  useEffect(() => {
    if (movementDisabled) stopAllDirections(controllerRef.current);
  }, [movementDisabled]);

  function startDirection(
    direction: PixelStageDirection,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (movementDisabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    controllerRef.current?.setDirection(direction, true);
  }

  function stopDirection(direction: PixelStageDirection) {
    controllerRef.current?.setDirection(direction, false);
  }

  function finishPractice() {
    if (!mission) return;
    phaseRef.current = "success";
    setPhase("success");
    controllerRef.current?.setEmote(mission.emote);
  }

  function advanceMission() {
    const nextMissionIndex = missionIndex + 1;
    const nextMission = lesson.missions[nextMissionIndex];
    stopAllDirections(controllerRef.current);

    if (!nextMission) {
      phaseRef.current = "complete";
      setPhase("complete");
      controllerRef.current?.setTarget(null);
      controllerRef.current?.setEmote("happy");
      return;
    }

    missionIndexRef.current = nextMissionIndex;
    phaseRef.current = "search";
    setMissionIndex(nextMissionIndex);
    setPhase("search");
    controllerRef.current?.setTarget(nextMission.targetId);
    controllerRef.current?.setEmote("idle");
  }

  function replayLesson() {
    const firstMission = lesson.missions[0];
    if (!firstMission) return;

    stopAllDirections(controllerRef.current);
    missionIndexRef.current = 0;
    phaseRef.current = "search";
    setMissionIndex(0);
    setPhase("search");
    controllerRef.current?.setTarget(firstMission.targetId);
    controllerRef.current?.setEmote("idle");
  }

  return (
    <article
      aria-label={`${lesson.title} pixel game`}
      className="grid min-w-0 gap-3 text-slate-900"
    >
      <header className="grid gap-2 rounded-2xl bg-sky-50 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 min-w-0 text-2xl leading-tight text-brand-navy md:text-3xl">
            {lesson.title}
          </h3>
          <span className="shrink-0 rounded-full bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
            For {lesson.learnerName}
          </span>
        </div>
        <p className="m-0 font-bold leading-relaxed text-slate-600">
          {lesson.summary}
        </p>
        <p className="m-0 rounded-xl bg-white px-3 py-2 font-bold leading-relaxed text-brand-blue">
          {lesson.intro}
        </p>
      </header>

      <section
        aria-busy={engineState === "loading" || undefined}
        aria-label="Pixel lesson game world"
        className="relative aspect-[3/2] min-h-48 w-full overflow-hidden rounded-2xl border-4 border-brand-ink bg-emerald-900 shadow-control-navy"
      >
        <div
          className="absolute inset-0 grid place-items-center overflow-hidden [&_canvas]:max-h-full [&_canvas]:max-w-full"
          ref={hostRef}
        />

        <div
          aria-label="Game progress"
          className="pointer-events-none absolute left-2 top-2 z-10 grid max-w-[calc(100%-1rem)] gap-1 rounded-xl border-2 border-brand-ink bg-white/95 px-2.5 py-2 text-xs font-black text-brand-ink shadow-md sm:left-3 sm:top-3 sm:px-3 sm:text-sm"
          role="region"
        >
          <span className="uppercase tracking-wider text-brand-rose">
            {phase === "complete"
              ? `${missionCount} of ${missionCount} missions`
              : `Mission ${Math.min(missionIndex + 1, missionCount)} of ${missionCount}`}
          </span>
          <span>{PHASE_LABELS[phase]}</span>
          {mission && phase !== "complete" ? (
            <span className="text-brand-blue">
              Target: {TARGET_LABELS[mission.targetId]}
            </span>
          ) : null}
          <div
            aria-label="Mission progress"
            aria-valuemax={missionCount || 1}
            aria-valuemin={0}
            aria-valuenow={completedMissionCount}
            className="mt-0.5 h-2 w-full min-w-32 overflow-hidden rounded-full bg-sky-100"
            role="progressbar"
          >
            <span
              aria-hidden="true"
              className="block h-full rounded-full bg-brand-pink transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {engineState === "loading" ? (
          <div
            aria-live="polite"
            className="absolute inset-0 z-20 grid place-items-center bg-brand-navy/45 p-4"
            role="status"
          >
            <span className="inline-flex items-center gap-2 rounded-2xl border-3 border-white bg-white px-4 py-3 font-black text-brand-navy shadow-card">
              <LoaderCircle
                aria-hidden="true"
                className="size-5 motion-safe:animate-spin"
              />
              Growing the lesson garden…
            </span>
          </div>
        ) : null}

        {engineState === "error" ? (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-brand-navy/75 p-4"
            role="alert"
          >
            <div className="grid max-w-sm justify-items-center gap-3 rounded-2xl border-3 border-white bg-white p-4 text-center shadow-card">
              <p className="m-0 font-black leading-relaxed text-red-800">
                {engineError || "The pixel lesson game could not start."}
              </p>
              <ActionButton
                className="gap-2 rounded-full"
                onClick={() => setEngineAttempt((attempt) => attempt + 1)}
                size="compact"
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-5" />
                Try again
              </ActionButton>
            </div>
          </div>
        ) : null}
      </section>

      <section
        aria-atomic="true"
        aria-live="polite"
        className={cx(
          "grid min-h-32 content-center gap-2 rounded-2xl border-3 px-4 py-3 text-center",
          phase === "success" || phase === "complete"
            ? "border-emerald-300 bg-emerald-50"
            : "border-sky-200 bg-white",
        )}
        role="status"
      >
        <span
          className={cx(
            "mx-auto inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest",
            phase === "success" || phase === "complete"
              ? "text-brand-green"
              : "text-brand-rose",
          )}
        >
          {phase === "search" ? (
            <MapPin aria-hidden="true" className="size-4" />
          ) : phase === "practice" ? (
            <MessageCircle aria-hidden="true" className="size-4" />
          ) : phase === "success" ? (
            <CircleCheckBig aria-hidden="true" className="size-4" />
          ) : (
            <Sparkles aria-hidden="true" className="size-4" />
          )}
          {speech.label}
        </span>
        <p
          className={cx(
            "m-0 font-black leading-tight text-brand-ink",
            phase === "practice"
              ? "text-2xl sm:text-3xl"
              : "text-lg sm:text-xl",
          )}
        >
          {phase === "practice" ? `“${speech.text}”` : speech.text}
        </p>
      </section>

      <footer className="grid gap-4 rounded-2xl bg-sky-50 p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-4">
        <section
          aria-label="Movement controls"
          className="grid justify-items-center gap-2"
        >
          <span className="text-xs font-black uppercase tracking-widest text-brand-blue">
            Move
          </span>
          <div
            aria-label="Move around the lesson garden"
            className="grid grid-cols-3 grid-rows-2 gap-2"
            role="group"
          >
            <DirectionButton
              direction="up"
              disabled={movementDisabled}
              icon={<ArrowUp aria-hidden="true" className="size-6" />}
              onNudge={(direction) =>
                controllerRef.current?.nudge(direction)
              }
              onStart={startDirection}
              onStop={stopDirection}
            />
            <DirectionButton
              direction="left"
              disabled={movementDisabled}
              icon={<ArrowLeft aria-hidden="true" className="size-6" />}
              onNudge={(direction) =>
                controllerRef.current?.nudge(direction)
              }
              onStart={startDirection}
              onStop={stopDirection}
            />
            <DirectionButton
              direction="down"
              disabled={movementDisabled}
              icon={<ArrowDown aria-hidden="true" className="size-6" />}
              onNudge={(direction) =>
                controllerRef.current?.nudge(direction)
              }
              onStart={startDirection}
              onStop={stopDirection}
            />
            <DirectionButton
              direction="right"
              disabled={movementDisabled}
              icon={<ArrowRight aria-hidden="true" className="size-6" />}
              onNudge={(direction) =>
                controllerRef.current?.nudge(direction)
              }
              onStart={startDirection}
              onStop={stopDirection}
            />
          </div>
        </section>

        <div className="grid min-w-0 justify-items-stretch gap-3 text-center sm:justify-items-center">
          <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
            {phase === "search"
              ? "Move to the golden marker. Select the game canvas to use arrow keys or WASD."
              : phase === "practice"
                ? "Say the phrase out loud, then tell Peppa when you are done."
                : phase === "success"
                  ? "Ready for the next garden mission?"
                  : "Replay to practise every phrase again."}
          </p>

          {phase === "practice" ? (
            <ActionButton
              className="w-full gap-2 rounded-full sm:w-auto"
              onClick={finishPractice}
              type="button"
              variant="success"
            >
              <CircleCheckBig aria-hidden="true" className="size-5" />
              I said it!
            </ActionButton>
          ) : null}
          {phase === "success" ? (
            <ActionButton
              className="w-full gap-2 rounded-full sm:w-auto"
              onClick={advanceMission}
              type="button"
            >
              {missionIndex + 1 < missionCount
                ? "Next mission"
                : "Finish adventure"}
              <ArrowRight aria-hidden="true" className="size-5" />
            </ActionButton>
          ) : null}
          {phase === "complete" && missionCount > 0 ? (
            <ActionButton
              className="w-full gap-2 rounded-full sm:w-auto"
              onClick={replayLesson}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-5" />
              Replay adventure
            </ActionButton>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
