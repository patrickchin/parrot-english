import type { DubDefinition, DubLine } from "./rhyme-catalog";

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
  const image = definition.sceneArtwork[sceneIndex] ?? definition.sceneArtwork[0];
  const art = (
    <img
      alt={image.alt}
      className="block size-full select-none object-cover"
      data-playing={playing ? "true" : undefined}
      decoding="async"
      draggable="false"
      height={image.height}
      loading={thumbnail ? "lazy" : "eager"}
      src={image.src}
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
