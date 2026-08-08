const WORLD_SIZE = Object.freeze({ height: 480, width: 720 });
const PALETTE = Object.freeze([
  "#181425", "#2f2738", "#5b4658", "#8a6c74", "#b8a5ad", "#e8dfe3", "#ffffff",
  "#f7b6cf", "#ef7fab", "#df4f83", "#ff4b4b", "#d92f3d", "#ff7a3d", "#f4b83f",
  "#ffe066", "#7a3f25", "#a96532", "#d29a59", "#f1dfb9", "#3c6e3f", "#4f8f43",
  "#6fb84a", "#91d04f", "#b7e36b", "#255f68", "#378a8f", "#56b7b0", "#3978a8",
  "#57a7d9", "#82c9ed", "#b9e7f5", "#9c78d3",
]);

const renderProfile = Object.freeze({
  alpha: "binary",
  artCellWorldPixels: 2,
  cameraZoom: 2,
  palette: PALETTE,
  playfield: Object.freeze({ bottom: 480, left: 0, right: 720, top: 160 }),
  screenPixelsPerArtPixel: 4,
  sourcePixelsPerWorldPixel: 1,
  textureToWorldScale: 1,
  worldSize: WORLD_SIZE,
});

function makeAsset(src, nativeWidth, nativeHeight, kind = "sprite") {
  return Object.freeze({
    alpha: kind === "ground" ? "opaque" : "binary",
    kind,
    nativeHeight,
    nativeWidth,
    src: `/assets/pixel-world/${src}`,
    worldScale: 1,
  });
}

const layerSpecs = [
  ["sky-day", 720, 192], ["sky-sunset", 720, 192],
  ["clouds-day", 720, 128], ["clouds-soft", 720, 128],
  ["hills-blue", 720, 160], ["hills-green", 720, 160],
  ["treeline-far", 720, 144], ["treeline-pine", 720, 144], ["village-far", 720, 144],
];
const groundIds = ["garden", "orchard", "market", "pond", "meadow", "playground", "forest", "village"];
const scenerySpecs = [
  ["oak-tree", 128, 192, "tree"], ["pine-tree", 112, 192, "tree"],
  ["fruit-tree", 128, 192, "tree"], ["round-bush", 96, 64, "plants"],
  ["hedge", 160, 72, "plants"], ["flower-patch", 112, 64, "plants"],
  ["tall-grass", 96, 64, "plants"], ["rock-cluster", 96, 56, "terrain"],
  ["fallen-log", 128, 64, "terrain"], ["fence-short", 128, 64, "boundary"],
  ["signpost", 64, 112, "path"], ["bench", 128, 72, "furniture"],
  ["picnic-blanket", 128, 72, "picnic"], ["market-stall", 192, 144, "market"],
  ["pond-reeds", 112, 72, "water-edge"], ["lamp-post", 64, 160, "village"],
  ["playground-slide", 160, 128, "playground"], ["swing-set", 176, 144, "playground"],
];
const holdableSpecs = [
  ["red-apple", 32, 32, "fruit"], ["green-pear", 32, 32, "fruit"],
  ["banana", 40, 32, "fruit"], ["carrot", 32, 40, "food"],
  ["paint-brush", 48, 48, "art"], ["storybook", 48, 40, "book"],
  ["juice-bottle", 32, 48, "drink"], ["lantern", 40, 56, "light"],
  ["red-ball", 40, 40, "toy"], ["garden-flower", 32, 48, "nature"],
  ["picnic-basket", 56, 48, "container"], ["watering-can", 56, 48, "garden"],
  ["garden-shovel", 48, 56, "garden"], ["kite", 56, 64, "toy"],
  ["teddy-bear", 48, 56, "toy"], ["wrapped-gift", 48, 48, "celebration"],
];
function hold(originX, originY, offsetX = 0, offsetY = 0) {
  return Object.freeze({ offsetX, offsetY, originX, originY });
}
const holdProfiles = Object.freeze({
  "red-apple": hold(0.5, 0.5),
  "green-pear": hold(0.5, 0.55),
  banana: hold(0.42, 0.72, 2),
  carrot: hold(0.5, 0.78, 2),
  "paint-brush": hold(0.5, 0.82, 2),
  storybook: hold(0.45, 0.72, 3),
  "juice-bottle": hold(0.5, 0.66, 2),
  lantern: hold(0.5, 0.16, 3, 2),
  "red-ball": hold(0.5, 0.5, 3),
  "garden-flower": hold(0.5, 0.82, 2),
  "picnic-basket": hold(0.5, 0.18, 5, 2),
  "watering-can": hold(0.56, 0.24, 5, 2),
  "garden-shovel": hold(0.5, 0.12, 3, 2),
  kite: hold(0.5, 0.9, 4, -2),
  "teddy-bear": hold(0.24, 0.4, 4, 1),
  "wrapped-gift": hold(0.5, 0.5, 4, 2),
});

const assets = {
  "player-peppa-sheet": Object.freeze({
    ...makeAsset("characters/peppa-world-sheet.png", 640, 640, "spritesheet"),
    columns: 4, frameHeight: 160, frameWidth: 160, rows: 4,
  }),
  "player-peppa-main-hand-front-sheet": Object.freeze({
    ...makeAsset("characters/peppa-main-hand-front-sheet.png", 640, 640, "spritesheet"),
    columns: 4, frameHeight: 160, frameWidth: 160, rows: 4,
  }),
  "player-polly-sheet": Object.freeze({
    ...makeAsset("characters/polly-world-sheet.png", 512, 512, "spritesheet"),
    columns: 4, frameHeight: 128, frameWidth: 128, rows: 4,
  }),
  "player-polly-main-hand-front-sheet": Object.freeze({
    ...makeAsset("characters/polly-main-hand-front-sheet.png", 512, 512, "spritesheet"),
    columns: 4, frameHeight: 128, frameWidth: 128, rows: 4,
  }),
};
for (const [id, width, height] of layerSpecs) assets[id] = makeAsset(`parallax/${id}.png`, width, height, "layer");
for (const id of groundIds) assets[`ground-${id}`] = makeAsset(`grounds/${id}-ground.png`, 720, 320, "ground");
for (const [id, width, height] of [...scenerySpecs, ...holdableSpecs]) assets[`object-${id}`] = makeAsset(`objects/${id}.png`, width, height);
Object.freeze(assets);

const nonBlocking = new Set(["flower-patch", "tall-grass", "picnic-blanket"]);
const occluders = new Set(["oak-tree", "pine-tree", "fruit-tree", "market-stall"]);
const objects = Object.freeze([
  ...scenerySpecs.map(([id, width, height, category]) => {
    const capabilities = ["placeable"];
    if (!nonBlocking.has(id)) capabilities.push("blocking");
    if (occluders.has(id)) capabilities.push("occluder");
    const collisionWidth = Math.max(16, Math.round(width * 0.58));
    const collisionHeight = Math.max(12, Math.round(Math.min(height, 72) * 0.25));
    return Object.freeze({
      assetId: `object-${id}`,
      capabilities: Object.freeze(capabilities),
      category,
      collision: nonBlocking.has(id) ? null : Object.freeze({
        height: collisionHeight,
        offsetX: -Math.round(collisionWidth / 2),
        offsetY: -collisionHeight,
        width: collisionWidth,
      }),
      footOffsetY: 0,
      id,
      origin: Object.freeze({ x: 0.5, y: 1 }),
    });
  }),
  ...holdableSpecs.map(([id, , , category]) => Object.freeze({
    assetId: `object-${id}`,
    capabilities: Object.freeze(["placeable", "holdable"]),
    category,
    collision: null,
    footOffsetY: 0,
    hold: holdProfiles[id],
    id,
    origin: Object.freeze({ x: 0.5, y: 1 }),
  })),
]);

function layer(assetId, y, scrollFactorX, depth, scrollFactorY = 1) {
  return Object.freeze({ assetId, depth, repeatX: false, scrollFactorX, scrollFactorY, x: 0, y });
}
function placements(entries) {
  return Object.freeze(entries.map(([objectId, x, y], index) => Object.freeze({ id: `${objectId}-${index + 1}`, objectId, x, y })));
}

const placementSlots = Object.freeze([
  Object.freeze({ id: "back-left", label: "Back left", x: 180, y: 235 }),
  Object.freeze({ id: "back-center", label: "Back center", x: 360, y: 235 }),
  Object.freeze({ id: "back-right", label: "Back right", x: 540, y: 235 }),
  Object.freeze({ id: "center-left", label: "Center left", x: 180, y: 335 }),
  Object.freeze({ id: "center", label: "Center", x: 360, y: 335 }),
  Object.freeze({ id: "center-right", label: "Center right", x: 540, y: 335 }),
  Object.freeze({ id: "front-left", label: "Front left", x: 180, y: 425 }),
  Object.freeze({ id: "front-center", label: "Front center", x: 360, y: 425 }),
  Object.freeze({ id: "front-right", label: "Front right", x: 540, y: 425 }),
]);

function characterCast({
  peppaEmote = "idle",
  peppaHeldItemId = "red-apple",
  peppaSlotId = "center",
  pollyEmote = "happy",
  pollyHeldItemId = null,
  pollySlotId = "front-right",
} = {}) {
  return Object.freeze([
    Object.freeze({
      characterId: "peppa",
      emote: peppaEmote,
      heldItemId: peppaHeldItemId,
      slotId: peppaSlotId,
    }),
    Object.freeze({
      characterId: "polly",
      emote: pollyEmote,
      heldItemId: pollyHeldItemId,
      slotId: pollySlotId,
    }),
  ]);
}

function scene({
  cast = characterCast(),
  cloud = "clouds-day",
  entries,
  far = "hills-blue",
  ground,
  id,
  mid = "treeline-far",
  name,
  sky = "sky-day",
  source = { id, kind: "world" },
  start,
}) {
  return Object.freeze({
    cast,
    id,
    layers: Object.freeze({
      sky: Object.freeze([layer(sky, 0, 0, -50)]),
      far: Object.freeze([layer(cloud, 14, 0.08, -40), layer(far, 58, 0.2, -30)]),
      mid: Object.freeze([layer(mid, 92, 0.42, -20)]),
      play: Object.freeze([layer(`ground-${ground}`, 160, 1, 0, 1)]),
      foreground: Object.freeze([]),
    }),
    name,
    placements: placements(entries),
    source: Object.freeze(source),
    start: Object.freeze(start),
  });
}

const scenes = Object.freeze([
  scene({ id: "garden-party", name: "Garden Party", ground: "garden", start: { x: 430, y: 250 }, entries: [["oak-tree",150,300],["fruit-tree",610,210],["flower-patch",340,210],["bench",340,390],["hedge",90,450],["signpost",70,220],["picnic-basket",430,350]], cast: characterCast({ peppaSlotId: "center", pollySlotId: "front-right" }) }),
  scene({ id: "orchard-walk", name: "Orchard Walk", ground: "orchard", far: "hills-green", start: { x: 340, y: 350 }, entries: [["fruit-tree",120,270],["fruit-tree",330,255],["fruit-tree",600,285],["fence-short",150,455],["fence-short",560,455],["bench",470,390],["red-apple",370,330]], cast: characterCast({ peppaHeldItemId: "green-pear", pollyHeldItemId: "red-apple", pollySlotId: "center-right" }) }),
  scene({ id: "market-morning", name: "Market Morning", ground: "market", far: "village-far", start: { x: 250, y: 380 }, entries: [["market-stall",160,330],["market-stall",560,330],["lamp-post",400,350],["bench",360,425],["signpost",70,420],["picnic-basket",520,410],["wrapped-gift",215,365]], cast: characterCast({ peppaHeldItemId: "picnic-basket", peppaSlotId: "front-left", pollyHeldItemId: "wrapped-gift" }) }),
  scene({ id: "pond-picnic", name: "Pond Picnic", ground: "pond", far: "hills-green", start: { x: 390, y: 390 }, entries: [["pond-reeds",180,300],["pond-reeds",540,290],["oak-tree",630,280],["picnic-blanket",240,430],["rock-cluster",260,360],["tall-grass",90,410],["picnic-basket",300,440]], cast: characterCast({ peppaHeldItemId: "juice-bottle", peppaSlotId: "front-center", pollyHeldItemId: "storybook", pollySlotId: "center-right" }) }),
  scene({ id: "kite-meadow", name: "Kite Meadow", ground: "meadow", cloud: "clouds-soft", far: "hills-green", start: { x: 350, y: 330 }, entries: [["pine-tree",90,280],["pine-tree",650,300],["round-bush",210,390],["round-bush",560,420],["flower-patch",380,220],["fallen-log",140,440],["kite",440,370]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "kite", pollyHeldItemId: "garden-flower", pollySlotId: "center-right" }) }),
  scene({ id: "playground-afternoon", name: "Playground Afternoon", ground: "playground", far: "village-far", start: { x: 360, y: 320 }, entries: [["playground-slide",180,350],["swing-set",550,330],["bench",360,440],["oak-tree",670,280],["fence-short",90,460],["fence-short",610,460],["red-ball",410,380]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "red-ball", pollyHeldItemId: "teddy-bear", pollySlotId: "front-right" }) }),
  scene({ id: "forest-trail", name: "Forest Trail", ground: "forest", cloud: "clouds-soft", far: "hills-green", mid: "treeline-pine", start: { x: 350, y: 390 }, entries: [["pine-tree",95,260],["pine-tree",615,280],["fallen-log",260,420],["rock-cluster",500,400],["tall-grass",180,350],["tall-grass",580,440],["signpost",450,260]], cast: characterCast({ peppaHeldItemId: "lantern", peppaSlotId: "front-left", pollyEmote: "surprised", pollyHeldItemId: "garden-shovel", pollySlotId: "center-right" }) }),
  scene({ id: "village-sunset", name: "Village Sunset", ground: "village", sky: "sky-sunset", cloud: "clouds-soft", far: "village-far", start: { x: 360, y: 390 }, entries: [["market-stall",150,320],["lamp-post",240,320],["lamp-post",650,350],["bench",510,420],["flower-patch",300,430],["signpost",70,410],["wrapped-gift",410,395]], cast: characterCast({ peppaHeldItemId: "wrapped-gift", pollyHeldItemId: "lantern", pollySlotId: "front-right" }) }),

  scene({ id: "lesson-peppas-high-ball", name: "Lesson: Peppa's High Ball", ground: "garden", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "01-peppas-high-ball" }, entries: [["oak-tree",150,300],["red-ball",230,210],["hedge",620,430],["flower-patch",360,240],["bench",500,400],["signpost",70,230]], cast: characterCast({ peppaEmote: "surprised", peppaHeldItemId: null, peppaSlotId: "center-left", pollyEmote: "talking", pollyHeldItemId: "red-ball", pollySlotId: "center-right" }) }),
  scene({ id: "lesson-garden-colors", name: "Lesson: Garden Colors", ground: "garden", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "02-garden-colors" }, entries: [["flower-patch",170,230],["flower-patch",540,250],["round-bush",90,410],["fruit-tree",650,280],["watering-can",330,400],["garden-flower",430,360]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "garden-flower", peppaSlotId: "center-left", pollyHeldItemId: "paint-brush", pollySlotId: "center-right" }) }),
  scene({ id: "lesson-snack-time", name: "Lesson: Snack Time", ground: "orchard", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "03-snack-time" }, entries: [["fruit-tree",100,280],["fruit-tree",630,275],["picnic-blanket",360,430],["picnic-basket",270,410],["red-apple",420,390],["green-pear",480,400]], cast: characterCast({ peppaHeldItemId: "red-apple", peppaSlotId: "front-left", pollyEmote: "talking", pollyHeldItemId: "banana", pollySlotId: "front-right" }) }),
  scene({ id: "lesson-playground-words", name: "Lesson: Playground Words", ground: "playground", far: "village-far", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "04-playground-words" }, entries: [["playground-slide",160,350],["swing-set",550,330],["bench",360,435],["fence-short",90,465],["fence-short",630,465],["red-ball",410,380]], cast: characterCast({ peppaEmote: "talking", peppaHeldItemId: "red-ball", peppaSlotId: "center-left", pollyHeldItemId: "kite", pollySlotId: "center-right" }) }),
  scene({ id: "lesson-market-day", name: "Lesson: Market Day", ground: "market", far: "village-far", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "05-market-day" }, entries: [["market-stall",145,330],["market-stall",575,330],["lamp-post",360,330],["picnic-basket",270,415],["red-apple",440,390],["carrot",500,400]], cast: characterCast({ peppaHeldItemId: "picnic-basket", peppaSlotId: "front-left", pollyEmote: "talking", pollyHeldItemId: "carrot", pollySlotId: "front-right" }) }),
  scene({ id: "lesson-picnic-time", name: "Lesson: Picnic Time", ground: "pond", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "06-picnic-time" }, entries: [["pond-reeds",120,300],["pond-reeds",610,300],["picnic-blanket",360,430],["picnic-basket",280,415],["juice-bottle",440,390],["storybook",500,410]], cast: characterCast({ peppaHeldItemId: "juice-bottle", peppaSlotId: "front-left", pollyHeldItemId: "storybook", pollySlotId: "front-right" }) }),
  scene({ id: "lesson-bedtime-story", name: "Lesson: Bedtime Story", ground: "village", sky: "sky-sunset", cloud: "clouds-soft", far: "village-far", start: { x: 360, y: 335 }, source: { kind: "lesson", id: "07-bedtime-story" }, entries: [["lamp-post",100,330],["lamp-post",620,330],["bench",360,410],["flower-patch",220,430],["flower-patch",500,430],["lantern",450,390]], cast: characterCast({ peppaEmote: "talking", peppaHeldItemId: "storybook", peppaSlotId: "center-left", pollyHeldItemId: "lantern", pollySlotId: "center-right" }) }),

  scene({ id: "story-red-ball", name: "Story: Red Ball", ground: "playground", far: "village-far", start: { x: 360, y: 335 }, source: { kind: "story", id: "the-red-ball" }, entries: [["playground-slide",160,350],["swing-set",560,330],["bench",350,435],["oak-tree",670,280],["red-ball",420,370],["flower-patch",260,230]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "red-ball", peppaSlotId: "center-left", pollyEmote: "talking", pollySlotId: "center-right" }) }),
  scene({ id: "story-three-apples", name: "Story: Three Apples", ground: "orchard", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "story", id: "three-apples" }, entries: [["fruit-tree",120,270],["fruit-tree",590,270],["red-apple",290,390],["red-apple",360,400],["red-apple",430,390],["picnic-basket",520,420]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "red-apple", peppaSlotId: "front-left", pollyHeldItemId: "picnic-basket", pollySlotId: "front-right" }) }),
  scene({ id: "story-kite-come-back", name: "Story: Kite, Come Back!", ground: "meadow", cloud: "clouds-soft", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "story", id: "kite-come-back" }, entries: [["pine-tree",90,290],["pine-tree",640,295],["round-bush",200,400],["round-bush",540,410],["kite",430,230],["fallen-log",320,445]], cast: characterCast({ peppaEmote: "surprised", peppaHeldItemId: "kite", peppaSlotId: "center-left", pollyEmote: "happy", pollySlotId: "center-right" }) }),
  scene({ id: "story-lantern-trail", name: "Story: Lantern Trail", ground: "forest", cloud: "clouds-soft", far: "hills-green", mid: "treeline-pine", start: { x: 360, y: 335 }, source: { kind: "story", id: "the-lantern-trail" }, entries: [["pine-tree",95,270],["pine-tree",630,285],["fallen-log",240,420],["rock-cluster",520,410],["signpost",430,270],["tall-grass",350,440]], cast: characterCast({ peppaHeldItemId: "lantern", peppaSlotId: "front-left", pollyEmote: "talking", pollyHeldItemId: "garden-flower", pollySlotId: "front-right" }) }),
  scene({ id: "story-seed-wake-up", name: "Story: Seed, Wake Up!", ground: "garden", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "story", id: "seed-wake-up" }, entries: [["flower-patch",170,250],["flower-patch",550,250],["round-bush",90,410],["round-bush",630,410],["watering-can",330,400],["garden-shovel",440,400]], cast: characterCast({ peppaEmote: "happy", peppaHeldItemId: "watering-can", peppaSlotId: "center-left", pollyHeldItemId: "garden-shovel", pollySlotId: "center-right" }) }),
  scene({ id: "story-snack-for-two", name: "Story: Snack for Two", ground: "pond", far: "hills-green", start: { x: 360, y: 335 }, source: { kind: "story", id: "a-snack-for-two" }, entries: [["pond-reeds",120,300],["pond-reeds",610,300],["picnic-blanket",360,430],["picnic-basket",290,410],["red-apple",430,390],["banana",500,400]], cast: characterCast({ peppaHeldItemId: "red-apple", peppaSlotId: "front-left", pollyHeldItemId: "banana", pollySlotId: "front-right" }) }),
]);

function anchors(entries) {
  return Object.freeze(entries.map(([x, y]) => Object.freeze({
    depth: "front",
    overlayRole: "mainHandFront",
    x,
    y,
  })));
}

function sheet(assetId, frameSize) {
  return Object.freeze({
    assetId,
    columns: 4,
    frameHeight: frameSize,
    frameWidth: frameSize,
    rows: 4,
  });
}

const characters = Object.freeze([
  Object.freeze({
    body: Object.freeze({ height: 24, offsetX: 56, offsetY: 136, width: 48 }),
    id: "peppa",
    name: "Peppa",
    overlays: Object.freeze({
      mainHandFront: sheet("player-peppa-main-hand-front-sheet", 160),
    }),
    sockets: Object.freeze({ mainHand: Object.freeze({ byPose: Object.freeze({
      idle: anchors([[48,-49]]),
      walking: anchors([[48,-49],[61,-53],[53,-48],[54,-49]]),
      talking: anchors([[48,-48],[59,-57],[53,-48],[59,-57]]),
      happy: anchors([[57,-70],[53,-49],[57,-71],[59,-67]]),
      surprised: anchors([[52,-46],[52,-51],[52,-54],[54,-44]]),
    }) }) }),
    spriteSheet: sheet("player-peppa-sheet", 160),
  }),
  Object.freeze({
    body: Object.freeze({ height: 20, offsetX: 41, offsetY: 105, width: 46 }),
    id: "polly",
    name: "Polly",
    overlays: Object.freeze({
      mainHandFront: sheet("player-polly-main-hand-front-sheet", 128),
    }),
    sockets: Object.freeze({ mainHand: Object.freeze({ byPose: Object.freeze({
      idle: anchors([[38,-46]]),
      walking: anchors([[38,-46],[42,-48],[39,-44],[41,-46]]),
      talking: anchors([[40,-48],[43,-49],[40,-47],[43,-48]]),
      happy: anchors([[42,-55],[40,-47],[42,-56],[44,-54]]),
      surprised: anchors([[40,-45],[41,-46],[41,-48],[43,-44]]),
    }) }) }),
    spriteSheet: sheet("player-polly-sheet", 128),
  }),
]);

export const PIXEL_WORLD_PACK = Object.freeze({
  assets,
  characters,
  defaultSceneId: "garden-party",
  id: "storybook-meadows",
  objects,
  placementSlots,
  renderProfile,
  scenes,
});
export const PIXEL_WORLD_CHARACTERS_BY_ID = new Map(characters.map((entry) => [entry.id, entry]));
export const PIXEL_WORLD_SCENES_BY_ID = new Map(scenes.map((entry) => [entry.id, entry]));
export const PIXEL_WORLD_OBJECTS_BY_ID = new Map(objects.map((entry) => [entry.id, entry]));
export const PIXEL_WORLD_PLACEMENT_SLOTS_BY_ID = new Map(placementSlots.map((entry) => [entry.id, entry]));
