import Phaser from "phaser";
import {
  ANIMATIONS,
  CAMERA_ZOOM,
  PLAYER_BODY,
  PLAYER_SCALE,
  PLAYER_SPEED,
  PLAYER_START,
  SPRITE_FRAME_SIZE,
  VIEWPORT_SIZE,
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
const ASSET_ROOT = "/prototypes/pixel-stage/assets";
const EMOTE_STATES: EmoteState[] = ["idle", "talking", "happy", "surprised"];

const speechCopy: Record<EmoteState, string> = {
  happy: "Hooray! We found the red ball!",
  idle: "Come on — let's explore the lesson garden!",
  surprised: "Oh! The ball is up in the tree!",
  talking: "Let's look by the flowers and basket.",
};

function requireElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The pixel stage is missing ${selector}.`);
  return element;
}

const worldElement = requireElement<HTMLElement>("#pixel-game");
const coordinatesElement = requireElement<HTMLElement>("[data-coordinates]");
const engineStatusElement = requireElement<HTMLElement>("[data-engine-status]");
const depthStatusElement = requireElement<HTMLElement>("[data-depth-status]");
const speechElement = requireElement<HTMLElement>("[data-speech-copy]");

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
    this.load.spritesheet("peppa", `${ASSET_ROOT}/peppa-town-sheet-96.png`, {
      frameHeight: SPRITE_FRAME_SIZE,
      frameWidth: SPRITE_FRAME_SIZE,
    });

    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      engineStatusElement.textContent = "The lesson garden art could not load.";
    });
  }

  create() {
    this.add
      .image(0, 0, "lesson-garden-ground")
      .setDepth(0)
      .setOrigin(0);
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
      .setScale(PLAYER_SCALE);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(PLAYER_BODY.width, PLAYER_BODY.height, false);
    playerBody.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);
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
    worldElement.dataset.cameraZoom = String(CAMERA_ZOOM);
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
      this.add
        .image(object.x, object.y, object.asset)
        .setDepth(getDepthForFootY(object.footY))
        .setName(object.id)
        .setOrigin(0.5, 1);

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

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setZoom(CAMERA_ZOOM);
    camera.setBounds(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
    camera.startFollow(this.player, true, 0.35, 0.35);
    camera.setDeadzone(120, 84);
    camera.roundPixels = true;
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

    worldElement.dataset.cameraX = String(Math.round(this.cameras.main.scrollX));
    worldElement.dataset.cameraY = String(Math.round(this.cameras.main.scrollY));
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
  backgroundColor: "#8ad51b",
  height: VIEWPORT_SIZE.height,
  parent: worldElement,
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
    zoom: Phaser.Scale.MAX_ZOOM,
  },
  scene: PixelStageScene,
  type: Phaser.CANVAS,
  width: VIEWPORT_SIZE.width,
});

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
  import.meta.hot.dispose(() => game.destroy(true));
}
