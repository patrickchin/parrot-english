import type { WordGameItem, WordGameTopic } from "./word-game-catalog";
import { cx } from "../shared/ui";

export function WordGameVisual({
  className,
  item: suppliedItem,
  showLabel = true,
  topic,
}: ({
  className?: string;
  topic: WordGameTopic;
  item?: never;
  showLabel?: boolean;
} | {
  className?: string;
  item: WordGameItem;
  showLabel?: boolean;
  topic?: never;
})) {
  const item = suppliedItem ?? topic.items[0];

  if (item.visual.kind === "swatch") {
    return (
      <div
        aria-label={item.alt}
        className={cx("grid aspect-square place-items-center rounded-2xl", className)}
        role="img"
        style={{ backgroundColor: item.visual.color }}
      >
        {showLabel ? (
          <span className="rounded-full bg-white/90 px-4 py-2 text-lg font-black text-brand-ink">
            {item.label}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      alt={item.alt}
      className={cx("aspect-square w-full rounded-2xl object-contain", className)}
      decoding="async"
      height={512}
      loading="lazy"
      src={item.visual.src}
      width={512}
    />
  );
}
