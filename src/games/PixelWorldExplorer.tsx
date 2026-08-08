import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRightLeft,
  Hand,
  Map,
  Trees,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  PIXEL_WORLD_OBJECTS_BY_ID,
  PIXEL_WORLD_PACK,
  PIXEL_WORLD_SCENES_BY_ID,
} from "../../prototypes/pixel-stage/world-pack.js";
import { HeaderLink, RouteHeader } from "../app/AppHeader";
import { ActionButton, cx } from "../shared/ui";
import type {
  PixelWorldController,
  PixelWorldDirection,
  PixelWorldEmote,
  PixelWorldParallaxMode,
} from "./pixel-world-engine";

const DIRECTIONS: PixelWorldDirection[] = ["up", "left", "down", "right"];
const EMOTES: PixelWorldEmote[] = ["idle", "talking", "happy", "surprised"];
const PARALLAX_MODES: Array<{
  description: string;
  icon: ReactNode;
  label: string;
  mode: PixelWorldParallaxMode;
}> = [
  {
    description: "All background layers move with the world.",
    icon: <ArrowLeftToLine aria-hidden="true" className="size-4" />,
    label: "Parallax off",
    mode: "off",
  },
  {
    description: "Background layers use scene scroll factors only.",
    icon: <ArrowLeftRight aria-hidden="true" className="size-4" />,
    label: "Camera parallax",
    mode: "camera",
  },
  {
    description: "Camera parallax plus integer-snapped cloud drift.",
    icon: <ArrowRightLeft aria-hidden="true" className="size-4" />,
    label: "Ambient drift",
    mode: "ambient",
  },
];

function stopAllDirections(controller: PixelWorldController | null) {
  for (const direction of DIRECTIONS) {
    controller?.setDirection(direction, false);
  }
}

function DirectionButton({
  direction,
  disabled,
  icon,
  onNudge,
  onStart,
  onStop,
}: {
  direction: PixelWorldDirection;
  disabled: boolean;
  icon: ReactNode;
  onNudge: (direction: PixelWorldDirection) => void;
  onStart: (
    direction: PixelWorldDirection,
    event: PointerEvent<HTMLButtonElement>,
  ) => void;
  onStop: (direction: PixelWorldDirection) => void;
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

export function PixelWorldExplorer() {
  const sceneList = PIXEL_WORLD_PACK.scenes;
  const defaultScene = PIXEL_WORLD_PACK.defaultSceneId;
  const [emote, setEmote] = useState<PixelWorldEmote>("idle");
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [engineError, setEngineError] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [heldItemId, setHeldItemId] = useState<string | null>("red-apple");
  const [parallaxMode, setParallaxMode] =
    useState<PixelWorldParallaxMode>("camera");
  const [sceneId, setSceneId] = useState<string>(defaultScene);
  const controllerRef = useRef<PixelWorldController | null>(null);
  const emoteRef = useRef(emote);
  const heldItemRef = useRef(heldItemId);
  const hostRef = useRef<HTMLDivElement | null>(null);
  emoteRef.current = emote;
  heldItemRef.current = heldItemId;

  const activeScene =
    PIXEL_WORLD_SCENES_BY_ID.get(sceneId) ?? sceneList[0];
  const heldItem = heldItemId
    ? PIXEL_WORLD_OBJECTS_BY_ID.get(heldItemId)
    : null;
  const holdableObjects = PIXEL_WORLD_PACK.objects.filter((object) =>
    object.capabilities.includes("holdable"),
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engineHost = host;

    let cancelled = false;
    let mountedController: PixelWorldController | null = null;
    setEngineError("");
    setEngineReady(false);

    async function mountEngine() {
      try {
        const [{ default: Phaser }, { createPixelWorldEngine }] =
          await Promise.all([
            import("phaser"),
            import("./pixel-world-engine"),
          ]);
        if (cancelled) return;

        mountedController = createPixelWorldEngine(
          engineHost,
          {
            heldItemId: heldItemRef.current,
            initialEmote: emoteRef.current,
            parallaxMode,
            sceneId,
          },
          {
            onError(error) {
              if (cancelled) return;
              setEngineError(error.message);
              setEngineReady(false);
            },
            onReady() {
              if (cancelled) return;
              setEngineReady(true);
            },
          },
          Phaser,
        );
        controllerRef.current = mountedController;
      } catch (caughtError) {
        if (cancelled) return;
        setEngineError(
          caughtError instanceof Error
            ? caughtError.message
            : "The pixel world explorer could not start.",
        );
        setEngineReady(false);
      }
    }

    void mountEngine();

    return () => {
      cancelled = true;
      stopAllDirections(controllerRef.current);
      mountedController?.destroy();
      if (controllerRef.current === mountedController) {
        controllerRef.current = null;
      }
    };
  }, [engineAttempt, parallaxMode, sceneId]);

  useEffect(() => {
    controllerRef.current?.setEmote(emote);
  }, [emote, engineReady]);

  useEffect(() => {
    controllerRef.current?.setHeldItem(heldItemId);
  }, [engineReady, heldItemId]);

  function handleDirectionStart(
    direction: PixelWorldDirection,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    controllerRef.current?.setDirection(direction, true);
  }

  function handleDirectionStop(direction: PixelWorldDirection) {
    controllerRef.current?.setDirection(direction, false);
  }

  function handleRetry() {
    stopAllDirections(controllerRef.current);
    setEngineAttempt((attempt) => attempt + 1);
  }

  return (
    <main className="relative h-dvh w-screen overflow-x-hidden overflow-y-auto bg-lesson-list px-4 pb-12 pt-28 short:pt-20 md:px-8 md:pb-16 md:pt-32">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.38fr)] lg:items-start">
        <section className="grid gap-5 rounded-3xl border-4 border-white bg-white/95 p-5 shadow-card md:border-6 md:p-8">
          <header className="grid gap-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-navy px-3 py-1 text-sm font-black uppercase tracking-wider text-white">
              <Map aria-hidden="true" className="size-4" /> World pipeline
            </span>
            <h1 className="m-0 text-4xl leading-none text-brand-navy sm:text-5xl">
              Pixel World Explorer
            </h1>
            <p className="m-0 font-bold leading-relaxed text-slate-600">
              Review reusable scenes, scenery, and holdable items against the
              same runtime pixel contract.
            </p>
          </header>

          <section
            aria-label="Pipeline summary"
            className="grid gap-3 rounded-3xl bg-sky-50 p-4 md:p-5"
          >
            <p className="m-0 font-bold leading-relaxed text-slate-700">
              Each scene uses one <strong>720×480</strong> world, one Peppa
              sheet, local compiled assets, and a shared <strong>4×4 screen-pixel</strong>
              art cell.
            </p>
            <p className="m-0 text-sm font-bold uppercase tracking-[0.2em] text-sky-900">
              Scene: {activeScene.name} · Hold item: {heldItem?.id ?? "none"}
            </p>
          </section>

          <section
            aria-label="Scene chooser"
            className="grid gap-3 rounded-3xl border-3 border-sky-200 bg-white p-4"
          >
            <h2 className="m-0 flex items-center gap-2 text-xl text-brand-navy">
              <Trees aria-hidden="true" className="size-5" /> Scenes
            </h2>
            <div className="grid gap-2">
              {sceneList.map((scene) => (
                <ActionButton
                  className="justify-start"
                  key={scene.id}
                  onClick={() => {
                    stopAllDirections(controllerRef.current);
                    setSceneId(scene.id);
                  }}
                  type="button"
                  variant={scene.id === sceneId ? "navy" : "surface"}
                >
                  {scene.name}
                </ActionButton>
              ))}
            </div>
          </section>

          <section
            aria-label="Parallax controls"
            className="grid gap-3 rounded-3xl border-3 border-sky-200 bg-white p-4"
          >
            <h2 className="m-0 text-xl text-brand-navy">Parallax review</h2>
            <div className="grid gap-2">
              {PARALLAX_MODES.map(({ description, icon, label, mode }) => (
                <ActionButton
                  aria-describedby={`parallax-${mode}-description`}
                  aria-label={label}
                  className="justify-start gap-2"
                  key={mode}
                  onClick={() => setParallaxMode(mode)}
                  type="button"
                  variant={mode === parallaxMode ? "navy" : "surface"}
                >
                  {icon}
                  <span>{label}</span>
                  <span
                    className="sr-only"
                    id={`parallax-${mode}-description`}
                  >
                    {description}
                  </span>
                </ActionButton>
              ))}
            </div>
            <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
              Use these three modes to compare depth against motion. Reduced
              motion should collapse ambient drift automatically.
            </p>
          </section>

          <section
            aria-label="Holdable item chooser"
            className="grid gap-3 rounded-3xl border-3 border-sky-200 bg-white p-4"
          >
            <h2 className="m-0 flex items-center gap-2 text-xl text-brand-navy">
              <Hand aria-hidden="true" className="size-5" /> Holdable items
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ActionButton
                className="justify-start"
                onClick={() => setHeldItemId(null)}
                type="button"
                variant={heldItemId === null ? "navy" : "surface"}
              >
                Empty hands
              </ActionButton>
              {holdableObjects.map((item) => (
                <ActionButton
                  className="justify-start"
                  key={String(item.id)}
                  onClick={() => setHeldItemId(String(item.id))}
                  type="button"
                  variant={item.id === heldItemId ? "navy" : "surface"}
                >
                  {String(item.id).replaceAll("-", " ")}
                </ActionButton>
              ))}
            </div>
          </section>
        </section>

        <section
          aria-labelledby="pixel-world-preview-title"
          className="grid min-w-0 gap-3 rounded-3xl border-4 border-white bg-white/90 p-3 shadow-card md:border-6 md:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-2xl text-brand-navy" id="pixel-world-preview-title">
                Review stage
              </h2>
              <p className="mb-0 mt-1 font-bold leading-relaxed text-slate-600">
                Move Peppa, switch scenes, and check whether item and scenery
                pixels stay coherent together.
              </p>
            </div>
            {engineError ? (
              <ActionButton onClick={handleRetry} type="button" variant="navy">
                Reload stage
              </ActionButton>
            ) : null}
          </div>

          <div
            aria-label="Pixel world explorer stage"
            className="relative overflow-hidden rounded-[2rem] border-4 border-brand-navy bg-sky-100"
            role="region"
          >
            <div
              aria-label="Pixel world explorer game world"
              className="aspect-[3/2] min-h-80 w-full bg-sky-100 sm:min-h-0"
              data-engine="phaser"
              ref={hostRef}
              role="group"
            />
            {!engineReady && !engineError ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-brand-navy/10">
                <p className="m-0 rounded-full bg-white/95 px-4 py-2 font-black text-brand-navy shadow-control-surface">
                  Loading world…
                </p>
              </div>
            ) : null}
          </div>

          {engineError ? (
            <p className="m-0 rounded-2xl border-3 border-red-300 bg-red-50 p-4 font-bold text-red-800" role="alert">
              {engineError}
            </p>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
            <section
              aria-label="Movement controls"
              className="grid gap-3 rounded-3xl border-3 border-sky-200 bg-white p-4"
            >
              <h3 className="m-0 text-lg text-brand-navy">Move Peppa</h3>
              <div className="grid grid-cols-3 gap-2">
                <DirectionButton
                  direction="up"
                  disabled={!engineReady}
                  icon={<ArrowUp aria-hidden="true" className="size-5" />}
                  onNudge={(direction) => controllerRef.current?.nudge(direction)}
                  onStart={handleDirectionStart}
                  onStop={handleDirectionStop}
                />
                <DirectionButton
                  direction="left"
                  disabled={!engineReady}
                  icon={<ArrowLeft aria-hidden="true" className="size-5" />}
                  onNudge={(direction) => controllerRef.current?.nudge(direction)}
                  onStart={handleDirectionStart}
                  onStop={handleDirectionStop}
                />
                <DirectionButton
                  direction="down"
                  disabled={!engineReady}
                  icon={<ArrowDown aria-hidden="true" className="size-5" />}
                  onNudge={(direction) => controllerRef.current?.nudge(direction)}
                  onStart={handleDirectionStart}
                  onStop={handleDirectionStop}
                />
                <DirectionButton
                  direction="right"
                  disabled={!engineReady}
                  icon={<ArrowRight aria-hidden="true" className="size-5" />}
                  onNudge={(direction) => controllerRef.current?.nudge(direction)}
                  onStart={handleDirectionStart}
                  onStop={handleDirectionStop}
                />
              </div>
            </section>

            <section
              aria-label="Animation review"
              className="grid gap-3 rounded-3xl border-3 border-sky-200 bg-white p-4"
            >
              <h3 className="m-0 text-lg text-brand-navy">Animation review</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EMOTES.map((value) => (
                  <ActionButton
                    key={value}
                    onClick={() => setEmote(value)}
                    type="button"
                    variant={value === emote ? "navy" : "surface"}
                  >
                    {value}
                  </ActionButton>
                ))}
              </div>
              <p className="m-0 text-sm font-bold leading-relaxed text-slate-600">
                Walking uses separate hold anchors, so move Peppa with an item
                selected to inspect placement while the frame changes.
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
