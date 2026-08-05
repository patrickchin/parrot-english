import type PhaserType from "phaser";
import type {
  PixelLessonEmote,
  PixelLessonTargetId,
} from "../../lib/pixel-lesson-data";
import {
  ANIMATIONS,
  ART_PIXEL_SIZE,
  CAMERA_ZOOM,
  PLAYER_BODY,
  PLAYER_SPEED,
  PLAYER_START,
  SPRITE_FRAME_SIZE,
  VIEWPORT_SIZE,
  WORLD_OBJECTS,
  WORLD_SIZE,
  getDepthForFootY,
} from "../../prototypes/pixel-stage/world-config.js";

export type PixelStageDirection = "down" | "left" | "right" | "up";

export interface PixelStageEngineCallbacks {
  onError?: (error: Error) => void;
  onReady?: () => void;
  onTargetReached?: (targetId: PixelLessonTargetId) => void;
}

export interface PixelStageController {
  destroy: () => void;
  nudge: (direction: PixelStageDirection) => void;
  setDirection: (direction: PixelStageDirection, active: boolean) => void;
  setEmote: (emote: PixelLessonEmote) => void;
  setTarget: (targetId: PixelLessonTargetId | null) => void;
}

type PhaserRuntime = typeof PhaserType;
type MovementKeys = Record<PixelStageDirection, PhaserType.Input.Keyboard.Key>;
type WorldObject = (typeof WORLD_OBJECTS)[number];

const ASSET_ROOT = "https://media.parrotbook.com/prototypes/pixel-stage/v1";
const GRASS_BACKGROUND_COLOR = 0x8dce17;
const TARGET_REACH_DISTANCE = 88;
const TARGET_MARKER_DEPTH = 100_000;
const NUDGE_DURATION_MS = 140;
const SCENE_KEY = "react-pixel-lesson-stage";
const MOVEMENT_KEYS = new Set([
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowup",
  "a",
  "d",
  "s",
  "w",
]);

function toError(value: unknown, fallback: string) {
  return value instanceof Error ? value : new Error(fallback);
}

function getViewport(host: HTMLElement) {
  const bounds = host.getBoundingClientRect();
  const measuredWidth = Math.max(host.clientWidth, Math.round(bounds.width));
  const measuredHeight = Math.max(host.clientHeight, Math.round(bounds.height));
  const width = Math.max(
    ART_PIXEL_SIZE,
    Math.floor((measuredWidth || VIEWPORT_SIZE.width) / ART_PIXEL_SIZE) *
      ART_PIXEL_SIZE,
  );
  const height = Math.max(
    ART_PIXEL_SIZE,
    Math.floor((measuredHeight || VIEWPORT_SIZE.height) / ART_PIXEL_SIZE) *
      ART_PIXEL_SIZE,
  );

  return { height, width };
}

/**
 * Mounts one Phaser-owned canvas inside a React-owned host. All presentation
 * outside the canvas remains React state; this engine only owns the trusted
 * garden world, movement, target marker, and sprite animation.
 */
export function createPixelStageEngine(
  host: HTMLElement,
  callbacks: PixelStageEngineCallbacks,
  Phaser: PhaserRuntime,
): PixelStageController {
  let destroyed = false;
  let selectedEmote: PixelLessonEmote = "idle";
  let selectedTarget: PixelLessonTargetId | null = null;
  let scene: PixelStageScene | null = null;
  let viewport = getViewport(host);
  const heldDirections = new Set<PixelStageDirection>();
  const reducedMotion =
    host.ownerDocument.defaultView?.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ) ?? null;

  const reportError = (value: unknown, fallback: string) => {
    if (destroyed) return;
    callbacks.onError?.(toError(value, fallback));
  };
  const registerScene = (activeScene: PixelStageScene) => {
    scene = activeScene;
  };

  class PixelStageScene extends Phaser.Scene {
    private arrows!: MovementKeys;
    private marker!: PhaserType.GameObjects.Container;
    private markerBaseY = 0;
    private player!: PhaserType.Physics.Arcade.Sprite;
    private ready = false;
    private targetReached = false;
    private targetObject: WorldObject | null = null;
    private readonly targetVisuals = new Map<
      PixelLessonTargetId,
      PhaserType.GameObjects.Image
    >();
    private readonly nudgedDirections = new Set<PixelStageDirection>();
    private readonly nudgeTimers = new Map<
      PixelStageDirection,
      PhaserType.Time.TimerEvent
    >();
    private wasd!: MovementKeys;

    constructor() {
      super(SCENE_KEY);
    }

    preload() {
      this.load.image(
        "lesson-garden-ground",
        `${ASSET_ROOT}/lesson-garden-ground.png`,
      );
      this.load.image(
        "garden-tree-ball",
        `${ASSET_ROOT}/garden-tree-ball.png`,
      );
      this.load.image("garden-flowers", `${ASSET_ROOT}/garden-flowers.png`);
      this.load.image("garden-basket", `${ASSET_ROOT}/garden-basket.png`);
      this.load.image("garden-market", `${ASSET_ROOT}/garden-market.png`);
      this.load.spritesheet(
        "peppa",
        `${ASSET_ROOT}/peppa-town-sheet-96.png`,
        {
          frameHeight: SPRITE_FRAME_SIZE,
          frameWidth: SPRITE_FRAME_SIZE,
        },
      );

      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
        reportError(
          new Error("The lesson garden art could not load."),
          "The lesson garden art could not load.",
        );
      });
    }

    create() {
      try {
        registerScene(this);
        this.add.image(0, 0, "lesson-garden-ground").setDepth(0).setOrigin(0);
        const scenery = this.createWorldObjects();

        this.physics.world.setBounds(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
        this.player = this.physics.add.sprite(
          PLAYER_START.x,
          PLAYER_START.y,
          "peppa",
          0,
        );
        this.player
          .setCollideWorldBounds(true)
          .setDepth(getDepthForFootY(PLAYER_START.y))
          .setOrigin(0.5, 1);
        this.requireNativeScale(this.player, "Peppa");

        const playerBody = this.player.body as PhaserType.Physics.Arcade.Body;
        playerBody.setSize(PLAYER_BODY.width, PLAYER_BODY.height, false);
        playerBody.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);
        this.physics.add.collider(this.player, scenery);

        this.createAnimations();
        this.createMarker();
        this.configureCamera();
        this.configureInput();
        this.configureCanvas();

        this.ready = true;
        this.refreshTarget();
        this.playAnimation(selectedEmote);
        callbacks.onReady?.();
      } catch (caughtError) {
        reportError(caughtError, "The pixel lesson game could not start.");
      }
    }

    update() {
      if (!this.ready) return;

      const keyboardActive = this.game.canvas.matches(":focus");
      const left =
        (keyboardActive && (this.arrows.left.isDown || this.wasd.left.isDown)) ||
        heldDirections.has("left") ||
        this.nudgedDirections.has("left");
      const right =
        (keyboardActive &&
          (this.arrows.right.isDown || this.wasd.right.isDown)) ||
        heldDirections.has("right") ||
        this.nudgedDirections.has("right");
      const up =
        (keyboardActive && (this.arrows.up.isDown || this.wasd.up.isDown)) ||
        heldDirections.has("up") ||
        this.nudgedDirections.has("up");
      const down =
        (keyboardActive && (this.arrows.down.isDown || this.wasd.down.isDown)) ||
        heldDirections.has("down") ||
        this.nudgedDirections.has("down");
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
      this.updateMarker();
      this.checkTargetProximity();
    }

    refreshTarget() {
      if (!this.ready) return;

      this.targetReached = false;
      this.targetObject =
        WORLD_OBJECTS.find(({ id }) => id === selectedTarget) ?? null;
      if (!selectedTarget || !this.targetObject) {
        this.marker.setVisible(false);
        return;
      }

      const targetVisual = this.targetVisuals.get(selectedTarget);
      this.markerBaseY =
        this.targetObject.y - (targetVisual?.displayHeight ?? 48) - 14;
      this.marker
        .setPosition(this.targetObject.x, this.markerBaseY)
        .setVisible(true);
    }

    nudge(direction: PixelStageDirection) {
      if (!this.ready) return;

      this.nudgeTimers.get(direction)?.remove(false);
      this.nudgedDirections.add(direction);
      const timer = this.time.delayedCall(NUDGE_DURATION_MS, () => {
        this.nudgedDirections.delete(direction);
        this.nudgeTimers.delete(direction);
      });
      this.nudgeTimers.set(direction, timer);
    }

    private createWorldObjects() {
      const scenery = this.physics.add.staticGroup();

      for (const object of WORLD_OBJECTS) {
        const visual = this.add
          .image(object.x, object.y, object.asset)
          .setDepth(getDepthForFootY(object.footY))
          .setName(object.id)
          .setOrigin(0.5, 1);
        this.requireNativeScale(visual, object.id);
        this.targetVisuals.set(object.id as PixelLessonTargetId, visual);

        const { collision } = object;
        const body = this.add
          .rectangle(
            object.x + collision.offsetX + collision.width / 2,
            object.y + collision.offsetY + collision.height / 2,
            collision.width,
            collision.height,
            0x000000,
            0,
          )
          .setName(`${object.id}-footprint`);
        scenery.add(body);
      }

      return scenery;
    }

    private createMarker() {
      const markerArt = this.add.graphics();
      markerArt.fillStyle(0xffcf40, 1);
      markerArt.lineStyle(3, 0x332438, 1);
      markerArt.fillCircle(0, 0, 10);
      markerArt.strokeCircle(0, 0, 10);
      markerArt.fillTriangle(-7, 7, 7, 7, 0, 18);
      markerArt.strokeTriangle(-7, 7, 7, 7, 0, 18);

      this.marker = this.add
        .container(0, 0, [markerArt])
        .setDepth(TARGET_MARKER_DEPTH)
        .setName("active-lesson-target")
        .setVisible(false);
    }

    private createAnimations() {
      for (const animation of ANIMATIONS) {
        if (this.anims.exists(animation.key)) continue;
        this.anims.create({
          frameRate: animation.frameRate,
          frames: this.anims.generateFrameNumbers("peppa", {
            end: animation.end,
            start: animation.start,
          }),
          key: animation.key,
          repeat: animation.repeat,
        });
      }
    }

    private configureCamera() {
      const camera = this.cameras.main;
      camera.setBackgroundColor(GRASS_BACKGROUND_COLOR);
      camera.setZoom(CAMERA_ZOOM);
      camera.startFollow(
        this.player,
        true,
        reducedMotion?.matches ? 1 : 0.35,
        reducedMotion?.matches ? 1 : 0.35,
      );
      camera.setDeadzone(120, 84);
      camera.roundPixels = true;
      this.fitCameraBoundsToViewport();

      this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCameraBoundsToViewport, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.scale.off(
          Phaser.Scale.Events.RESIZE,
          this.fitCameraBoundsToViewport,
          this,
        );
      });
    }

    private fitCameraBoundsToViewport() {
      const camera = this.cameras.main;
      const horizontalMargin = Math.max(
        0,
        Math.floor((camera.width - WORLD_SIZE.width) / 2),
      );
      const verticalMargin = Math.max(
        0,
        Math.floor((camera.height - WORLD_SIZE.height) / 2),
      );

      camera.setBounds(
        -horizontalMargin,
        -verticalMargin,
        WORLD_SIZE.width + horizontalMargin * 2,
        WORLD_SIZE.height + verticalMargin * 2,
      );
    }

    private configureInput() {
      const keyboard = this.input.keyboard;
      if (!keyboard) throw new Error("Phaser keyboard input is unavailable.");

      this.arrows = keyboard.addKeys(
        {
          down: Phaser.Input.Keyboard.KeyCodes.DOWN,
          left: Phaser.Input.Keyboard.KeyCodes.LEFT,
          right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
          up: Phaser.Input.Keyboard.KeyCodes.UP,
        },
        false,
      ) as MovementKeys;
      this.wasd = keyboard.addKeys(
        {
          down: Phaser.Input.Keyboard.KeyCodes.S,
          left: Phaser.Input.Keyboard.KeyCodes.A,
          right: Phaser.Input.Keyboard.KeyCodes.D,
          up: Phaser.Input.Keyboard.KeyCodes.W,
        },
        false,
      ) as MovementKeys;
    }

    private configureCanvas() {
      const canvas = this.game.canvas;
      const focusCanvas = () => canvas.focus({ preventScroll: true });
      const clearMovement = () => {
        heldDirections.clear();
        this.nudgedDirections.clear();
      };
      const preventMovementKeyDefault = (event: KeyboardEvent) => {
        if (MOVEMENT_KEYS.has(event.key.toLowerCase())) event.preventDefault();
      };

      canvas.setAttribute(
        "aria-label",
        "Interactive pixel lesson garden. Use the arrow keys or W, A, S, and D to move.",
      );
      canvas.setAttribute("role", "application");
      canvas.tabIndex = 0;
      canvas.style.display = "block";
      canvas.style.imageRendering = "pixelated";
      canvas.style.maxHeight = "100%";
      canvas.style.maxWidth = "100%";
      canvas.addEventListener("pointerdown", focusCanvas);
      canvas.addEventListener("blur", clearMovement);
      canvas.addEventListener("keydown", preventMovementKeyDefault);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        canvas.removeEventListener("pointerdown", focusCanvas);
        canvas.removeEventListener("blur", clearMovement);
        canvas.removeEventListener("keydown", preventMovementKeyDefault);
      });
    }

    private requireNativeScale(
      visual: PhaserType.GameObjects.Image | PhaserType.Physics.Arcade.Sprite,
      name: string,
    ) {
      if (
        visual.scaleX !== 1 ||
        visual.scaleY !== 1 ||
        visual.displayWidth !== visual.frame.realWidth ||
        visual.displayHeight !== visual.frame.realHeight
      ) {
        throw new Error(`${name} must render one source pixel per world pixel.`);
      }
    }

    private playAnimation(key: string) {
      const animation = ANIMATIONS.find((candidate) => candidate.key === key);
      if (!animation) return;

      if (reducedMotion?.matches) {
        this.player.anims.stop();
        this.player.setFrame(animation.start);
        return;
      }
      this.player.anims.play(key, true);
    }

    private updateMarker() {
      if (!this.marker.visible) return;
      const offset = reducedMotion?.matches
        ? 0
        : Math.round(Math.sin(this.time.now / 180) * 4);
      this.marker.y = this.markerBaseY + offset;
    }

    private checkTargetProximity() {
      if (this.targetReached || !selectedTarget || !this.targetObject) return;

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.targetObject.x,
        this.targetObject.footY,
      );
      if (distance > TARGET_REACH_DISTANCE) return;

      this.targetReached = true;
      this.marker.setVisible(false);
      callbacks.onTargetReached?.(selectedTarget);
    }
  }

  let game: PhaserType.Game;
  try {
    game = new Phaser.Game({
      antialias: false,
      height: viewport.height,
      parent: host,
      physics: {
        arcade: {
          debug: false,
          gravity: { x: 0, y: 0 },
        },
        default: "arcade",
      },
      pixelArt: true,
      scale: {
        autoCenter: Phaser.Scale.CENTER_BOTH,
        autoRound: true,
        mode: Phaser.Scale.NONE,
        zoom: 1,
      },
      scene: PixelStageScene,
      transparent: true,
      type: Phaser.CANVAS,
      width: viewport.width,
    });
  } catch (caughtError) {
    destroyed = true;
    throw toError(caughtError, "The pixel lesson game could not start.");
  }

  const resizeGame = () => {
    if (destroyed) return;
    const nextViewport = getViewport(host);
    if (
      nextViewport.width === viewport.width &&
      nextViewport.height === viewport.height
    ) {
      return;
    }

    viewport = nextViewport;
    game.scale.resize(viewport.width, viewport.height);
  };

  const view = host.ownerDocument.defaultView;
  let resizeFrame: number | null = null;
  const scheduleResize = () => {
    if (destroyed) return;
    if (!view) {
      resizeGame();
      return;
    }
    if (resizeFrame !== null) view.cancelAnimationFrame(resizeFrame);
    resizeFrame = view.requestAnimationFrame(() => {
      resizeFrame = null;
      resizeGame();
    });
  };
  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(host);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      heldDirections.clear();
      resizeObserver.disconnect();
      if (resizeFrame !== null && view) view.cancelAnimationFrame(resizeFrame);
      scene = null;
      game.destroy(true);
    },
    nudge(direction) {
      if (destroyed) return;
      scene?.nudge(direction);
    },
    setDirection(direction, active) {
      if (destroyed) return;
      if (active) heldDirections.add(direction);
      else heldDirections.delete(direction);
    },
    setEmote(emote) {
      if (destroyed) return;
      selectedEmote = emote;
    },
    setTarget(targetId) {
      if (destroyed) return;
      selectedTarget = targetId;
      scene?.refreshTarget();
    },
  };
}
