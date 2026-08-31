import type { WordGameTopic } from "./word-game-catalog";
import { cx } from "../shared/ui";

export function WordGameVisual({
  className,
  topic,
}: {
  className?: string;
  topic: WordGameTopic;
}) {
  const item = topic.items[0];

  if (item.visual.kind === "swatch") {
    return (
      <div
        aria-label={item.alt}
        className={cx("grid aspect-[3/2] place-items-center rounded-2xl", className)}
        role="img"
        style={{ backgroundColor: item.visual.color }}
      >
        <span className="rounded-full bg-white/90 px-4 py-2 text-lg font-black text-brand-ink">
          {item.label}
        </span>
      </div>
    );
  }

  return (
    <img
      alt={item.alt}
      className={cx("aspect-[3/2] w-full rounded-2xl object-contain", className)}
      decoding="async"
      height={512}
      loading="lazy"
      src={item.visual.src}
      width={768}
    />
  );
}
