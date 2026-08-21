import { BookOpen, Sparkles } from "lucide-react";
import { cx } from "../shared/ui";
import type { PersonalizedStoryArtwork } from "./personalized-story-art-client";
import type { StoryArtwork as StoryArtworkData } from "./story-types";

export function StoryArtwork({
  artwork,
  className,
  personalizedOverride,
  priority = false,
  sizes,
}: {
  artwork: StoryArtworkData;
  className?: string;
  personalizedOverride?: PersonalizedStoryArtwork | null;
  priority?: boolean;
  sizes?: string;
}) {
  const renderedArtwork = personalizedOverride ?? artwork;
  const srcSet =
    sizes && !personalizedOverride && renderedArtwork.src
      ? ([384, 768] as const)
          .map(
            (width) =>
              `${renderedArtwork.src!.replace(/\.webp$/, `-${width}.webp`)} ${width}w`,
          )
          .join(", ")
      : undefined;

  if (renderedArtwork.src) {
    return (
      <img
        alt={renderedArtwork.alt}
        className={cx("h-full w-full object-cover", className)}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        height="1024"
        loading={priority ? "eager" : "lazy"}
        sizes={srcSet ? sizes : undefined}
        src={renderedArtwork.src}
        srcSet={srcSet}
        width="1536"
      />
    );
  }

  const catalogAlt = /^Artwork placeholder\b/i.test(artwork.alt)
    ? ""
    : artwork.alt.trim();
  const artworkDescription =
    personalizedOverride?.alt.trim() ||
    artwork.prompt.trim() ||
    catalogAlt ||
    "Story picture";

  return (
    <div
      aria-label={artworkDescription}
      className={cx(
        "relative isolate grid h-full w-full place-items-center overflow-hidden bg-[linear-gradient(180deg,#bde9ff_0_58%,#b9e78b_58%_100%)] p-5 text-brand-navy",
        className,
      )}
      role="img"
    >
      <span
        aria-hidden="true"
        className="absolute -left-8 top-5 size-24 rounded-full bg-white/75 sm:size-32"
      />
      <span
        aria-hidden="true"
        className="absolute -right-8 top-9 size-28 rounded-full bg-brand-yellow/90 sm:size-36"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-10 left-[12%] h-24 w-[76%] rounded-[50%] bg-emerald-500/35 sm:h-32"
      />
      <div
        aria-hidden="true"
        className="relative grid size-24 rotate-[-3deg] place-items-center rounded-[1.75rem] border-4 border-white bg-white/90 text-brand-pink shadow-card sm:size-32"
      >
        <BookOpen className="size-12 sm:size-16" strokeWidth={2.6} />
        <Sparkles className="absolute -right-3 -top-3 size-8 rounded-full bg-brand-yellow p-1 text-brand-navy" />
      </div>
    </div>
  );
}
