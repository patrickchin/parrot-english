const MEDIA_BASE = "https://media.parrotbook.com/assets";

export type DubArtwork = Readonly<{
  alt: string;
  height: number;
  src: string;
  width: number;
}>;

export function dubArtworkSrcSet(src: string) {
  return [384, 768]
    .map((width) => `${src.replace(/\.webp$/, `-${width}.webp`)} ${width}w`)
    .concat(`${src} 1536w`)
    .join(", ");
}

function artwork(path: string, alt: string): DubArtwork {
  return Object.freeze({
    alt,
    height: 864,
    src: `${MEDIA_BASE}/v6/dubbing/${path}`,
    width: 1536,
  });
}

export const NURSERY_RHYMES_COVER_ARTWORK = artwork(
  "nursery-rhymes-cover.webp",
  "Friendly nursery-rhyme characters gather for music beneath a glowing star.",
);
