import type { CSSProperties } from "react";
import { OLD_MACDONALD_DUB, type DubLine } from "./rhyme-catalog.ts";

const FARM_ANIMALS = ["cows", "ducks", "pigs", "dog", "sheep"] as const;

type FarmAnimal = typeof FARM_ANIMALS[number];

const FARM_DESCRIPTIONS: Record<FarmAnimal, string> = {
  cows: "Old MacDonald watches the cows by the red barn.",
  ducks: "Old MacDonald watches the ducks near the pond.",
  pigs: "Old MacDonald watches the pigs in the sunny field.",
  dog: "Old MacDonald watches the dog guarding the yard.",
  sheep: "Old MacDonald watches the sheep beside the pasture fence.",
};

const FARM_SOUNDS: Record<FarmAnimal, string> = {
  cows: "moo-moo",
  ducks: "quack-quack",
  pigs: "snort-snort",
  dog: "woof-woof",
  sheep: "baa-baa",
};

function getFarmAnimal(line: DubLine): FarmAnimal {
  if (FARM_ANIMALS.includes(line.visualBeat as FarmAnimal)) {
    return line.visualBeat as FarmAnimal;
  }
  const lineIndex = OLD_MACDONALD_DUB.lines.findIndex(({ id }) => id === line.id);
  if (lineIndex < 0) return "cows";
  return FARM_ANIMALS[Math.floor(lineIndex / OLD_MACDONALD_DUB.linesPerScene)] ?? "cows";
}

function actorStyle(left: string, top: string, scale = 1): CSSProperties {
  return {
    left,
    top,
    transform: `translate(-50%, -50%) scale(${scale})`,
  };
}

function Farmer({ animated }: { animated: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[38%] w-[18%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated ? "motion-safe:-translate-y-1" : ""
      }`}
      style={actorStyle("19%", "63%")}
    >
      <span className="absolute left-[36%] top-[4%] h-[18%] w-[28%] rounded-full bg-amber-100" />
      <span className="absolute left-[32%] top-[0%] h-[6%] w-[36%] rounded-full bg-amber-700" />
      <span className="absolute left-[27%] top-[5%] h-[5%] w-[46%] rounded-full bg-amber-800" />
      <span className="absolute left-[33%] top-[21%] h-[20%] w-[34%] rounded-t-[35%] rounded-b-[22%] bg-sky-200" />
      <span className="absolute left-[25%] top-[40%] h-[23%] w-[50%] rounded-[22%] bg-indigo-900" />
      <span className="absolute left-[24%] top-[58%] h-[27%] w-[16%] rounded-full bg-indigo-950" />
      <span className="absolute left-[60%] top-[58%] h-[27%] w-[16%] rounded-full bg-indigo-950" />
      <span className="absolute left-[17%] top-[42%] h-[9%] w-[16%] rounded-full bg-amber-100" />
      <span className="absolute left-[67%] top-[42%] h-[9%] w-[16%] rounded-full bg-amber-100" />
    </div>
  );
}

function Cow({ animated }: { animated: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[32%] w-[28%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated ? "motion-safe:-translate-y-1" : ""
      }`}
      style={actorStyle("70%", "67%")}
    >
      <span className="absolute left-[14%] top-[30%] h-[36%] w-[58%] rounded-[35%] bg-white shadow-[0_0.45rem_0.7rem_rgb(15_23_42_/_0.12)]" />
      <span className="absolute left-[50%] top-[20%] h-[24%] w-[24%] rounded-[35%] bg-white" />
      <span className="absolute left-[60%] top-[24%] h-[10%] w-[18%] rounded-full bg-rose-200" />
      <span className="absolute left-[8%] top-[52%] h-[26%] w-[7%] rounded-full bg-slate-800" />
      <span className="absolute left-[28%] top-[56%] h-[24%] w-[7%] rounded-full bg-slate-800" />
      <span className="absolute left-[50%] top-[56%] h-[24%] w-[7%] rounded-full bg-slate-800" />
      <span className="absolute left-[68%] top-[54%] h-[26%] w-[7%] rounded-full bg-slate-800" />
      <span className="absolute left-[18%] top-[36%] h-[14%] w-[16%] rotate-12 rounded-full bg-slate-900" />
      <span className="absolute left-[44%] top-[44%] h-[12%] w-[14%] -rotate-6 rounded-full bg-slate-900" />
      <span className="absolute left-[57%] top-[14%] h-[6%] w-[7%] -rotate-12 rounded-full bg-amber-200" />
      <span className="absolute left-[70%] top-[14%] h-[6%] w-[7%] rotate-12 rounded-full bg-amber-200" />
    </div>
  );
}

function Ducks({ animated }: { animated: boolean }) {
  const offsets = ["62%", "74%", "84%"];
  return offsets.map((left, index) => (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[18%] w-[12%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated && index === 1 ? "motion-safe:-translate-y-1" : ""
      }`}
      key={left}
      style={actorStyle(left, `${70 - index * 3}%`, 1 - index * 0.08)}
    >
      <span className="absolute left-[18%] top-[34%] h-[40%] w-[56%] rounded-full bg-yellow-300 shadow-[0_0.35rem_0.6rem_rgb(15_23_42_/_0.1)]" />
      <span className="absolute left-[52%] top-[24%] h-[20%] w-[20%] rounded-full bg-yellow-300" />
      <span className="absolute left-[68%] top-[30%] h-[8%] w-[12%] rounded-full bg-orange-400" />
      <span className="absolute left-[26%] top-[68%] h-[18%] w-[8%] rounded-full bg-orange-500" />
      <span className="absolute left-[48%] top-[68%] h-[18%] w-[8%] rounded-full bg-orange-500" />
    </div>
  ));
}

function Pigs({ animated }: { animated: boolean }) {
  const offsets = ["66%", "80%"];
  return offsets.map((left, index) => (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[24%] w-[16%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated ? "motion-safe:-translate-y-1" : ""
      }`}
      key={left}
      style={actorStyle(left, `${71 - index * 4}%`, 1 - index * 0.08)}
    >
      <span className="absolute left-[12%] top-[26%] h-[44%] w-[62%] rounded-[40%] bg-pink-300 shadow-[0_0.35rem_0.6rem_rgb(15_23_42_/_0.12)]" />
      <span className="absolute left-[50%] top-[28%] h-[22%] w-[24%] rounded-[38%] bg-pink-300" />
      <span className="absolute left-[62%] top-[35%] h-[10%] w-[12%] rounded-full bg-rose-300" />
      <span className="absolute left-[56%] top-[24%] h-[8%] w-[7%] -rotate-12 rounded-sm bg-pink-400" />
      <span className="absolute left-[68%] top-[24%] h-[8%] w-[7%] rotate-12 rounded-sm bg-pink-400" />
      <span className="absolute left-[20%] top-[66%] h-[18%] w-[8%] rounded-full bg-pink-500" />
      <span className="absolute left-[42%] top-[66%] h-[18%] w-[8%] rounded-full bg-pink-500" />
      <span className="absolute left-[14%] top-[38%] h-[8%] w-[8%] rounded-full border-2 border-pink-500 border-l-transparent border-t-transparent" />
    </div>
  ));
}

function Dog({ animated }: { animated: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[26%] w-[18%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated ? "motion-safe:-translate-y-1" : ""
      }`}
      style={actorStyle("75%", "68%")}
    >
      <span className="absolute left-[12%] top-[28%] h-[40%] w-[56%] rounded-[38%] bg-amber-700 shadow-[0_0.35rem_0.6rem_rgb(15_23_42_/_0.12)]" />
      <span className="absolute left-[52%] top-[22%] h-[22%] w-[24%] rounded-[38%] bg-amber-700" />
      <span className="absolute left-[60%] top-[20%] h-[12%] w-[8%] rounded-full bg-slate-900" />
      <span className="absolute left-[67%] top-[20%] h-[12%] w-[8%] rotate-12 rounded-full bg-slate-900" />
      <span className="absolute left-[68%] top-[34%] h-[6%] w-[8%] rounded-full bg-slate-950" />
      <span className="absolute left-[20%] top-[66%] h-[20%] w-[8%] rounded-full bg-amber-900" />
      <span className="absolute left-[44%] top-[66%] h-[20%] w-[8%] rounded-full bg-amber-900" />
      <span className="absolute left-[6%] top-[34%] h-[8%] w-[18%] -rotate-12 rounded-full bg-amber-900" />
    </div>
  );
}

function Sheep({ animated }: { animated: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute z-20 h-[28%] w-[20%] motion-safe:transition-transform motion-safe:duration-500 ${
        animated ? "motion-safe:-translate-y-1" : ""
      }`}
      style={actorStyle("74%", "68%")}
    >
      <span className="absolute left-[14%] top-[26%] h-[42%] w-[58%] rounded-full bg-slate-50 shadow-[0_0.35rem_0.6rem_rgb(15_23_42_/_0.14)]" />
      <span className="absolute left-[0%] top-[38%] h-[18%] w-[24%] rounded-full bg-slate-900" />
      <span className="absolute left-[12%] top-[60%] h-[20%] w-[8%] rounded-full bg-slate-900" />
      <span className="absolute left-[34%] top-[60%] h-[20%] w-[8%] rounded-full bg-slate-900" />
      <span className="absolute left-[54%] top-[60%] h-[20%] w-[8%] rounded-full bg-slate-900" />
      <span className="absolute left-[68%] top-[60%] h-[20%] w-[8%] rounded-full bg-slate-900" />
      <span className="absolute left-[8%] top-[30%] h-[8%] w-[6%] rounded-full bg-slate-950" />
    </div>
  );
}

function FarmAnimalArt({
  animal,
  animated,
}: {
  animal: FarmAnimal;
  animated: boolean;
}) {
  if (animal === "cows") return <Cow animated={animated} />;
  if (animal === "ducks") return <Ducks animated={animated} />;
  if (animal === "pigs") return <Pigs animated={animated} />;
  if (animal === "dog") return <Dog animated={animated} />;
  return <Sheep animated={animated} />;
}

export function FarmScene({
  compact = false,
  line = OLD_MACDONALD_DUB.lines[0],
  playing = false,
  thumbnail = false,
}: {
  compact?: boolean;
  line?: DubLine;
  playing?: boolean;
  thumbnail?: boolean;
}) {
  const animal = getFarmAnimal(line);
  const animated = playing && !thumbnail;
  const caption = FARM_DESCRIPTIONS[animal];

  const art = (
    <div
      aria-label="Farm scene"
      className="relative isolate block size-full min-h-0 overflow-hidden bg-[linear-gradient(180deg,#8ed6ff_0%,#c8eeff_46%,#e9f8ff_100%)]"
      data-animated={animated ? "true" : undefined}
      data-farm-animal={animal}
      role={thumbnail ? "img" : undefined}
    >
      <div aria-hidden="true" className="absolute left-[74%] top-[10%] size-[16%] rounded-full bg-yellow-200/95 blur-[2px]" />
      <div aria-hidden="true" className="absolute left-[8%] top-[12%] h-[10%] w-[18%] rounded-full bg-white/90 shadow-[1.2rem_0_0_0_rgb(255_255_255_/_0.78),2.4rem_0.6rem_0_0_rgb(255_255_255_/_0.72)]" />
      <div aria-hidden="true" className="absolute left-[58%] top-[18%] h-[8%] w-[14%] rounded-full bg-white/85 shadow-[0.9rem_0_0_0_rgb(255_255_255_/_0.78)]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-[30%] h-[22%] rounded-t-[48%] bg-emerald-300" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,#7dc061_0%,#5b9f42_100%)]" />
      <div aria-hidden="true" className="absolute right-[11%] top-[33%] h-[32%] w-[21%] rounded-t-[12%] bg-red-500 shadow-[0_0.7rem_1.2rem_rgb(15_23_42_/_0.14)]" />
      <div
        aria-hidden="true"
        className="absolute right-[9%] top-[24%] h-[16%] w-[25%] bg-red-700"
        style={{ clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }}
      />
      <div aria-hidden="true" className="absolute right-[17%] top-[44%] h-[21%] w-[8%] rounded-t-[22%] bg-amber-100" />
      <div aria-hidden="true" className="absolute left-[48%] bottom-[21%] h-[17%] w-[2%] bg-amber-100 shadow-[1.8rem_0_0_#fef3c7,3.6rem_0_0_#fef3c7,5.4rem_0_0_#fef3c7,7.2rem_0_0_#fef3c7]" />
      <div aria-hidden="true" className="absolute left-[46%] bottom-[24%] h-[2.2%] w-[12%] bg-amber-100 shadow-[0_1.2rem_0_#fef3c7,0_2.4rem_0_#fef3c7]" />

      <Farmer animated={animated} />
      <FarmAnimalArt animal={animal} animated={animated} />

      {!thumbnail ? (
        <div
          aria-hidden="true"
          className={`absolute left-[56%] top-[14%] rounded-full border-2 border-white/90 bg-white/80 px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.16em] text-brand-navy shadow-sm motion-reduce:animate-none ${
            animated ? "animate-pulse" : ""
          }`}
        >
          {FARM_SOUNDS[animal]}
        </div>
      ) : null}
    </div>
  );

  if (thumbnail) return art;

  return (
    <figure
      className={
        compact
          ? "grid size-full overflow-hidden"
          : "m-0 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"
      }
    >
      {art}
      <figcaption className={compact ? "sr-only" : "bg-white/90 px-4 py-2 text-center font-ui text-sm font-black text-brand-navy"}>
        {caption}
      </figcaption>
    </figure>
  );
}
