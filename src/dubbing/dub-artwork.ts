const MEDIA_BASE = "https://media.parrotbook.com/assets";

export type DubArtwork = Readonly<{
  alt: string;
  height: number;
  src: string;
  width: number;
}>;

function artwork(path: string, alt: string, version = 6): DubArtwork {
  return Object.freeze({
    alt,
    height: 864,
    src: `${MEDIA_BASE}/v${version}/dubbing/${path}`,
    width: 1536,
  });
}

export const NURSERY_RHYMES_COVER_ARTWORK = artwork(
  "nursery-rhymes-cover.webp",
  "Friendly nursery-rhyme characters gather for music beneath a glowing star.",
);

export const FIVE_LITTLE_DUCKS_SCENE_ARTWORK = Object.freeze([
  artwork("five-little-ducks/scene-1-five-ducklings.webp", "Five yellow ducklings leave their mother beside a bright spring pond."),
  artwork("five-little-ducks/scene-2-four-ducklings.webp", "Four yellow ducklings return across a flower-lined footbridge in the afternoon."),
  artwork("five-little-ducks/scene-3-three-ducklings.webp", "Three yellow ducklings travel over a broad green hill beneath a clear sky."),
  artwork("five-little-ducks/scene-4-two-ducklings.webp", "Two yellow ducklings return through tall pond reeds during a gentle rain."),
  artwork("five-little-ducks/scene-5-one-duckling.webp", "One yellow duckling returns to mother duck beside the pond at sunset."),
  artwork("five-little-ducks/scene-6-family-reunion.webp", "Mother duck joyfully reunites with all five yellow ducklings beneath a rainbow."),
]);

export const OLD_MACDONALD_SCENE_ARTWORK = Object.freeze([
  artwork("old-macdonald/scene-1-cows.webp", "Old MacDonald greets three friendly cows in the pasture beside his red barn."),
  artwork("old-macdonald/scene-2-ducks.webp", "Old MacDonald watches four white ducks splash in the farm pond."),
  artwork("old-macdonald/scene-3-pigs.webp", "Old MacDonald laughs with three pink pigs playing in a sunny mud patch."),
  artwork("old-macdonald/scene-4-dog.webp", "Old MacDonald's brown farm dog waits proudly by the barnyard fence."),
  artwork("old-macdonald/scene-5-sheep.webp", "Old MacDonald walks with five fluffy sheep in the meadow beyond the red barn."),
]);

export const TWINKLE_TWINKLE_SCENE_ARTWORK = Object.freeze([
  artwork("twinkle-twinkle/scene-1-little-star.webp", "A bright little star twinkles above a sleepy child at a moonlit window."),
  artwork("twinkle-twinkle/scene-2-world-below.webp", "The friendly star shines high above a tiny moonlit village and rolling hills."),
  artwork("twinkle-twinkle/scene-3-diamond-sky.webp", "The child smiles as the diamond-bright star sparkles across the deep blue sky."),
]);

const rowBoatOpeningArtwork = artwork(
  "row-row-row-your-boat/scene-1-gentle-stream.webp",
  "Two cheerful children row a small wooden boat along a gentle sunny stream.",
);
const rowBoatDreamArtwork = artwork(
  "row-row-row-your-boat/scene-2-merry-dream.webp",
  "The children laugh as their little boat glides through a dreamy flower-filled river bend.",
);

export const ROW_ROW_ROW_YOUR_BOAT_SCENE_ARTWORK = Object.freeze([
  rowBoatOpeningArtwork,
]);

export const ROW_ROW_ROW_YOUR_BOAT_LINE_ARTWORK = Object.freeze([
  rowBoatOpeningArtwork,
  artwork(
    "row-row-row-your-boat/line-2-gentle-stream.webp",
    "The two children paddle their wooden boat gently along a calm willow-lined stream.",
    7,
  ),
  artwork(
    "row-row-row-your-boat/line-3-merrily.webp",
    "The two children laugh merrily as their boat splashes past water lilies and dragonflies.",
    7,
  ),
  rowBoatDreamArtwork,
]);

export const MARY_HAD_A_LITTLE_LAMB_SCENE_ARTWORK = Object.freeze([
  artwork("mary-had-a-little-lamb/scene-1-white-lamb.webp", "Mary hugs her small white lamb in a soft green meadow dotted with flowers."),
  artwork("mary-had-a-little-lamb/scene-2-lamb-follows.webp", "Mary walks along a bright country lane while her devoted little lamb follows."),
]);

const humptyWallArtwork = artwork(
  "humpty-dumpty/scene-1-on-the-wall.webp",
  "A friendly egg-shaped Humpty Dumpty balances happily on a sunny garden wall.",
);
const humptyTogetherArtwork = artwork(
  "humpty-dumpty/scene-2-helping-humpty.webp",
  "Kind royal helpers carefully comfort Humpty Dumpty beside the garden wall.",
);

export const HUMPTY_DUMPTY_SCENE_ARTWORK = Object.freeze([
  humptyWallArtwork,
]);

export const HUMPTY_DUMPTY_LINE_ARTWORK = Object.freeze([
  humptyWallArtwork,
  artwork(
    "humpty-dumpty/line-2-great-fall.webp",
    "A surprised Humpty Dumpty tumbles gently toward soft flowers below the garden wall.",
    7,
  ),
  artwork(
    "humpty-dumpty/line-3-royal-help.webp",
    "Kind royal helpers and two gentle horses gather to help Humpty Dumpty in the castle garden.",
    7,
  ),
  humptyTogetherArtwork,
]);
