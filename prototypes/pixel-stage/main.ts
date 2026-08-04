import Phaser from "phaser";
import {
  ANIMATIONS,
  FOREGROUND_DEPTH,
  PLAYER_BODY,
  PLAYER_DEPTH_BASE,
  PLAYER_SPEED,
  PLAYER_START,
  SCENERY_COLLIDERS,
  SPRITE_FRAME_SIZE,
  WALKABLE_BOUNDS,
  WORLD_SIZE,
} from "./world-config.js";

type Direction = "down" | "left" | "right" | "up";
type EmoteState = "happy" | "idle" | "surprised" | "talking";
type MovementKeys = Record<
  "down" | "left" | "right" | "up",
  Phaser.Input.Keyboard.Key
>;

const DIRECTION_EVENT = "pixel-stage:direction";
const CLEAR_DIRECTIONS_EVENT = "pixel-stage:clear-directions";
const EMOTE_EVENT = "pixel-stage:emote";
const NUDGE_EVENT = "pixel-stage:nudge";
const ASSET_ROOT = "/prototypes/pixel-stage/assets";
const EMOTE_STATES: EmoteState[] = ["idle", "talking", "happy", "surprised"];

const speechCopy: Record<EmoteState, string> = {
  happy: "Hooray! You said it brilliantly!",
  idle: "Ready for an English adventure?",
  surprised: "Oh! A brand-new word!",
  talking: "Repeat after me: muddy puddles!",
};

function requireElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The pixel stage is missing ${selector}.`);
  return element;
}

const worldElement = requireElement<HTMLElement>("#pixel-game");
const coordinatesElement =
  requireElement<HTMLElement>("[data-coordinates]");
const engineStatusElement =
  requireElement<HTMLElement>("[data-engine-status]");
const speechElement = requireElement<HTMLElement>("[data-speech-copy]");

class PixelStageScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private player!: Phaser.Physics.Arcade.Sprite;
  private selectedEmote: EmoteState = "idle";
  private readonly touchDirections = new Set<Direction>();
  private wasd!: MovementKeys;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  constructor() {
    super("pixel-stage");
  }

  preload() {
    this.load.image("garden", `${ASSET_ROOT}/garden.png`);
    this.load.image("foreground", `${ASSET_ROOT}/foreground.png`);
    this.load.spritesheet("peppa", `${ASSET_ROOT}/peppa-sheet.png`, {
      frameHeight: SPRITE_FRAME_SIZE,
      frameWidth: SPRITE_FRAME_SIZE,
    });

    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      engineStatusElement.textContent = "The game art could not load.";
    });
  }

  create() {
    this.add.image(0, 0, "garden").setDepth(0).setOrigin(0);

    this.physics.world.setBounds(
      WALKABLE_BOUNDS.x,
      WALKABLE_BOUNDS.y,
      WALKABLE_BOUNDS.width,
      WALKABLE_BOUNDS.height,
    );

    this.player = this.physics.add.sprite(
      PLAYER_START.x,
      PLAYER_START.y,
      "peppa",
      0,
    );
    this.player
      .setCollideWorldBounds(true)
      .setDepth(PLAYER_DEPTH_BASE + PLAYER_START.y)
      .setOrigin(0.5, 1);

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(PLAYER_BODY.width, PLAYER_BODY.height, false);
    playerBody.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);

    const scenery = this.physics.add.staticGroup();
    for (const collider of SCENERY_COLLIDERS) {
      const body = this.add
        .rectangle(
          collider.x,
          collider.y,
          collider.width,
          collider.height,
          0x000000,
          0,
        )
        .setName(collider.name);
      scenery.add(body);
    }
    this.physics.add.collider(this.player, scenery);

    this.createAnimations();
    this.add
      .image(0, 0, "foreground")
      .setDepth(FOREGROUND_DEPTH)
      .setOrigin(0);

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

    const canvas = this.game.canvas;
    canvas.setAttribute("aria-label", "Phaser pixel game world");
    canvas.setAttribute("role", "img");
    canvas.style.imageRendering = "pixelated";

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

    this.player.setDepth(PLAYER_DEPTH_BASE + Math.round(this.player.y));
    this.syncStatus();
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
    const depth = PLAYER_DEPTH_BASE + y;
    worldElement.dataset.depth = String(depth);
    worldElement.dataset.x = String(x);
    worldElement.dataset.y = String(y);
    coordinatesElement.textContent = `x ${x} · y ${y}`;
  }
}

const game = new Phaser.Game({
  backgroundColor: "#8fcae8",
  height: WORLD_SIZE.height,
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
  width: WORLD_SIZE.width,
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
