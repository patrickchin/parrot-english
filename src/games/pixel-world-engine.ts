import type PhaserType from "phaser";
import {
  PIXEL_WORLD_OBJECTS_BY_ID,
  PIXEL_WORLD_PACK,
  PIXEL_WORLD_SCENES_BY_ID,
} from "../../prototypes/pixel-stage/world-pack.js";
import {
  flattenSceneLayers,
  getLayerScrollFactor,
  resolveHeldItemTransform,
} from "../../prototypes/pixel-stage/world-runtime.js";

export type PixelWorldDirection = "down" | "left" | "right" | "up";
export type PixelWorldEmote = "happy" | "idle" | "surprised" | "talking";
export type PixelWorldParallaxMode = "ambient" | "camera" | "off";

export interface PixelWorldEngineOptions {
  heldItemId: string | null;
  initialEmote: PixelWorldEmote;
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
  setDirection: (direction: PixelWorldDirection, active: boolean) => void;
  setEmote: (emote: PixelWorldEmote) => void;
  setHeldItem: (itemId: string | null) => void;
}

type PhaserRuntime = typeof PhaserType;
type HoldMetadata = {
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
};
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

const CAMERA_ZOOM = PIXEL_WORLD_PACK.renderProfile.cameraZoom;
const ART_CELL_SIZE = PIXEL_WORLD_PACK.renderProfile.artCellWorldPixels;
const TEXTURE_SCALE = PIXEL_WORLD_PACK.renderProfile.textureToWorldScale;
const WORLD_SIZE = PIXEL_WORLD_PACK.renderProfile.worldSize;
const PLAYFIELD = PIXEL_WORLD_PACK.renderProfile.playfield;
const PLAYER_SPEED = 144;
const PLAYER_CAMERA_FOLLOW_OFFSET_Y = 72;
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

  let destroyed = false;
  let selectedEmote: PixelWorldEmote = options.initialEmote;
  let selectedHeldItemId = options.heldItemId;
  let viewport = getViewport(host);
  let nudgeScene: ((direction: PixelWorldDirection) => void) | null = null;
  let refreshSceneHeldItem: (() => void) | null = null;
  const heldDirections = new Set<PixelWorldDirection>();
  const keyboardDirections = new Set<PixelWorldDirection>();
  const reducedMotion =
    host.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)") ?? null;

  const reportError = (value: unknown, fallback: string) => {
    if (!destroyed) callbacks.onError?.(toError(value, fallback));
  };

  class PixelWorldScene extends Phaser.Scene {
    private cloudLayers: PhaserType.GameObjects.Image[] = [];
    private heldItem: PhaserType.GameObjects.Image | null = null;
    private heldItemDefinition: WorldObject | null = null;
    private readonly nudgedDirections = new Set<PixelWorldDirection>();
    private readonly nudgeTimers = new Map<PixelWorldDirection, PhaserType.Time.TimerEvent>();
    private player!: PhaserType.Physics.Arcade.Sprite;
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
        nudgeScene = (direction) => this.nudge(direction);
        refreshSceneHeldItem = () => this.refreshHeldItem();
        this.createLayers();
        const blockers = this.createWorldObjects();
        this.physics.world.setBounds(
          PLAYFIELD.left,
          PLAYFIELD.top,
          PLAYFIELD.right - PLAYFIELD.left,
          PLAYFIELD.bottom - PLAYFIELD.top,
        );
        this.player = this.physics.add.sprite(
          sceneConfig.start.x,
          sceneConfig.start.y,
          PIXEL_WORLD_PACK.player.spriteSheet.assetId,
          0,
        );
        this.player
          .setCollideWorldBounds(true)
          .setDepth(getDepthForFootY(sceneConfig.start.y))
          .setOrigin(0.5, 1)
          .setScale(TEXTURE_SCALE);
        const body = this.player.body as PhaserType.Physics.Arcade.Body;
        body.updateBounds();
        body.setSize(
          PIXEL_WORLD_PACK.player.body.width,
          PIXEL_WORLD_PACK.player.body.height,
          false,
        );
        body.setOffset(
          PIXEL_WORLD_PACK.player.body.offsetX,
          PIXEL_WORLD_PACK.player.body.offsetY,
        );
        this.physics.add.collider(this.player, blockers);

        this.createAnimations();
        this.configureCamera();
        this.configureCanvas();
        this.refreshHeldItem();
        this.playAnimation(selectedEmote);
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

      this.player.setVelocity(0, 0);
      if (velocity.lengthSq() > 0) {
        velocity.normalize().scale(PLAYER_SPEED);
        this.player.setVelocity(velocity.x, velocity.y);
        if (velocity.x !== 0) this.player.setFlipX(velocity.x < 0);
        this.playAnimation("walking");
      } else {
        this.playAnimation(selectedEmote);
      }
      this.player.setDepth(getDepthForFootY(this.player.y));
      this.updateAmbientParallax();
      this.updateHeldItem(velocity.lengthSq() > 0 ? "walking" : selectedEmote);
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

    refreshHeldItem() {
      this.heldItem?.destroy();
      this.heldItem = null;
      this.heldItemDefinition = null;
      if (!selectedHeldItemId) {
        this.syncStatus();
        return;
      }
      const definition = PIXEL_WORLD_OBJECTS_BY_ID.get(selectedHeldItemId) as
        | WorldObject
        | undefined;
      if (!isHoldable(definition)) {
        selectedHeldItemId = null;
        this.syncStatus();
        return;
      }
      this.heldItemDefinition = definition ?? null;
      this.heldItem = this.add.image(this.player.x, this.player.y, definition.assetId);
      this.updateHeldItem(selectedEmote);
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
      for (const animation of ANIMATIONS) {
        if (this.anims.exists(animation.key)) continue;
        this.anims.create({
          frameRate: animation.frameRate,
          frames: this.anims.generateFrameNumbers(
            PIXEL_WORLD_PACK.player.spriteSheet.assetId,
            { end: animation.end, start: animation.start },
          ),
          key: animation.key,
          repeat: animation.repeat,
        });
      }
    }

    private configureCamera() {
      const camera = this.cameras.main;
      camera.setBackgroundColor(0x82c9ed);
      camera.setZoom(CAMERA_ZOOM);
      camera.startFollow(
        this.player,
        true,
        reducedMotion?.matches ? 1 : 0.35,
        reducedMotion?.matches ? 1 : 0.35,
      );
      camera.setFollowOffset(0, PLAYER_CAMERA_FOLLOW_OFFSET_Y);
      camera.setDeadzone(120 / CAMERA_ZOOM, 84 / CAMERA_ZOOM);
      camera.roundPixels = true;
      this.fitCameraBoundsToViewport();
      this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameraBoundsToViewport, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCameraBoundsToViewport, this);
      });
    }

    private fitCameraBoundsToViewport() {
      const camera = this.cameras.main;
      const visibleWidth = camera.width / CAMERA_ZOOM;
      const visibleHeight = camera.height / CAMERA_ZOOM;
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

    private playAnimation(key: PixelWorldEmote | "walking") {
      if (reducedMotion?.matches) {
        this.player.anims.stop();
        this.player.setFrame(POSE_START[key]);
      } else {
        this.player.anims.play(key, true);
      }
    }

    private updateAmbientParallax() {
      if (options.parallaxMode !== "ambient" || reducedMotion?.matches) return;
      const offset = Math.round(Math.sin(this.time.now / 1_600) * 3) * ART_CELL_SIZE;
      for (const cloud of this.cloudLayers) cloud.x = offset;
    }

    private updateHeldItem(pose: PixelWorldEmote | "walking") {
      if (!this.heldItem || !this.heldItemDefinition?.hold) return;
      const anchors = PIXEL_WORLD_PACK.player.sockets.mainHand.byPose[pose];
      const frameIndex = Math.max(0, this.getPlayerFrameIndex() - POSE_START[pose]);
      const transform = resolveHeldItemTransform({
        anchors,
        flipX: this.player.flipX,
        frameIndex,
        itemHold: this.heldItemDefinition.hold,
      });
      this.heldItem
        .setDepth(transform.depth === "front" ? this.player.depth + 1 : this.player.depth - 1)
        .setFlipX(transform.flipX)
        .setOrigin(transform.originX, transform.originY)
        .setPosition(this.player.x + transform.x, this.player.y + transform.y)
        .setRotation(0)
        .setScale(TEXTURE_SCALE);
    }

    private syncStatus() {
      if (!this.player) return;
      host.dataset.artCellScreenPixels = String(
        PIXEL_WORLD_PACK.renderProfile.screenPixelsPerArtPixel,
      );
      host.dataset.cameraZoom = String(CAMERA_ZOOM);
      host.dataset.frame = String(this.getPlayerFrameIndex());
      host.dataset.heldItem = selectedHeldItemId ?? "none";
      host.dataset.parallaxMode = reducedMotion?.matches ? "off" : options.parallaxMode;
      host.dataset.ready = String(this.ready);
      host.dataset.reducedMotion = String(Boolean(reducedMotion?.matches));
      host.dataset.sceneId = sceneConfig.id;
      host.dataset.textureScale = String(TEXTURE_SCALE);
      host.dataset.viewportHeight = String(viewport.height);
      host.dataset.viewportWidth = String(viewport.width);
      host.dataset.x = String(Math.round(this.player.x));
      host.dataset.y = String(Math.round(this.player.y));
    }

    private getPlayerFrameIndex() {
      const frameName = this.player.frame?.name;
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
  host.dataset.ready = "false";
  host.dataset.sceneId = sceneConfig.id;
  host.dataset.parallaxMode = options.parallaxMode;
  host.dataset.heldItem = selectedHeldItemId ?? "none";

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      heldDirections.clear();
      keyboardDirections.clear();
      resizeObserver.disconnect();
      if (resizeFrame !== null && view) view.cancelAnimationFrame(resizeFrame);
      nudgeScene = null;
      refreshSceneHeldItem = null;
      game.destroy(true);
    },
    nudge(direction) {
      if (!destroyed) nudgeScene?.(direction);
    },
    setDirection(direction, active) {
      if (destroyed) return;
      if (active) heldDirections.add(direction);
      else heldDirections.delete(direction);
    },
    setEmote(emote) {
      if (!destroyed) selectedEmote = emote;
    },
    setHeldItem(itemId) {
      if (destroyed) return;
      selectedHeldItemId = itemId;
      refreshSceneHeldItem?.();
    },
  };
}
