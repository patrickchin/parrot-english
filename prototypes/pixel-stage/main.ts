import Phaser from "phaser";
import {
  ANIMATIONS,
  ART_PIXEL_SIZE,
  CAMERA_ZOOM,
  GROUND_SOURCE_SCALE,
  PLAYER_BODY,
  PLAYER_SPEED,
  PLAYER_START,
  SPRITE_FRAME_SIZE,
  SPRITE_SCREEN_FRAME_SIZE,
  SPRITE_WORLD_FRAME_SIZE,
  TEXTURE_TO_WORLD_SCALE,
  WORLD_OBJECTS,
  WORLD_SIZE,
  getDepthForFootY,
} from "./world-config.js";

type Direction = "down" | "left" | "right" | "up";
type EmoteState = "happy" | "idle" | "surprised" | "talking";
type MovementKeys = Record<Direction, Phaser.Input.Keyboard.Key>;

const DIRECTION_EVENT = "pixel-stage:direction";
const CLEAR_DIRECTIONS_EVENT = "pixel-stage:clear-directions";
const EMOTE_EVENT = "pixel-stage:emote";
const NUDGE_EVENT = "pixel-stage:nudge";
const VIEWPORT_RESIZE_EVENT = "pixel-stage:viewport-resize";
const ASSET_ROOT = "https://media.parrotbook.com/prototypes/pixel-stage/v1";
const ART_CACHE_QUERY = "?art-revision=20260806-detailed-redraw";
const EMOTE_STATES: EmoteState[] = ["idle", "talking", "happy", "surprised"];
const GRASS_BACKGROUND_COLOR = 0x8dce17;

type ResponsiveViewport = {
  displayHeight: number;
  displayWidth: number;
  height: number;
  presentationScale: number;
  width: number;
};

const speechCopy: Record<EmoteState, string> = {
  happy: "Hooray! We found the red ball!",
  idle: "Come on — let's explore the lesson garden!",
  surprised: "Oh! The ball is up in the tree!",
  talking: "Let's look by the flowers and basket.",
};

function assetSource(filename: string) {
  return `${ASSET_ROOT}/${filename}${ART_CACHE_QUERY}`;
}

function requireElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The pixel stage is missing ${selector}.`);
  return element;
}

const worldElement = requireElement<HTMLElement>("#pixel-game");
const stageElement = requireElement<HTMLElement>(".stage");
const coordinatesElement = requireElement<HTMLElement>("[data-coordinates]");
const engineStatusElement = requireElement<HTMLElement>("[data-engine-status]");
const depthStatusElement = requireElement<HTMLElement>("[data-depth-status]");
const speechElement = requireElement<HTMLElement>("[data-speech-copy]");
const rootElement = document.documentElement;

function getResponsiveViewport(): ResponsiveViewport {
  const width = Math.max(ART_PIXEL_SIZE, Math.floor(rootElement.clientWidth));
  const height = Math.max(ART_PIXEL_SIZE, Math.floor(rootElement.clientHeight));
  const presentationScale = 1;
  const displayHeight = height;
  const displayWidth = width;

  return {
    displayHeight,
    displayWidth,
    height,
    presentationScale,
    width,
  };
}

function applyResponsiveViewport(viewport: ResponsiveViewport) {
  rootElement.style.setProperty(
    "--game-canvas-width",
    `${viewport.displayWidth}px`,
  );
  rootElement.style.setProperty(
    "--game-canvas-height",
    `${viewport.displayHeight}px`,
  );
  worldElement.dataset.presentationScale = String(viewport.presentationScale);
  worldElement.dataset.viewportHeight = String(viewport.height);
  worldElement.dataset.viewportWidth = String(viewport.width);
}

let responsiveViewport = getResponsiveViewport();
applyResponsiveViewport(responsiveViewport);

class PixelStageScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private player!: Phaser.Physics.Arcade.Sprite;
  private selectedEmote: EmoteState = "idle";
  private readonly touchDirections = new Set<Direction>();
  private wasd!: MovementKeys;
  private readonly landmark = WORLD_OBJECTS.find(
    ({ id }) => id === "lesson-tree",
  );
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  constructor() {
    super("pixel-stage");
  }

  preload() {
    this.load.image("lesson-garden-ground", assetSource("lesson-garden-ground.png"));
    this.load.image(
      "garden-tree-ball",
      assetSource("garden-tree-ball.png"),
    );
    this.load.image("garden-flowers", assetSource("garden-flowers.png"));
    this.load.image("garden-basket", assetSource("garden-basket.png"));
    this.load.image("garden-market", assetSource("garden-market.png"));
    this.load.spritesheet("peppa", assetSource("peppa-town-sheet-320.png"), {
      frameHeight: SPRITE_FRAME_SIZE,
      frameWidth: SPRITE_FRAME_SIZE,
    });

    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      engineStatusElement.textContent = "The lesson garden art could not load.";
    });
  }

  create() {
    const ground = this.add
      .image(0, 0, "lesson-garden-ground")
      .setDepth(0)
      .setOrigin(0)
      .setScale(TEXTURE_TO_WORLD_SCALE);
    this.requireDetailedTexture(ground, "Lesson garden ground");
    if (
      ground.frame.realWidth !== WORLD_SIZE.width * GROUND_SOURCE_SCALE ||
      ground.frame.realHeight !== WORLD_SIZE.height * GROUND_SOURCE_SCALE ||
      ground.displayWidth !== WORLD_SIZE.width ||
      ground.displayHeight !== WORLD_SIZE.height
    ) {
      throw new Error("The lesson garden ground must cover the complete world.");
    }
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
      .setOrigin(0.5, 1)
      .setScale(TEXTURE_TO_WORLD_SCALE);
    this.requireDetailedTexture(this.player, "Peppa");

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    // The body is created before the sprite scale is applied. Sync that scale
    // before converting the source-pixel collider to world pixels.
    playerBody.updateBounds();
    playerBody.setSize(
      PLAYER_BODY.width / TEXTURE_TO_WORLD_SCALE,
      PLAYER_BODY.height / TEXTURE_TO_WORLD_SCALE,
      false,
    );
    playerBody.setOffset(
      PLAYER_BODY.offsetX / TEXTURE_TO_WORLD_SCALE,
      PLAYER_BODY.offsetY / TEXTURE_TO_WORLD_SCALE,
    );
    this.physics.add.collider(this.player, scenery);

    this.createAnimations();
    this.configureCamera();
    this.configureInput();

    const canvas = this.game.canvas;
    canvas.setAttribute("aria-label", "Peppa lesson garden pixel game world");
    canvas.setAttribute("role", "img");
    canvas.style.imageRendering = "pixelated";

    worldElement.dataset.mapHeight = String(WORLD_SIZE.height);
    worldElement.dataset.mapWidth = String(WORLD_SIZE.width);
    worldElement.dataset.groundSourceHeight = String(ground.frame.realHeight);
    worldElement.dataset.groundSourceWidth = String(ground.frame.realWidth);
    worldElement.dataset.groundWorldHeight = String(ground.displayHeight);
    worldElement.dataset.groundWorldWidth = String(ground.displayWidth);
    worldElement.dataset.artPixelSize = String(ART_PIXEL_SIZE);
    worldElement.dataset.cameraZoom = String(CAMERA_ZOOM);
    worldElement.dataset.playerBodyHeight = String(playerBody.height);
    worldElement.dataset.playerBodyWidth = String(playerBody.width);
    worldElement.dataset.spriteDetailPixelSize = String(ART_PIXEL_SIZE);
    worldElement.dataset.spriteFrameSize = String(SPRITE_FRAME_SIZE);
    worldElement.dataset.spriteRenderScale = String(TEXTURE_TO_WORLD_SCALE);
    worldElement.dataset.spriteScreenFrameSize = String(
      SPRITE_SCREEN_FRAME_SIZE,
    );
    worldElement.dataset.spriteWorldFrameSize = String(
      SPRITE_WORLD_FRAME_SIZE,
    );
    worldElement.dataset.landmarkDepth = String(
      getDepthForFootY(this.landmark?.footY ?? 0),
    );
    worldElement.dataset.ready = "true";
    this.playAnimation("idle");
    this.syncStatus();
  }

  update() {
    const left =
      this.cursors.left.isDown ||
      this.wasd.left.isDown ||
      this.touchDirections.has("left");
    const right =
      this.cursors.right.isDown ||
      this.wasd.right.isDown ||
      this.touchDirections.has("right");
    const up =
      this.cursors.up.isDown ||
      this.wasd.up.isDown ||
      this.touchDirections.has("up");
    const down =
      this.cursors.down.isDown ||
      this.wasd.down.isDown ||
      this.touchDirections.has("down");
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
      this.playAnimation(this.selectedEmote);
    }

    this.player.setDepth(getDepthForFootY(this.player.y));
    this.syncStatus();
  }

  private createWorldObjects() {
    const scenery = this.physics.add.staticGroup();

    for (const object of WORLD_OBJECTS) {
      const visual = this.add
        .image(object.x, object.y, object.asset)
        .setDepth(getDepthForFootY(object.footY))
        .setName(object.id)
        .setOrigin(0.5, 1)
        .setScale(TEXTURE_TO_WORLD_SCALE);
      this.requireDetailedTexture(visual, object.id);

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

  private requireDetailedTexture(
    visual: Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite,
    name: string,
  ) {
    if (
      visual.scaleX !== TEXTURE_TO_WORLD_SCALE ||
      visual.scaleY !== TEXTURE_TO_WORLD_SCALE ||
      visual.displayWidth !== visual.frame.realWidth * TEXTURE_TO_WORLD_SCALE ||
      visual.displayHeight !== visual.frame.realHeight * TEXTURE_TO_WORLD_SCALE
    ) {
      throw new Error(
        `${name} must render its authored texture at ${TEXTURE_TO_WORLD_SCALE} world scale.`,
      );
    }
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBackgroundColor(GRASS_BACKGROUND_COLOR);
    camera.setZoom(CAMERA_ZOOM);
    camera.startFollow(this.player, true, 0.35, 0.35);
    camera.setDeadzone(120 / CAMERA_ZOOM, 84 / CAMERA_ZOOM);
    camera.roundPixels = true;
    this.fitCameraBoundsToViewport();

    this.game.events.on(
      VIEWPORT_RESIZE_EVENT,
      this.fitCameraBoundsToViewport,
      this,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(
        VIEWPORT_RESIZE_EVENT,
        this.fitCameraBoundsToViewport,
        this,
      );
    });
  }

  private fitCameraBoundsToViewport(
    viewportWidth = this.cameras.main.width,
    viewportHeight = this.cameras.main.height,
  ) {
    const camera = this.cameras.main;
    const visibleWidth = viewportWidth / CAMERA_ZOOM;
    const visibleHeight = viewportHeight / CAMERA_ZOOM;
    const horizontalMargin = Math.max(
      0,
      Math.ceil((visibleWidth - WORLD_SIZE.width) / 2),
    );
    const verticalMargin = Math.max(
      0,
      Math.ceil((visibleHeight - WORLD_SIZE.height) / 2),
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
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys({
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
    }) as MovementKeys;

    this.game.events.on(DIRECTION_EVENT, this.setDirection, this);
    this.game.events.on(CLEAR_DIRECTIONS_EVENT, this.clearDirections, this);
    this.game.events.on(EMOTE_EVENT, this.setEmote, this);
    this.game.events.on(NUDGE_EVENT, this.nudge, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(DIRECTION_EVENT, this.setDirection, this);
      this.game.events.off(CLEAR_DIRECTIONS_EVENT, this.clearDirections, this);
      this.game.events.off(EMOTE_EVENT, this.setEmote, this);
      this.game.events.off(NUDGE_EVENT, this.nudge, this);
    });
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

  private playAnimation(key: string) {
    const animation = ANIMATIONS.find((candidate) => candidate.key === key);
    if (!animation) return;

    if (this.reducedMotion.matches) {
      this.player.anims.stop();
      this.player.setFrame(animation.start);
      return;
    }
    this.player.anims.play(key, true);
  }

  private setDirection(direction: Direction, active: boolean) {
    if (active) this.touchDirections.add(direction);
    else this.touchDirections.delete(direction);
  }

  private clearDirections() {
    this.touchDirections.clear();
  }

  private setEmote(emote: EmoteState) {
    this.selectedEmote = emote;
    worldElement.dataset.state = emote;
  }

  private nudge(direction: Direction) {
    this.touchDirections.add(direction);
    this.time.delayedCall(120, () => this.touchDirections.delete(direction));
  }

  private syncStatus() {
    const camera = this.cameras.main;
    const x = Math.round(this.player.x);
    const y = Math.round(this.player.y);
    const depth = getDepthForFootY(y);
    const landmarkDepth = getDepthForFootY(this.landmark?.footY ?? 0);
    const nearLandmark =
      this.landmark &&
      Math.abs(x - this.landmark.x) < 108 &&
      y > this.landmark.y - 180 &&
      y < this.landmark.y + 90;
    const occlusion = nearLandmark
      ? depth < landmarkDepth
        ? "behind-tree"
        : "in-front-of-tree"
      : "open";

    worldElement.dataset.cameraHeight = String(Math.round(camera.height));
    worldElement.dataset.cameraWidth = String(Math.round(camera.width));
    worldElement.dataset.cameraVisibleHeight = String(
      Math.round(camera.worldView.height),
    );
    worldElement.dataset.cameraVisibleWidth = String(
      Math.round(camera.worldView.width),
    );
    worldElement.dataset.cameraX = String(Math.round(camera.worldView.x));
    worldElement.dataset.cameraY = String(Math.round(camera.worldView.y));
    worldElement.dataset.depth = String(depth);
    worldElement.dataset.frame = String(this.player.frame.name);
    worldElement.dataset.occlusion = occlusion;
    worldElement.dataset.x = String(x);
    worldElement.dataset.y = String(y);
    coordinatesElement.textContent = `x ${x} · y ${y}`;
    depthStatusElement.textContent =
      occlusion === "behind-tree"
        ? "Behind the lesson tree"
        : occlusion === "in-front-of-tree"
          ? "In front of the lesson tree"
          : "Exploring the lesson garden";
  }
}

const game = new Phaser.Game({
  antialias: false,
  height: responsiveViewport.height,
  parent: worldElement,
  physics: {
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
    default: "arcade",
  },
  pixelArt: true,
  transparent: true,
  scale: {
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    mode: Phaser.Scale.NONE,
    zoom: 1,
  },
  scene: PixelStageScene,
  type: Phaser.CANVAS,
  width: responsiveViewport.width,
});

const resizeGame = () => {
  const nextViewport = getResponsiveViewport();
  applyResponsiveViewport(nextViewport);

  if (
    nextViewport.width !== responsiveViewport.width ||
    nextViewport.height !== responsiveViewport.height
  ) {
    game.scale.resize(nextViewport.width, nextViewport.height);
    game.events.emit(
      VIEWPORT_RESIZE_EVENT,
      nextViewport.width,
      nextViewport.height,
    );
  }

  game.canvas.style.removeProperty("width");
  game.canvas.style.removeProperty("height");
  responsiveViewport = nextViewport;
};

let resizeTimer: number | undefined;
const scheduleResize = () => {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = undefined;
    resizeGame();
  }, 0);
};
const stageResizeObserver = new ResizeObserver(scheduleResize);
stageResizeObserver.observe(stageElement);
window.addEventListener("resize", scheduleResize);

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-move]",
)) {
  const direction = button.dataset.move as Direction;
  const stop = () => game.events.emit(DIRECTION_EVENT, direction, false);

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    game.events.emit(DIRECTION_EVENT, direction, true);
  });
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("pointerup", stop);
  button.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    game.events.emit(DIRECTION_EVENT, direction, true);
  });
  button.addEventListener("keyup", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    stop();
  });
  button.addEventListener("click", () => game.events.emit(NUDGE_EVENT, direction));
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-state]",
)) {
  button.addEventListener("click", () => {
    const state = button.dataset.state as EmoteState;
    if (!EMOTE_STATES.includes(state)) return;

    for (const candidate of document.querySelectorAll<HTMLButtonElement>(
      "button[data-state]",
    )) {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    speechElement.textContent = speechCopy[state];
    game.events.emit(EMOTE_EVENT, state);
  });
}

window.addEventListener("blur", () => game.events.emit(CLEAR_DIRECTIONS_EVENT));
window.addEventListener("pointerup", () =>
  game.events.emit(CLEAR_DIRECTIONS_EVENT),
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    stageResizeObserver.disconnect();
    window.removeEventListener("resize", scheduleResize);
    game.destroy(true);
  });
}
