import type { DubDefinition, DubLine } from "./rhyme-catalog";
import { dubArtworkSrcSet } from "./dub-artwork";
import { retryOriginalImage } from "../shared/responsive-image";

const DUB_SCENE_IMAGE_SIZES =
  "(max-width: 559px) calc(100vw - 1.5rem), (min-width: 560px) and (max-height: 620px) 58vw, (max-width: 767px) calc(100vw - 1.5rem), (max-width: 1023px) calc(100vw - 3rem), min(70vw, 70rem)";

export function IllustratedDubScene({
  compact = false,
  definition,
  line = definition.lines[0],
  playing = false,
  thumbnail = false,
}: {
  compact?: boolean;
  definition: DubDefinition;
  line?: DubLine;
  playing?: boolean;
  thumbnail?: boolean;
}) {
  const lineIndex = Math.max(0, definition.lines.findIndex(({ id }) => id === line.id));
  const sceneIndex = Math.floor(lineIndex / definition.linesPerScene);
  const image = definition.lineArtwork?.[lineIndex]
    ?? definition.sceneArtwork[sceneIndex]
    ?? definition.sceneArtwork[0];
  const art = (
    <img
      alt={image.alt}
      className="block size-full select-none object-cover"
      data-playing={playing ? "true" : undefined}
      decoding="async"
      draggable="false"
      height={image.height}
      loading={thumbnail ? "lazy" : "eager"}
      onError={({ currentTarget }) => retryOriginalImage(currentTarget)}
      sizes={DUB_SCENE_IMAGE_SIZES}
      src={image.src}
      srcSet={dubArtworkSrcSet(image.src)}
      width={image.width}
    />
  );

  if (thumbnail) return art;

  return (
    <figure
      className={compact
        ? "m-0 grid size-full min-h-0 overflow-hidden"
        : "m-0 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"}
    >
      {art}
      <figcaption
        aria-hidden="true"
        className={compact ? "sr-only" : "bg-white/90 px-4 py-2 text-center text-sm font-black text-brand-navy"}
      >
        {image.alt}
      </figcaption>
    </figure>
  );
}
