import { Image as ImageIcon, Sparkles } from "lucide-react";
import { cx } from "../shared/ui";
import type { StoryArtwork as StoryArtworkData } from "./story-types";

export function StoryArtwork({
  artwork,
  className,
  priority = false,
}: {
  artwork: StoryArtworkData;
  className?: string;
  priority?: boolean;
}) {
  if (artwork.src) {
    return (
      <img
        alt={artwork.alt}
        className={cx("h-full w-full object-cover", className)}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        height="1024"
        loading={priority ? "eager" : "lazy"}
        src={artwork.src}
        width="1536"
      />
    );
  }

  return (
    <div
      aria-label={artwork.alt}
      className={cx(
        "grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#dbeafe_45%,#fce7f3_100%)] p-5 text-center text-brand-navy",
        className,
      )}
      role="img"
    >
      <div className="grid max-w-lg justify-items-center gap-2">
        <span className="grid size-14 place-items-center rounded-2xl border-3 border-white bg-white/85 shadow-control-surface">
          <ImageIcon aria-hidden="true" className="size-7" />
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-brand-blue">
          <Sparkles aria-hidden="true" className="size-4" /> Artwork placeholder
        </span>
        <span className="text-sm font-extrabold leading-snug text-slate-700 sm:text-base">
          Picture coming later
        </span>
      </div>
    </div>
  );
}
