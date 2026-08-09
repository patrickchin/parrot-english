import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  FlipHorizontal2,
  Hand,
  Map,
  Monitor,
  RotateCcw,
  Trees,
  Users,
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
import { ActionButton, fieldClassName } from "../shared/ui";
import type {
  PixelWorldActorState,
  PixelWorldController,
  PixelWorldDirection,
  PixelWorldEmote,
  PixelWorldFacing,
  PixelWorldParallaxMode,
} from "./pixel-world-engine";

const DIRECTIONS: PixelWorldDirection[] = ["up", "left", "down", "right"];
const EMOTES: PixelWorldEmote[] = ["idle", "talking", "happy", "surprised"];
const DEFAULT_ACTORS: PixelWorldActorState[] = [
  {
    characterId: "peppa",
    emote: "idle",
    facing: "right",
    heldItemId: "red-apple",
    slotId: "center",
  },
  {
    characterId: "polly",
    emote: "happy",
    facing: "right",
    heldItemId: null,
    slotId: "center-right",
  },
];
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
      className="size-11 min-h-11 min-w-11 touch-none rounded-xl p-0 text-brand-navy shadow-control-surface"
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

function ToolField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-black uppercase tracking-[0.12em] text-sky-100">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PixelWorldExplorer() {
  const sceneList = PIXEL_WORLD_PACK.scenes;
  const defaultScene = PIXEL_WORLD_PACK.defaultSceneId;
  const [activeCharacterId, setActiveCharacterId] = useState("peppa");
  const [actors, setActors] = useState<PixelWorldActorState[]>(() =>
    DEFAULT_ACTORS.map((actor) => ({ ...actor })),
  );
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [engineError, setEngineError] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [parallaxMode, setParallaxMode] =
    useState<PixelWorldParallaxMode>("camera");
  const [sceneId, setSceneId] = useState<string>(defaultScene);
  const controllerRef = useRef<PixelWorldController | null>(null);
  const activeCharacterIdRef = useRef(activeCharacterId);
  const actorsRef = useRef(actors);
  const hostRef = useRef<HTMLDivElement | null>(null);
  activeCharacterIdRef.current = activeCharacterId;
  actorsRef.current = actors;

  const activeScene =
    PIXEL_WORLD_SCENES_BY_ID.get(sceneId) ?? sceneList[0];
  const activeActor =
    actors.find(({ characterId }) => characterId === activeCharacterId) ??
    actors[0];
  const activeCharacter =
    PIXEL_WORLD_PACK.characters.find(
      ({ id }) => id === activeActor.characterId,
    ) ?? PIXEL_WORLD_PACK.characters[0];
  const heldItem = activeActor.heldItemId
    ? PIXEL_WORLD_OBJECTS_BY_ID.get(activeActor.heldItemId)
    : null;
  const holdableObjects = PIXEL_WORLD_PACK.objects.filter((object) =>
    object.capabilities.includes("holdable"),
  );
  const worldScenes = sceneList.filter(
    ({ source }) => source.kind === "world",
  );
  const lessonScenes = sceneList.filter(
    ({ source }) => source.kind === "lesson",
  );
  const storyScenes = sceneList.filter(
    ({ source }) => source.kind === "story",
  );
  const readyMadeSceneId =
    activeScene.source.kind === "world" ? "" : activeScene.id;
  const activeFacing = activeActor.facing ?? "right";

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
            activeCharacterId: activeCharacterIdRef.current,
            actors: actorsRef.current,
            parallaxMode,
            sceneId,
          },
          {
            onCharacterFacingChange(characterId, facing) {
              if (cancelled) return;
              updateActor(characterId, (actor) =>
                actor.facing === facing ? actor : { ...actor, facing },
              );
            },
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

  function updateActor(
    characterId: string,
    update: (actor: PixelWorldActorState) => PixelWorldActorState,
  ) {
    setActors((currentActors) =>
      currentActors.map((actor) =>
        actor.characterId === characterId ? update(actor) : actor,
      ),
    );
  }

  function chooseCharacter(characterId: string) {
    stopAllDirections(controllerRef.current);
    setActiveCharacterId(characterId);
    controllerRef.current?.setActiveCharacter(characterId);
  }

  function chooseEmote(emote: PixelWorldEmote) {
    updateActor(activeCharacterId, (actor) => ({ ...actor, emote }));
    controllerRef.current?.setCharacterEmote(activeCharacterId, emote);
  }

  function chooseFacing(facing: PixelWorldFacing) {
    updateActor(activeCharacterId, (actor) => ({ ...actor, facing }));
    controllerRef.current?.setCharacterFacing(activeCharacterId, facing);
  }

  function chooseHeldItem(heldItemId: string | null) {
    updateActor(activeCharacterId, (actor) => ({ ...actor, heldItemId }));
    controllerRef.current?.setCharacterHeldItem(
      activeCharacterId,
      heldItemId,
    );
  }

  function choosePlacement(slotId: string) {
    updateActor(activeCharacterId, (actor) => ({ ...actor, slotId }));
    controllerRef.current?.setCharacterPosition(activeCharacterId, slotId);
  }

  function chooseComposition(scene: (typeof sceneList)[number]) {
    stopAllDirections(controllerRef.current);
    const nextActors: PixelWorldActorState[] = scene.cast.map((actor) => ({
      ...actor,
      emote: actor.emote as PixelWorldEmote,
      facing:
        actors.find(({ characterId }) => characterId === actor.characterId)
          ?.facing ?? "right",
    }));
    setActors(nextActors);
    for (const actor of nextActors) {
      controllerRef.current?.setCharacterEmote(actor.characterId, actor.emote);
      controllerRef.current?.setCharacterFacing(
        actor.characterId,
        actor.facing ?? "right",
      );
      controllerRef.current?.setCharacterHeldItem(
        actor.characterId,
        actor.heldItemId,
      );
      controllerRef.current?.setCharacterPosition(
        actor.characterId,
        actor.slotId,
      );
    }
    setSceneId(scene.id);
  }

  function resetComposition() {
    stopAllDirections(controllerRef.current);
    const nextActors = DEFAULT_ACTORS.map((actor) => ({ ...actor }));
    setActiveCharacterId("peppa");
    setActors(nextActors);
    setParallaxMode("camera");
    setSceneId(defaultScene);
    controllerRef.current?.setActiveCharacter("peppa");
    for (const actor of nextActors) {
      controllerRef.current?.setCharacterEmote(actor.characterId, actor.emote);
      controllerRef.current?.setCharacterFacing(
        actor.characterId,
        actor.facing ?? "right",
      );
      controllerRef.current?.setCharacterHeldItem(
        actor.characterId,
        actor.heldItemId,
      );
      controllerRef.current?.setCharacterPosition(
        actor.characterId,
        actor.slotId,
      );
    }
  }

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
    <main className="relative flex h-dvh w-screen flex-col gap-2 overflow-hidden bg-slate-950 px-2 pb-2 pt-20 short:pt-16 md:px-3 md:pb-3 md:pt-24">
      <RouteHeader>
        <HeaderLink aria-label="Back to home" icon={<ArrowLeft />} to="/">
          Back to home
        </HeaderLink>
      </RouteHeader>

      <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 px-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden items-center gap-1 rounded-lg bg-sky-900 px-2 py-1 text-xs font-black uppercase tracking-wider text-sky-100 sm:inline-flex">
            <Map aria-hidden="true" className="size-4" /> World pipeline
          </span>
          <h1 className="m-0 truncate text-xl leading-none sm:text-2xl">
            Pixel World Explorer
          </h1>
        </div>
        <p className="m-0 hidden min-w-0 truncate text-sm font-bold text-slate-300 md:block">
          {activeScene.name} · {activeCharacter.name} ·{" "}
          {heldItem?.id ?? "empty hands"}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(9rem,1.2fr)_minmax(0,1fr)_auto] gap-2 lg:grid-cols-[14rem_minmax(0,1fr)_16rem] lg:grid-rows-[minmax(0,1fr)_auto]">
        <section
          aria-label="World controls"
          className="col-start-1 row-start-2 grid min-h-0 min-w-0 content-start gap-3 overflow-y-auto rounded-xl border-2 border-slate-700 bg-slate-900 p-2.5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:p-3"
          role="region"
        >
          <h2 className="m-0 flex items-center gap-2 text-base text-white">
            <Trees aria-hidden="true" className="size-5 text-sky-300" /> World
          </h2>

          <ToolField label="World scene">
            <select
              className={fieldClassName({
                className:
                  "min-w-0 rounded-xl border-2 px-2 py-1 text-sm shadow-none",
              })}
              onChange={(event) => {
                stopAllDirections(controllerRef.current);
                setSceneId(event.target.value);
              }}
              value={worldScenes.some(({ id }) => id === sceneId) ? sceneId : ""}
            >
              <option disabled value="">
                Custom composition
              </option>
              {worldScenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </ToolField>

          <ToolField label="Ready-made scene">
            <select
              className={fieldClassName({
                className:
                  "min-w-0 rounded-xl border-2 px-2 py-1 text-sm shadow-none",
              })}
              onChange={(event) => {
                const scene = PIXEL_WORLD_SCENES_BY_ID.get(event.target.value);
                if (scene) chooseComposition(scene);
              }}
              value={readyMadeSceneId}
            >
              <option value="">Choose a composition</option>
              <optgroup label="Lessons">
                {lessonScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Stories">
                {storyScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </ToolField>

          <section aria-label="Parallax controls" className="grid gap-2">
            <h3 className="m-0 text-xs font-black uppercase tracking-[0.12em] text-sky-100">
              Depth motion
            </h3>
            {PARALLAX_MODES.map(({ description, icon, label, mode }) => (
              <ActionButton
                aria-describedby={`parallax-${mode}-description`}
                aria-label={label}
                aria-pressed={mode === parallaxMode}
                className="min-w-0 justify-start gap-2 rounded-xl px-2"
                fullWidth
                key={mode}
                onClick={() => setParallaxMode(mode)}
                size="compact"
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
          </section>
        </section>

        <section
          aria-label="Pixel world explorer stage"
          className="relative col-span-2 col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden rounded-xl border-2 border-slate-600 bg-slate-950 shadow-2xl lg:col-span-1 lg:col-start-2 lg:row-start-1"
          role="region"
        >
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-slate-950/80 px-2 py-1 text-xs font-black uppercase tracking-wider text-white backdrop-blur-sm">
            <Monitor aria-hidden="true" className="size-4 text-sky-300" />
            <span className="truncate">{activeScene.name}</span>
          </div>
          <div
            aria-label="Pixel world explorer game world"
            className="h-full min-h-0 w-full bg-sky-100"
            data-engine="phaser"
            ref={hostRef}
            role="group"
          />
          {!engineReady && !engineError ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/20">
              <p className="m-0 rounded-lg bg-white/95 px-4 py-2 font-black text-brand-navy shadow-control-surface">
                Loading world…
              </p>
            </div>
          ) : null}
          {engineError ? (
            <div className="absolute inset-0 grid place-items-center bg-slate-950/80 p-4">
              <div className="grid max-w-md gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center">
                <p className="m-0 font-bold text-red-800" role="alert">
                  {engineError}
                </p>
                <ActionButton
                  onClick={handleRetry}
                  type="button"
                  variant="navy"
                >
                  Reload stage
                </ActionButton>
              </div>
            </div>
          ) : null}
        </section>

        <section
          aria-label="Character controls"
          className="col-start-2 row-start-2 grid min-h-0 min-w-0 content-start gap-3 overflow-y-auto rounded-xl border-2 border-slate-700 bg-slate-900 p-2.5 lg:col-start-3 lg:row-start-1 lg:p-3"
          role="region"
        >
          <header className="flex items-center justify-between gap-2">
            <h2 className="m-0 flex min-w-0 items-center gap-2 text-base text-white">
              <Users aria-hidden="true" className="size-5 text-amber-300" />
              Character
            </h2>
            <span className="hidden truncate text-xs font-black uppercase tracking-wider text-slate-300 min-[360px]:inline">
              {activeCharacter.name}
            </span>
          </header>

          <div
            aria-label="Character chooser"
            className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"
            role="group"
          >
            {PIXEL_WORLD_PACK.characters.map((character) => (
              <ActionButton
                aria-pressed={character.id === activeCharacterId}
                className="min-w-0 rounded-xl"
                fullWidth
                key={character.id}
                onClick={() => chooseCharacter(character.id)}
                size="compact"
                type="button"
                variant={
                  character.id === activeCharacterId ? "navy" : "surface"
                }
              >
                {character.name}
              </ActionButton>
            ))}
          </div>

          <ToolField label="Placement">
            <select
              className={fieldClassName({
                className:
                  "min-w-0 rounded-xl border-2 px-2 py-1 text-sm shadow-none",
              })}
              onChange={(event) => choosePlacement(event.target.value)}
              value={activeActor.slotId}
            >
              {PIXEL_WORLD_PACK.placementSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
          </ToolField>

          <ToolField label="Expression">
            <select
              className={fieldClassName({
                className:
                  "min-w-0 rounded-xl border-2 px-2 py-1 text-sm capitalize shadow-none",
              })}
              onChange={(event) =>
                chooseEmote(event.target.value as PixelWorldEmote)
              }
              value={activeActor.emote}
            >
              {EMOTES.map((emote) => (
                <option className="capitalize" key={emote} value={emote}>
                  {emote}
                </option>
              ))}
            </select>
          </ToolField>

          <section aria-label="Holdable item chooser">
            <ToolField label="Held item">
              <select
                className={fieldClassName({
                  className:
                    "min-w-0 rounded-xl border-2 px-2 py-1 text-sm shadow-none",
                })}
                onChange={(event) =>
                  chooseHeldItem(event.target.value || null)
                }
                value={activeActor.heldItemId ?? ""}
              >
                <option value="">Empty hands</option>
                {holdableObjects.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.id).replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </ToolField>
          </section>

          <ActionButton
            className="sticky bottom-0 mt-auto min-w-0 gap-2 rounded-xl"
            fullWidth
            onClick={resetComposition}
            size="compact"
            type="button"
            variant="navy"
          >
            <RotateCcw aria-hidden="true" className="size-4" /> Reset composition
          </ActionButton>
        </section>

        <section
          aria-label="Movement and facing controls"
          className="col-span-2 col-start-1 row-start-3 flex min-w-0 flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 p-2 lg:col-start-2 lg:row-start-2 lg:justify-between"
          role="region"
        >
          <h2 className="m-0 hidden items-center gap-2 text-sm text-white lg:flex">
            <FlipHorizontal2
              aria-hidden="true"
              className="size-5 text-sky-300"
            />
            Transform {activeCharacter.name}
          </h2>

          <div
            aria-label="Movement controls"
            className="flex items-center gap-1.5"
            role="group"
          >
            <span className="mr-1 text-xs font-black uppercase tracking-wider text-slate-300">
              Move
            </span>
            <DirectionButton
              direction="left"
              disabled={!engineReady}
              icon={<ArrowLeft aria-hidden="true" className="size-5" />}
              onNudge={(direction) => controllerRef.current?.nudge(direction)}
              onStart={handleDirectionStart}
              onStop={handleDirectionStop}
            />
            <DirectionButton
              direction="up"
              disabled={!engineReady}
              icon={<ArrowUp aria-hidden="true" className="size-5" />}
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

          <div
            aria-label="Facing controls"
            className="flex items-center gap-1.5"
            role="group"
          >
            <span className="mr-1 text-xs font-black uppercase tracking-wider text-slate-300">
              Face
            </span>
            {(["left", "right"] as PixelWorldFacing[]).map((facing) => (
              <ActionButton
                aria-label={`Face ${activeCharacter.name} ${facing}`}
                aria-pressed={activeFacing === facing}
                className="size-11 min-h-11 min-w-11 rounded-xl p-0"
                disabled={!engineReady}
                key={facing}
                onClick={() => chooseFacing(facing)}
                size="inline"
                title={`Face ${facing}`}
                type="button"
                variant={activeFacing === facing ? "navy" : "surface"}
              >
                {facing === "left" ? (
                  <ArrowLeft aria-hidden="true" className="size-5" />
                ) : (
                  <ArrowRight aria-hidden="true" className="size-5" />
                )}
              </ActionButton>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
