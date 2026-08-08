import type PhaserType from "phaser";
import {
  PIXEL_WORLD_OBJECTS_BY_ID,
  PIXEL_WORLD_PACK,
  PIXEL_WORLD_SCENES_BY_ID,
} from "../../prototypes/pixel-stage/world-pack.js";
import {
  flattenSceneLayers,
  getLayerScrollFactor,
  resolveCameraZoom,
  resolveHeldItemTransform,
  resolvePlacementSlot,
} from "../../prototypes/pixel-stage/world-runtime.js";

export type PixelWorldDirection = "down" | "left" | "right" | "up";
export type PixelWorldEmote = "happy" | "idle" | "surprised" | "talking";
export type PixelWorldParallaxMode = "ambient" | "camera" | "off";

export interface PixelWorldActorState {
  characterId: string;
  emote: PixelWorldEmote;
  heldItemId: string | null;
  slotId: string;
}

export interface PixelWorldEngineOptions {
  activeCharacterId: string;
  actors: readonly PixelWorldActorState[];
  parallaxMode: PixelWorldParallaxMode;
  sceneId: string;
}

export interface PixelWorldEngineCallbacks {
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export interface PixelWorldController {
  destroy: () => void;
  nudge: (direction: PixelWorldDirection) => void;
  setActiveCharacter: (characterId: string) => void;
  setCharacterEmote: (characterId: string, emote: PixelWorldEmote) => void;
  setCharacterHeldItem: (characterId: string, itemId: string | null) => void;
  setCharacterPosition: (characterId: string, slotId: string) => void;
  setDirection: (direction: PixelWorldDirection, active: boolean) => void;
  /** Updates the currently active character. */
  setEmote: (emote: PixelWorldEmote) => void;
  /** Updates the currently active character. */
  setHeldItem: (itemId: string | null) => void;
}

type PhaserRuntime = typeof PhaserType;
type HoldMetadata = {
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
};
type CharacterConfig = (typeof PIXEL_WORLD_PACK.characters)[number];
type CharacterState = PixelWorldActorState;
type WorldObject = {
  assetId: string;
  capabilities: readonly string[];
  collision: {
    height: number;
    offsetX: number;
    offsetY: number;
    width: number;
  } | null;
  footOffsetY: number;
  hold?: HoldMetadata;
  id: string;
  origin: { x: number; y: number };
};
type SceneConfig = (typeof PIXEL_WORLD_PACK.scenes)[number];
type ActorRuntime = {
  character: CharacterConfig;
  handOverlay: PhaserType.GameObjects.Sprite | null;
  heldItem: PhaserType.GameObjects.Image | null;
  heldItemDefinition: (WorldObject & { hold: HoldMetadata }) | null;
  holdPresentation: "back" | "front-covered" | "none";
  sprite: PhaserType.Physics.Arcade.Sprite;
  state: CharacterState;
};

const CAMERA_FOLLOW_OFFSET_Y =
  PIXEL_WORLD_PACK.renderProfile.cameraFollowOffsetY;
const ART_CELL_SIZE = PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels;
const TEXTURE_SCALE = PIXEL_WORLD_PACK.renderProfile.textureToWorldScale;
const WORLD_SIZE = PIXEL_WORLD_PACK.renderProfile.worldSize;
const PLAYFIELD = PIXEL_WORLD_PACK.renderProfile.playfield;
const PLAYER_SPEED = 144;
const NUDGE_DURATION_MS = 140;
const SCENE_KEY = "react-pixel-world-stage";
const MOVEMENT_KEY_DIRECTIONS = new Map<string, PixelWorldDirection>([
  ["arrowdown", "down"],
  ["arrowleft", "left"],
  ["arrowright", "right"],
  ["arrowup", "up"],
  ["a", "left"],
  ["d", "right"],
  ["s", "down"],
  ["w", "up"],
]);
const ANIMATIONS = Object.freeze([
  { end: 0, frameRate: 1, key: "idle", repeat: -1, start: 0 },
  { end: 3, frameRate: 9, key: "walking", repeat: -1, start: 0 },
  { end: 7, frameRate: 7, key: "talking", repeat: -1, start: 4 },
  { end: 11, frameRate: 6, key: "happy", repeat: -1, start: 8 },
  { end: 15, frameRate: 4, key: "surprised", repeat: -1, start: 12 },
]);
const POSE_START = Object.freeze({
  happy: 8,
  idle: 0,
  surprised: 12,
  talking: 4,
  walking: 0,
});

function animationKey(characterId: string, pose: PixelWorldEmote | "walking") {
  return `${SCENE_KEY}:${characterId}:${pose}`;
}

function toError(value: unknown, fallback: string) {
  return value instanceof Error ? value : new Error(fallback);
}

function getDepthForFootY(footY: number) {
  return 1_000 + Math.round(footY);
}

function getViewport(host: HTMLElement) {
  const bounds = host.getBoundingClientRect();
  return {
    height: Math.max(1, Math.round(Math.max(host.clientHeight, bounds.height))),
    width: Math.max(1, Math.round(Math.max(host.clientWidth, bounds.width))),
  };
}

function isHoldable(
  object: WorldObject | undefined,
): object is WorldObject & { hold: HoldMetadata } {
  return Boolean(object?.capabilities.includes("holdable") && object.hold);
}

export function createPixelWorldEngine(
  host: HTMLElement,
  options: PixelWorldEngineOptions,
  callbacks: PixelWorldEngineCallbacks,
  Phaser: PhaserRuntime,
): PixelWorldController {
  const selectedScene = PIXEL_WORLD_SCENES_BY_ID.get(options.sceneId) as
    | SceneConfig
    | undefined;
  if (!selectedScene) throw new Error(`Unknown pixel world scene: ${options.sceneId}`);
  const sceneConfig: SceneConfig = selectedScene;

  const actorStates = new Map<string, CharacterState>();
  for (const character of PIXEL_WORLD_PACK.characters) {
    const configuredActor = options.actors.find(
      (actor) => actor.characterId === character.id,
    );
    const sceneActor = sceneConfig.cast.find(
      (actor) => actor.characterId === character.id,
    );
    const actor = configuredActor ?? sceneActor;
    if (!actor) throw new Error(`Missing pixel world actor: ${character.id}`);
    resolvePlacementSlot(actor.slotId);
    actorStates.set(character.id, {
      characterId: character.id,
      emote: actor.emote as PixelWorldEmote,
      heldItemId: actor.heldItemId,
      slotId: actor.slotId,
    });
  }
  let activeCharacterId = actorStates.has(options.activeCharacterId)
    ? options.activeCharacterId
    : PIXEL_WORLD_PACK.characters[0].id;
  let destroyed = false;
  let viewport = getViewport(host);
  let sceneBridge: {
    nudge: (direction: PixelWorldDirection) => void;
    placeActor: (characterId: string) => void;
    refreshActorHold: (characterId: string) => void;
    selectActor: (characterId: string) => void;
    sync: () => void;
  } | null = null;
  const heldDirections = new Set<PixelWorldDirection>();
  const keyboardDirections = new Set<PixelWorldDirection>();
  const reducedMotion =
    host.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)") ?? null;

  const reportError = (value: unknown, fallback: string) => {
    if (!destroyed) callbacks.onError?.(toError(value, fallback));
  };

  class PixelWorldScene extends Phaser.Scene {
    private readonly actors = new Map<string, ActorRuntime>();
    private cloudLayers: PhaserType.GameObjects.Image[] = [];
    private readonly nudgedDirections = new Set<PixelWorldDirection>();
    private readonly nudgeTimers = new Map<PixelWorldDirection, PhaserType.Time.TimerEvent>();
    private ready = false;

    constructor() {
      super(SCENE_KEY);
    }

    preload() {
      for (const [assetId, asset] of Object.entries(PIXEL_WORLD_PACK.assets)) {
        if (asset.kind === "spritesheet") {
          this.load.spritesheet(assetId, asset.src, {
            frameHeight: asset.frameHeight,
            frameWidth: asset.frameWidth,
          });
        } else {
          this.load.image(assetId, asset.src);
        }
      }
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
        reportError(new Error("The pixel world art could not load."), "The pixel world art could not load.");
      });
    }

    create() {
      try {
        sceneBridge = {
          nudge: (direction) => this.nudge(direction),
          placeActor: (characterId) => this.placeActor(characterId),
          refreshActorHold: (characterId) => this.refreshActorHold(characterId),
          selectActor: (characterId) => this.selectActor(characterId),
          sync: () => this.syncStatus(),
        };
        this.createLayers();
        const blockers = this.createWorldObjects();
        this.physics.world.setBounds(
          PLAYFIELD.left,
          PLAYFIELD.top,
          PLAYFIELD.right - PLAYFIELD.left,
          PLAYFIELD.bottom - PLAYFIELD.top,
        );
        this.createAnimations();
        for (const character of PIXEL_WORLD_PACK.characters) {
          const state = actorStates.get(character.id);
          if (!state) throw new Error(`Missing pixel world actor state: ${character.id}`);
          const position = resolvePlacementSlot(state.slotId);
          const sprite = this.physics.add.sprite(
            position.x,
            position.y,
            character.spriteSheet.assetId,
            POSE_START[state.emote],
          );
          sprite
            .setCollideWorldBounds(true)
            .setDepth(getDepthForFootY(position.y))
            .setOrigin(0.5, 1)
            .setScale(TEXTURE_SCALE);
          const body = sprite.body as PhaserType.Physics.Arcade.Body;
          body.updateBounds();
          body.setSize(character.body.width, character.body.height, false);
          body.setOffset(character.body.offsetX, character.body.offsetY);
          this.physics.add.collider(sprite, blockers);
          this.actors.set(character.id, {
            character,
            handOverlay: null,
            heldItem: null,
            heldItemDefinition: null,
            holdPresentation: "none",
            sprite,
            state,
          });
        }
        this.configureCamera();
        this.configureCanvas();
        for (const actor of this.actors.values()) {
          this.refreshActorHold(actor.character.id);
          this.playAnimation(actor, actor.state.emote);
        }
        this.ready = true;
        this.syncStatus();
        callbacks.onReady?.();
      } catch (error) {
        reportError(error, "The pixel world explorer could not start.");
      }
    }

    update() {
      if (!this.ready) return;
      const left =
        keyboardDirections.has("left") ||
        heldDirections.has("left") || this.nudgedDirections.has("left");
      const right =
        keyboardDirections.has("right") ||
        heldDirections.has("right") || this.nudgedDirections.has("right");
      const up =
        keyboardDirections.has("up") ||
        heldDirections.has("up") || this.nudgedDirections.has("up");
      const down =
        keyboardDirections.has("down") ||
        heldDirections.has("down") || this.nudgedDirections.has("down");
      const velocity = new Phaser.Math.Vector2(
        Number(right) - Number(left),
        Number(down) - Number(up),
      );

      const activeActor = this.getActiveActor();
      for (const actor of this.actors.values()) actor.sprite.setVelocity(0, 0);
      if (velocity.lengthSq() > 0) {
        velocity.normalize().scale(PLAYER_SPEED);
        activeActor.sprite.setVelocity(velocity.x, velocity.y);
        if (velocity.x !== 0) activeActor.sprite.setFlipX(velocity.x < 0);
        this.playAnimation(activeActor, "walking");
      } else {
        this.playAnimation(activeActor, activeActor.state.emote);
      }
      for (const actor of this.actors.values()) {
        if (actor !== activeActor) this.playAnimation(actor, actor.state.emote);
        actor.sprite.setDepth(getDepthForFootY(actor.sprite.y));
        this.updateActorHold(
          actor,
          actor === activeActor && velocity.lengthSq() > 0
            ? "walking"
            : actor.state.emote,
        );
      }
      this.updateAmbientParallax();
      this.syncStatus();
    }

    nudge(direction: PixelWorldDirection) {
      if (!this.ready) return;
      this.nudgeTimers.get(direction)?.remove(false);
      this.nudgedDirections.add(direction);
      const timer = this.time.delayedCall(NUDGE_DURATION_MS, () => {
        this.nudgedDirections.delete(direction);
        this.nudgeTimers.delete(direction);
      });
      this.nudgeTimers.set(direction, timer);
    }

    refreshActorHold(characterId: string) {
      const actor = this.getActor(characterId);
      actor.heldItem?.destroy();
      actor.handOverlay?.destroy();
      actor.heldItem = null;
      actor.handOverlay = null;
      actor.heldItemDefinition = null;
      actor.holdPresentation = "none";
      if (!actor.state.heldItemId) {
        this.syncStatus();
        return;
      }
      const definition = PIXEL_WORLD_OBJECTS_BY_ID.get(actor.state.heldItemId) as
        | WorldObject
        | undefined;
      if (!isHoldable(definition)) {
        actor.state.heldItemId = null;
        this.syncStatus();
        return;
      }
      actor.heldItemDefinition = definition;
      actor.heldItem = this.add.image(
        actor.sprite.x,
        actor.sprite.y,
        definition.assetId,
      );
      const overlay = actor.character.overlays.mainHandFront;
      actor.handOverlay = this.add
        .sprite(actor.sprite.x, actor.sprite.y, overlay.assetId, 0)
        .setOrigin(0.5, 1)
        .setScale(TEXTURE_SCALE)
        .setVisible(false);
      this.updateActorHold(actor, actor.state.emote);
      this.syncStatus();
    }

    placeActor(characterId: string) {
      const actor = this.getActor(characterId);
      const position = resolvePlacementSlot(actor.state.slotId);
      actor.sprite.setPosition(position.x, position.y).setVelocity(0, 0);
      actor.sprite.setDepth(getDepthForFootY(actor.sprite.y));
      this.updateActorHold(actor, actor.state.emote);
      this.syncStatus();
    }

    selectActor(characterId: string) {
      const actor = this.getActor(characterId);
      heldDirections.clear();
      keyboardDirections.clear();
      this.nudgedDirections.clear();
      for (const candidate of this.actors.values()) candidate.sprite.setVelocity(0, 0);
      this.startCameraFollow(actor.sprite);
      this.syncStatus();
    }

    private createLayers() {
      for (const layer of flattenSceneLayers(sceneConfig)) {
        const visual = this.add
          .image(layer.x, layer.y, layer.assetId)
          .setDepth(layer.depth)
          .setOrigin(0, 0)
          .setScale(TEXTURE_SCALE);
        const scroll = getLayerScrollFactor(
          layer,
          options.parallaxMode,
          Boolean(reducedMotion?.matches),
        );
        visual.setScrollFactor(scroll.x, scroll.y);
        if (layer.assetId.startsWith("clouds-")) this.cloudLayers.push(visual);
      }
    }

    private createWorldObjects() {
      const blockers = this.physics.add.staticGroup();
      for (const placement of sceneConfig.placements) {
        const definition = PIXEL_WORLD_OBJECTS_BY_ID.get(placement.objectId) as
          | WorldObject
          | undefined;
        if (!definition) throw new Error(`Unknown world object: ${placement.objectId}`);
        this.add
          .image(placement.x, placement.y, definition.assetId)
          .setDepth(getDepthForFootY(placement.y + definition.footOffsetY))
          .setName(placement.id)
          .setOrigin(definition.origin.x, definition.origin.y)
          .setScale(TEXTURE_SCALE);
        if (!definition.collision) continue;
        const collision = definition.collision;
        const body = this.add.rectangle(
          placement.x + collision.offsetX + collision.width / 2,
          placement.y + collision.offsetY + collision.height / 2,
          collision.width,
          collision.height,
          0x000000,
          0,
        );
        blockers.add(body);
      }
      return blockers;
    }

    private createAnimations() {
      for (const character of PIXEL_WORLD_PACK.characters) {
        for (const animation of ANIMATIONS) {
          const key = animationKey(character.id, animation.key as PixelWorldEmote | "walking");
          if (this.anims.exists(key)) continue;
          this.anims.create({
            frameRate: animation.frameRate,
            frames: this.anims.generateFrameNumbers(
              character.spriteSheet.assetId,
              { end: animation.end, start: animation.start },
            ),
            key,
            repeat: animation.repeat,
          });
        }
      }
    }

    private configureCamera() {
      const camera = this.cameras.main;
      camera.setBackgroundColor(0x82c9ed);
      this.fitCameraBoundsToViewport();
      this.startCameraFollow(this.getActiveActor().sprite);
      camera.roundPixels = true;
      this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameraBoundsToViewport, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCameraBoundsToViewport, this);
      });
    }

    private startCameraFollow(sprite: PhaserType.Physics.Arcade.Sprite) {
      this.cameras.main.startFollow(
        sprite,
        true,
        reducedMotion?.matches ? 1 : 0.35,
        reducedMotion?.matches ? 1 : 0.35,
        0,
        CAMERA_FOLLOW_OFFSET_Y,
      );
    }

    private fitCameraBoundsToViewport() {
      const camera = this.cameras.main;
      const cameraZoom = resolveCameraZoom({
        height: camera.height,
        width: camera.width,
      });
      camera.setZoom(cameraZoom);
      camera.setDeadzone(120 / cameraZoom, 84 / cameraZoom);
      const visibleWidth = camera.width / cameraZoom;
      const visibleHeight = camera.height / cameraZoom;
      const horizontalMargin = Math.max(0, Math.ceil((visibleWidth - WORLD_SIZE.width) / 2));
      const verticalMargin = Math.max(0, Math.ceil((visibleHeight - WORLD_SIZE.height) / 2));
      camera.setBounds(
        -horizontalMargin,
        -verticalMargin,
        WORLD_SIZE.width + horizontalMargin * 2,
        WORLD_SIZE.height + verticalMargin * 2,
      );
    }

    private configureCanvas() {
      const canvas = this.game.canvas;
      const clearMovement = () => {
        heldDirections.clear();
        keyboardDirections.clear();
        this.nudgedDirections.clear();
      };
      const focusCanvas = () => canvas.focus({ preventScroll: true });
      const setKeyboardDirection = (event: KeyboardEvent, active: boolean) => {
        const direction = MOVEMENT_KEY_DIRECTIONS.get(event.key.toLowerCase());
        if (!direction) return;
        event.preventDefault();
        if (active) keyboardDirections.add(direction);
        else keyboardDirections.delete(direction);
      };
      const startKeyboardDirection = (event: KeyboardEvent) =>
        setKeyboardDirection(event, true);
      const stopKeyboardDirection = (event: KeyboardEvent) =>
        setKeyboardDirection(event, false);
      canvas.setAttribute(
        "aria-label",
        "Interactive pixel world explorer. Use the arrow keys or W, A, S, and D to move.",
      );
      canvas.setAttribute("role", "application");
      canvas.tabIndex = 0;
      canvas.style.display = "block";
      canvas.style.imageRendering = "pixelated";
      canvas.style.maxHeight = "100%";
      canvas.style.maxWidth = "100%";
      canvas.addEventListener("pointerdown", focusCanvas);
      canvas.addEventListener("blur", clearMovement);
      canvas.addEventListener("keydown", startKeyboardDirection);
      canvas.addEventListener("keyup", stopKeyboardDirection);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        canvas.removeEventListener("pointerdown", focusCanvas);
        canvas.removeEventListener("blur", clearMovement);
        canvas.removeEventListener("keydown", startKeyboardDirection);
        canvas.removeEventListener("keyup", stopKeyboardDirection);
      });
    }

    private playAnimation(
      actor: ActorRuntime,
      key: PixelWorldEmote | "walking",
    ) {
      if (reducedMotion?.matches) {
        actor.sprite.anims.stop();
        actor.sprite.setFrame(POSE_START[key]);
      } else {
        actor.sprite.anims.play(animationKey(actor.character.id, key), true);
      }
    }

    private updateAmbientParallax() {
      if (options.parallaxMode !== "ambient" || reducedMotion?.matches) return;
      const offset = Math.round(Math.sin(this.time.now / 1_600) * 3) * ART_CELL_SIZE;
      for (const cloud of this.cloudLayers) cloud.x = offset;
    }

    private updateActorHold(
      actor: ActorRuntime,
      pose: PixelWorldEmote | "walking",
    ) {
      if (!actor.heldItem || !actor.heldItemDefinition?.hold) {
        actor.handOverlay?.setVisible(false);
        actor.holdPresentation = "none";
        return;
      }
      const anchors = actor.character.sockets.mainHand.byPose[pose];
      const bodyFrameIndex = this.getActorFrameIndex(actor);
      const frameIndex = Math.max(0, bodyFrameIndex - POSE_START[pose]);
      const transform = resolveHeldItemTransform({
        anchors,
        flipX: actor.sprite.flipX,
        frameIndex,
        itemHold: actor.heldItemDefinition.hold,
      });
      const isFrontCovered =
        transform.depth === "front" &&
        transform.overlayRole === "mainHandFront" &&
        Boolean(actor.handOverlay);
      actor.heldItem
        .setDepth(
          transform.depth === "front"
            ? actor.sprite.depth + 0.1
            : actor.sprite.depth - 0.1,
        )
        .setFlipX(transform.flipX)
        .setOrigin(transform.originX, transform.originY)
        .setPosition(actor.sprite.x + transform.x, actor.sprite.y + transform.y)
        .setRotation(0)
        .setScale(TEXTURE_SCALE);
      actor.handOverlay
        ?.setDepth(actor.sprite.depth + 0.2)
        .setFlipX(actor.sprite.flipX)
        .setFrame(bodyFrameIndex)
        .setPosition(actor.sprite.x, actor.sprite.y)
        .setVisible(isFrontCovered);
      actor.holdPresentation = isFrontCovered
        ? "front-covered"
        : transform.depth === "back"
          ? "back"
          : "none";
    }

    private syncStatus() {
      if (this.actors.size === 0) return;
      const activeActor = this.getActiveActor();
      host.dataset.artCellScreenPixels = String(
        ART_CELL_SIZE * this.cameras.main.zoom,
      );
      host.dataset.activeCharacter = activeCharacterId;
      host.dataset.cameraFollowOffsetY = String(
        this.cameras.main.followOffset.y,
      );
      host.dataset.cameraZoom = String(this.cameras.main.zoom);
      host.dataset.characterCount = String(this.actors.size);
      host.dataset.frame = String(this.getActorFrameIndex(activeActor));
      host.dataset.heldItem = activeActor.state.heldItemId ?? "none";
      host.dataset.parallaxMode = reducedMotion?.matches ? "off" : options.parallaxMode;
      host.dataset.ready = String(this.ready);
      host.dataset.reducedMotion = String(Boolean(reducedMotion?.matches));
      host.dataset.sceneId = sceneConfig.id;
      host.dataset.sceneSource = `${sceneConfig.source.kind}:${sceneConfig.source.id}`;
      host.dataset.textureScale = String(TEXTURE_SCALE);
      host.dataset.viewportHeight = String(viewport.height);
      host.dataset.viewportWidth = String(viewport.width);
      host.dataset.x = String(Math.round(activeActor.sprite.x));
      host.dataset.y = String(Math.round(activeActor.sprite.y));
      for (const actor of this.actors.values()) {
        host.dataset[`${actor.character.id}HeldItem`] =
          actor.state.heldItemId ?? "none";
        host.dataset[`${actor.character.id}HoldPresentation`] =
          actor.holdPresentation;
        host.dataset[`${actor.character.id}Slot`] = actor.state.slotId;
      }
    }

    private getActor(characterId: string) {
      const actor = this.actors.get(characterId);
      if (!actor) throw new Error(`Unknown pixel world character: ${characterId}`);
      return actor;
    }

    private getActiveActor() {
      return this.getActor(activeCharacterId);
    }

    private getActorFrameIndex(actor: ActorRuntime) {
      const frameName = actor.sprite.frame?.name;
      return typeof frameName === "number"
        ? frameName
        : Number.parseInt(String(frameName ?? 0), 10) || 0;
    }
  }

  let game: PhaserType.Game;
  try {
    game = new Phaser.Game({
      antialias: false,
      height: viewport.height,
      parent: host,
      physics: {
        arcade: { debug: false, gravity: { x: 0, y: 0 } },
        default: "arcade",
      },
      pixelArt: true,
      scale: {
        autoCenter: Phaser.Scale.CENTER_BOTH,
        autoRound: true,
        mode: Phaser.Scale.NONE,
        zoom: 1,
      },
      scene: PixelWorldScene,
      transparent: true,
      type: Phaser.CANVAS,
      width: viewport.width,
    });
  } catch (error) {
    destroyed = true;
    throw toError(error, "The pixel world explorer could not start.");
  }

  const resizeGame = () => {
    if (destroyed) return;
    const nextViewport = getViewport(host);
    if (nextViewport.width === viewport.width && nextViewport.height === viewport.height) return;
    viewport = nextViewport;
    game.scale.resize(viewport.width, viewport.height);
  };
  const view = host.ownerDocument.defaultView;
  let resizeFrame: number | null = null;
  const scheduleResize = () => {
    if (destroyed) return;
    if (!view) return resizeGame();
    if (resizeFrame !== null) view.cancelAnimationFrame(resizeFrame);
    resizeFrame = view.requestAnimationFrame(() => {
      resizeFrame = null;
      resizeGame();
    });
  };
  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(host);
  const activeState = actorStates.get(activeCharacterId);
  host.dataset.ready = "false";
  host.dataset.sceneId = sceneConfig.id;
  host.dataset.sceneSource = `${sceneConfig.source.kind}:${sceneConfig.source.id}`;
  host.dataset.parallaxMode = options.parallaxMode;
  host.dataset.characterCount = String(actorStates.size);
  host.dataset.activeCharacter = activeCharacterId;
  host.dataset.heldItem = activeState?.heldItemId ?? "none";
  for (const actor of actorStates.values()) {
    host.dataset[`${actor.characterId}HeldItem`] = actor.heldItemId ?? "none";
    host.dataset[`${actor.characterId}HoldPresentation`] = "none";
    host.dataset[`${actor.characterId}Slot`] = actor.slotId;
  }

  const requireActorState = (characterId: string) => {
    const state = actorStates.get(characterId);
    if (!state) {
      throw new Error(`Unknown pixel world character: ${characterId}`);
    }
    return state;
  };
  const selectCharacter = (characterId: string) => {
    const state = requireActorState(characterId);
    activeCharacterId = state.characterId;
    sceneBridge?.selectActor(characterId);
    sceneBridge?.sync();
  };
  const setActorEmote = (characterId: string, emote: PixelWorldEmote) => {
    const state = requireActorState(characterId);
    state.emote = emote;
    sceneBridge?.sync();
  };
  const setActorHeldItem = (characterId: string, itemId: string | null) => {
    const state = requireActorState(characterId);
    state.heldItemId = itemId;
    sceneBridge?.refreshActorHold(characterId);
  };
  const setActorPosition = (characterId: string, slotId: string) => {
    const state = requireActorState(characterId);
    resolvePlacementSlot(slotId);
    state.slotId = slotId;
    sceneBridge?.placeActor(characterId);
  };

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      heldDirections.clear();
      keyboardDirections.clear();
      resizeObserver.disconnect();
      if (resizeFrame !== null && view) view.cancelAnimationFrame(resizeFrame);
      sceneBridge = null;
      game.destroy(true);
    },
    nudge(direction) {
      if (!destroyed) sceneBridge?.nudge(direction);
    },
    setActiveCharacter(characterId) {
      if (destroyed) return;
      try {
        selectCharacter(characterId);
      } catch (error) {
        reportError(error, "The selected character is not available.");
      }
    },
    setCharacterEmote(characterId, emote) {
      if (destroyed) return;
      try {
        setActorEmote(characterId, emote);
      } catch (error) {
        reportError(error, "The selected character is not available.");
      }
    },
    setCharacterHeldItem(characterId, itemId) {
      if (destroyed) return;
      try {
        setActorHeldItem(characterId, itemId);
      } catch (error) {
        reportError(error, "The selected character is not available.");
      }
    },
    setCharacterPosition(characterId, slotId) {
      if (destroyed) return;
      try {
        setActorPosition(characterId, slotId);
      } catch (error) {
        reportError(error, "The selected character position is not available.");
      }
    },
    setDirection(direction, active) {
      if (destroyed) return;
      if (active) heldDirections.add(direction);
      else heldDirections.delete(direction);
    },
    setEmote(emote) {
      if (destroyed) return;
      try {
        setActorEmote(activeCharacterId, emote);
      } catch (error) {
        reportError(error, "The selected character is not available.");
      }
    },
    setHeldItem(itemId) {
      if (destroyed) return;
      try {
        setActorHeldItem(activeCharacterId, itemId);
      } catch (error) {
        reportError(error, "The selected character is not available.");
      }
    },
  };
}
