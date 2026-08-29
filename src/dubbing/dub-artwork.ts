const MEDIA_BASE = "https://media.parrotbook.com/assets/v5/dubbing";

export type DubArtwork = Readonly<{
  alt: string;
  height: number;
  src: string;
  width: number;
}>;

function artwork(path: string, alt: string): DubArtwork {
  return Object.freeze({
    alt,
    height: 864,
    src: `${MEDIA_BASE}/${path}`,
    width: 1536,
  });
}

export const NURSERY_RHYMES_COVER_ARTWORK = artwork(
  "nursery-rhymes-cover.webp",
  "Mother duck and five ducklings visit a cheerful farm full of friendly animals.",
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
