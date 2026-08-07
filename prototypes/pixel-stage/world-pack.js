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

const assets = {
  "player-peppa-sheet": Object.freeze({
    ...makeAsset("characters/peppa-world-sheet.png", 640, 640, "spritesheet"),
    columns: 4, frameHeight: 160, frameWidth: 160, rows: 4,
  }),
};
for (const [id, width, height] of layerSpecs) assets[id] = makeAsset(`parallax/${id}.png`, width, height, "layer");
for (const id of groundIds) assets[`ground-${id}`] = makeAsset(`grounds/${id}-ground.png`, 720, 480, "ground");
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
    hold: Object.freeze({ offsetX: 0, offsetY: 0, originX: 0.5, originY: 0.5, rotation: 0 }),
    id,
    origin: Object.freeze({ x: 0.5, y: 1 }),
  })),
]);

function layer(assetId, y, scrollFactorX, depth, scrollFactorY = 0) {
  return Object.freeze({ assetId, depth, repeatX: false, scrollFactorX, scrollFactorY, x: 0, y });
}
function placements(entries) {
  return Object.freeze(entries.map(([objectId, x, y], index) => Object.freeze({ id: `${objectId}-${index + 1}`, objectId, x, y })));
}
function scene({ id, name, ground, start, entries, sky = "sky-day", cloud = "clouds-day", far = "hills-blue", mid = "treeline-far" }) {
  return Object.freeze({
    id,
    layers: Object.freeze({
      sky: Object.freeze([layer(sky, 0, 0, -50)]),
      far: Object.freeze([layer(cloud, 14, 0.08, -40), layer(far, 58, 0.2, -30)]),
      mid: Object.freeze([layer(mid, 92, 0.42, -20)]),
      play: Object.freeze([layer(`ground-${ground}`, 0, 1, 0, 1)]),
      foreground: Object.freeze([]),
    }),
    name,
    placements: placements(entries),
    start: Object.freeze(start),
  });
}

const scenes = Object.freeze([
  scene({ id: "garden-party", name: "Garden Party", ground: "garden", start: { x: 430, y: 250 }, entries: [["oak-tree",150,300],["fruit-tree",610,290],["flower-patch",340,210],["bench",340,390],["hedge",90,450],["signpost",470,210],["picnic-basket",430,350]] }),
  scene({ id: "orchard-walk", name: "Orchard Walk", ground: "orchard", far: "hills-green", start: { x: 340, y: 350 }, entries: [["fruit-tree",120,270],["fruit-tree",330,255],["fruit-tree",600,285],["fence-short",150,455],["fence-short",560,455],["bench",470,390],["red-apple",370,330]] }),
  scene({ id: "market-morning", name: "Market Morning", ground: "market", far: "village-far", start: { x: 250, y: 380 }, entries: [["market-stall",160,305],["market-stall",560,310],["lamp-post",360,250],["bench",360,425],["signpost",70,420],["picnic-basket",520,410],["wrapped-gift",215,365]] }),
  scene({ id: "pond-picnic", name: "Pond Picnic", ground: "pond", far: "hills-green", start: { x: 390, y: 390 }, entries: [["pond-reeds",180,300],["pond-reeds",540,290],["oak-tree",630,280],["picnic-blanket",350,410],["rock-cluster",260,360],["tall-grass",90,410],["picnic-basket",430,405]] }),
  scene({ id: "kite-meadow", name: "Kite Meadow", ground: "meadow", cloud: "clouds-soft", far: "hills-green", start: { x: 350, y: 330 }, entries: [["pine-tree",90,280],["pine-tree",650,300],["round-bush",210,390],["round-bush",560,420],["flower-patch",380,220],["fallen-log",140,440],["kite",440,370]] }),
  scene({ id: "playground-afternoon", name: "Playground Afternoon", ground: "playground", far: "village-far", start: { x: 360, y: 400 }, entries: [["playground-slide",180,350],["swing-set",550,330],["bench",360,440],["oak-tree",670,280],["fence-short",90,460],["fence-short",610,460],["red-ball",410,380]] }),
  scene({ id: "forest-trail", name: "Forest Trail", ground: "forest", cloud: "clouds-soft", far: "hills-green", mid: "treeline-pine", start: { x: 350, y: 390 }, entries: [["pine-tree",95,260],["pine-tree",615,280],["fallen-log",260,420],["rock-cluster",500,400],["tall-grass",180,350],["tall-grass",580,440],["signpost",360,280]] }),
  scene({ id: "village-sunset", name: "Village Sunset", ground: "village", sky: "sky-sunset", cloud: "clouds-soft", far: "village-far", start: { x: 360, y: 390 }, entries: [["market-stall",150,320],["lamp-post",340,320],["lamp-post",650,350],["bench",510,420],["flower-patch",300,430],["signpost",70,410],["wrapped-gift",410,395]] }),
]);

function anchors(entries) {
  return Object.freeze(entries.map(([x, y]) => Object.freeze({ depth: "front", x, y })));
}
const player = Object.freeze({
  body: Object.freeze({ height: 24, offsetX: 56, offsetY: 136, width: 48 }),
  sockets: Object.freeze({ mainHand: Object.freeze({ byPose: Object.freeze({
    idle: anchors([[30,-108]]),
    walking: anchors([[30,-108],[34,-106],[28,-110],[32,-107]]),
    talking: anchors([[32,-108],[34,-106],[30,-109],[33,-107]]),
    happy: anchors([[28,-112],[30,-110],[26,-114],[29,-111]]),
    surprised: anchors([[33,-114],[35,-112],[32,-115],[34,-113]]),
  }) }) }),
  spriteSheet: Object.freeze({ assetId: "player-peppa-sheet", columns: 4, frameHeight: 160, frameWidth: 160, rows: 4 }),
});

export const PIXEL_WORLD_PACK = Object.freeze({ assets, defaultSceneId: "garden-party", id: "storybook-meadows", objects, player, renderProfile, scenes });
export const PIXEL_WORLD_SCENES_BY_ID = new Map(scenes.map((entry) => [entry.id, entry]));
export const PIXEL_WORLD_OBJECTS_BY_ID = new Map(objects.map((entry) => [entry.id, entry]));
