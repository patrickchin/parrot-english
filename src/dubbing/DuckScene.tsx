import type { CSSProperties } from "react";
import { DUB_LINES, type DubLine } from "./dub-script.ts";

const MEDIA_BASE = "https://media.parrotbook.com/assets/v4/dubbing/five-little-ducks";

const artwork = {
  ducklingSwim: `${MEDIA_BASE}/duckling-swim.webp`,
  ducklingWalk: `${MEDIA_BASE}/duckling-walk.webp`,
  motherCall: `${MEDIA_BASE}/mother-call.webp`,
  motherSadCall: `${MEDIA_BASE}/mother-sad-call.webp`,
  motherSadSwim: `${MEDIA_BASE}/mother-sad-swim.webp`,
  motherSadWalk: `${MEDIA_BASE}/mother-sad-walk.webp`,
  motherSwim: `${MEDIA_BASE}/mother-swim.webp`,
  pond: `${MEDIA_BASE}/pond-scene.webp`,
} as const;

const sceneDescriptions = {
  depart: "The ducklings set out together.",
  hill: "The flock travels over a green hill.",
  "mother-calls": "Mother duck calls for the ducklings.",
  return: "The ducklings come back to the pond.",
  "none-return": "No ducklings come back to the pond.",
  "sad-mother-depart": "Sad mother duck sets out alone.",
  "sad-mother-hill": "Sad mother duck travels over the hill.",
  "sad-mother-calls": "Sad mother duck calls for the ducklings.",
  "five-return": "All five ducklings come back to mother duck.",
} as const;

const departPositions = [
  [300, 390],
  [420, 355],
  [540, 385],
  [660, 345],
  [790, 380],
] as const;

const hillPositions = [
  [345, 250],
  [420, 235],
  [500, 220],
  [580, 235],
  [655, 250],
] as const;

const returnPositions = [
  [260, 370],
  [380, 405],
  [500, 360],
  [620, 405],
  [740, 365],
] as const;

type Position = readonly [number, number];
type StoryMotion = "call" | "swim" | "walk";

function positionStyle([x, y]: Position, width: string): CSSProperties {
  return {
    left: `${x / 9.6}%`,
    opacity: "var(--actor-opacity)",
    top: `${y / 5.4}%`,
    transform: "translate(-50%, -100%)",
    width,
  } as CSSProperties;
}

function DuckActor({
  actor,
  animated,
  delay,
  expression = "bright",
  image,
  motion,
  pose,
  position,
  thumbnail,
  visible,
}: {
  actor: "mother" | `duckling-${number}`;
  animated: boolean;
  delay: number;
  expression?: "bright" | "sad";
  image: string;
  motion: StoryMotion;
  pose: string;
  position: Position;
  thumbnail: boolean;
  visible: boolean;
}) {
  const [x, y] = position;
  const mother = actor === "mother";
  const motionClass = motion === "call"
    ? "animate-duck-call"
    : motion === "walk"
      ? "animate-duck-walk"
      : "animate-duck-swim";

  return (
    <div
      className="absolute z-20 aspect-square origin-bottom transition-[left,top,opacity,width] duration-700 ease-out motion-reduce:transition-none"
      data-duck-actor={actor}
      data-expression={expression}
      data-pose={pose}
      data-visible={visible ? "true" : "false"}
      data-x={x}
      data-y={y}
      style={{
        ...positionStyle(
          position,
          mother ? motion === "walk" ? "18%" : "23%" : motion === "walk" ? "11.75%" : y <= 320 ? "13.5%" : "15.25%",
        ),
        "--actor-opacity": visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      } as CSSProperties}
    >
      <img
        alt=""
        aria-hidden="true"
        className={`relative block size-full select-none object-contain drop-shadow-[0_0.35rem_0.3rem_rgb(40_72_54_/_0.18)] motion-reduce:animate-none ${
          animated ? motionClass : ""
        }`}
        data-motion={motion}
        draggable="false"
        loading={thumbnail ? "lazy" : "eager"}
        src={image}
        style={{ animationDelay: `${delay}ms` }}
      />
    </div>
  );
}

function CallRings({ animated, position, sad }: {
  animated: boolean;
  position: Position;
  sad: boolean;
}) {
  const [x, y] = position;
  return (
    <div
      aria-hidden="true"
      className="absolute z-30 h-[13%] w-[10%] -translate-y-1/2"
      data-effect="call-rings"
      style={{ left: `${(x + 100) / 9.6}%`, top: `${(y - 155) / 5.4}%` }}
    >
      {[0, 1].map((ring) => (
        <span
          className={`absolute left-0 top-1/2 aspect-square -translate-y-1/2 rounded-full border-r-[0.3rem] ${
            sad ? "border-sky-100/90" : "border-white/95"
          } motion-reduce:animate-none ${animated ? "animate-duck-call-ring" : ""}`}
          key={ring}
          style={{
            animationDelay: `${ring * 180}ms`,
            height: `${55 + ring * 38}%`,
          }}
        />
      ))}
    </div>
  );
}

function SoftRain({ animated }: { animated: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-10 overflow-hidden" data-effect="soft-rain">
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(43_78_110_/_0.16),rgb(65_89_102_/_0.08))]" />
      {[8, 20, 35, 52, 68, 82, 93].map((left, index) => (
        <span
          className={`absolute top-[-12%] h-[18%] w-px rotate-[18deg] bg-white/45 motion-reduce:animate-none ${
            animated ? "animate-duck-rain" : ""
          }`}
          key={left}
          style={{ animationDelay: `${index * 150}ms`, left: `${left}%` }}
        />
      ))}
    </div>
  );
}

function Celebration({ animated }: { animated: boolean }) {
  const pieces = [
    [18, 15, "bg-pink-500", "rotate-12"],
    [29, 9, "bg-amber-300", "-rotate-12"],
    [41, 17, "bg-violet-500", "rotate-45"],
    [54, 8, "bg-orange-400", "rotate-12"],
    [67, 16, "bg-pink-500", "-rotate-12"],
    [79, 10, "bg-amber-300", "rotate-45"],
  ] as const;
  return (
    <div aria-hidden="true" className="absolute inset-0 z-30 overflow-hidden" data-effect="celebration">
      {pieces.map(([left, top, color, rotation], index) => (
        <span
          className={`absolute h-[2.6%] w-[1.2%] rounded-sm ${color} ${rotation} motion-reduce:animate-none ${
            animated ? "animate-duck-confetti" : ""
          }`}
          key={`${left}-${top}`}
          style={{ animationDelay: `${index * 100}ms`, left: `${left}%`, top: `${top}%` }}
        />
      ))}
    </div>
  );
}

export function DuckScene({
  compact = false,
  line = DUB_LINES[0],
  playing = false,
  thumbnail = false,
}: {
  compact?: boolean;
  line?: DubLine;
  playing?: boolean;
  thumbnail?: boolean;
}) {
  const sad = line.visualBeat.startsWith("sad-mother") || line.visualBeat === "none-return";
  const motherCalling = line.visualBeat.endsWith("mother-calls");
  const showMother = motherCalling || sad || line.visualBeat.endsWith("return");
  const duckPositions = line.visualBeat.includes("hill") || motherCalling
    ? hillPositions
    : line.visualBeat.includes("depart")
      ? departPositions
      : returnPositions;
  const ducklingPose = motherCalling ? "wait" : line.visualBeat;
  const ducklingWalks = line.visualBeat === "hill";
  const motherPose = line.visualBeat === "sad-mother-depart"
    ? "sad-swim"
    : line.visualBeat === "sad-mother-hill"
      ? "sad-walk"
      : line.visualBeat === "sad-mother-calls"
        ? "sad-call"
        : line.visualBeat === "none-return"
          ? "sad-wait"
          : line.visualBeat === "mother-calls"
            ? "call"
            : "swim";
  const motherPosition = line.visualBeat === "sad-mother-depart"
    ? [310, 390] as const
    : line.visualBeat === "sad-mother-hill"
      ? [500, 260] as const
      : motherCalling
        ? [175, 450] as const
        : [165, 370] as const;
  const motherImage = motherPose === "sad-call"
    ? artwork.motherSadCall
    : motherPose === "sad-walk"
      ? artwork.motherSadWalk
      : motherPose.startsWith("sad")
        ? artwork.motherSadSwim
        : motherPose === "call"
          ? artwork.motherCall
          : artwork.motherSwim;
  const animated = playing && !thumbnail;

  const art = (
    <div
      aria-hidden="true"
      className="relative isolate block size-full min-h-0 overflow-hidden bg-sky-100"
      data-animated={animated ? "true" : undefined}
      data-story-stage="five-little-ducks"
    >
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full select-none object-cover"
        data-story-layer="painted-environment"
        draggable="false"
        loading={thumbnail ? "lazy" : "eager"}
        src={artwork.pond}
      />
      {sad ? <SoftRain animated={animated} /> : null}
      {line.visualBeat === "five-return" ? <Celebration animated={animated} /> : null}
      {duckPositions.map((position, index) => (
        <DuckActor
          actor={`duckling-${index + 1}`}
          animated={animated}
          delay={index * 120}
          image={ducklingWalks ? artwork.ducklingWalk : artwork.ducklingSwim}
          key={`duckling-${index + 1}`}
          motion={ducklingWalks ? "walk" : "swim"}
          pose={ducklingPose}
          position={position}
          thumbnail={thumbnail}
          visible={index < line.duckCount}
        />
      ))}
      <DuckActor
        actor="mother"
        animated={animated}
        delay={0}
        expression={sad ? "sad" : "bright"}
        image={motherImage}
        motion={motherCalling ? "call" : motherPose === "sad-walk" ? "walk" : "swim"}
        pose={motherPose}
        position={motherPosition}
        thumbnail={thumbnail}
        visible={showMother}
      />
      {motherCalling ? <CallRings animated={animated} position={motherPosition} sad={sad} /> : null}
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
        {sceneDescriptions[line.visualBeat]}
      </figcaption>
    </figure>
  );
}
