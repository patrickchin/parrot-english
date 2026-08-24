import { DUB_LINES, type DubLine } from "./dub-script.ts";

const sceneDescriptions = {
  "five-enter": "Five ducks enter the pond.",
  hill: "The flock swims toward a green hill.",
  frog: "A frog appears; four ducks continue.",
  "four-splash": "Four ducks make bright ripples.",
  reeds: "Three ducks pass swaying reeds.",
  "lily-circle": "Two ducks circle a lily pad.",
  "one-calls": "One duck calls beside the bank.",
  "mama-calls": "Mama duck appears at sunset.",
  "five-return": "All five ducks return for the finale.",
} as const;

function Duck({
  delay,
  mama = false,
  playing,
  x,
  y,
}: {
  delay: number;
  mama?: boolean;
  playing: boolean;
  x: number;
  y: number;
}) {
  const scale = mama ? 1.35 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g
        className={playing ? "animate-bounce motion-reduce:animate-none" : undefined}
        style={playing ? { animationDelay: `${delay}ms` } : undefined}
      >
        <ellipse cx="0" cy="15" fill={mama ? "#f4b942" : "#ffd84d"} rx="48" ry="30" />
        <circle cx="38" cy="-12" fill={mama ? "#f4b942" : "#ffd84d"} r="25" />
        <path d="M58 -14 82 -5 58 3Z" fill="#f47b20" />
        <circle cx="46" cy="-18" fill="#172554" r="4" />
        <path d="M-38 13 Q-66 -5 -60 28 Q-43 23 -28 29Z" fill="#f7c948" />
        <path d="M-15 10 Q8 -3 23 15 Q4 26 -17 20Z" fill="#f2b632" />
      </g>
    </g>
  );
}

export function DuckScene({
  compact = false,
  line = DUB_LINES[0],
  playing = false,
}: {
  compact?: boolean;
  line?: DubLine;
  playing?: boolean;
}) {
  const showFrog = line.visualBeat === "frog";
  const showMama = line.visualBeat === "mama-calls" || line.visualBeat === "five-return";
  const duckPositions = [
    [265, 345],
    [390, 390],
    [520, 342],
    [650, 392],
    [765, 335],
  ] as const;

  return (
    <figure
      className={
        compact
          ? "grid size-full overflow-hidden"
          : "m-0 grid overflow-hidden rounded-3xl border-4 border-white bg-sky-100 shadow-card"
      }
    >
      <svg
        aria-hidden="true"
        className="block h-full min-h-0 w-full"
        viewBox="0 0 960 540"
      >
        <defs>
          <linearGradient id="duck-sky-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8dd8ff" />
            <stop offset="1" stopColor="#ffe6a7" />
          </linearGradient>
        </defs>
        <rect fill="url(#duck-sky-gradient)" height="540" width="960" />
        <circle cx="815" cy="92" fill="#fff3a6" r="54" />
        <path d="M0 275 Q145 115 335 270 Q520 88 760 275 Q865 185 960 250 V390 H0Z" fill="#70bd65" />
        <path d="M0 322 Q235 262 475 320 Q720 245 960 315 V540 H0Z" fill="#328c58" />
        <ellipse cx="500" cy="420" fill="#41b7d8" rx="430" ry="125" />
        <ellipse cx="500" cy="426" fill="none" opacity=".55" rx="340" ry="78" stroke="#d9f8ff" strokeWidth="8" />
        <g fill="#49a942">
          <ellipse cx="175" cy="435" rx="52" ry="18" />
          <ellipse cx="700" cy="455" rx="59" ry="19" />
          <ellipse cx="825" cy="402" rx="42" ry="14" />
        </g>
        <g fill="none" stroke="#4d913e" strokeLinecap="round" strokeWidth="10">
          <path d="M95 390 78 300M115 393 122 292M136 402 157 314" />
          <path d="M835 390 822 290M858 394 869 280M887 405 906 315" />
        </g>
        {showFrog ? (
          <g transform="translate(165 395)">
            <ellipse cx="0" cy="10" fill="#55b957" rx="34" ry="23" />
            <circle cx="-18" cy="-11" fill="#68ca63" r="13" />
            <circle cx="18" cy="-11" fill="#68ca63" r="13" />
            <circle cx="-18" cy="-13" fill="#172554" r="4" />
            <circle cx="18" cy="-13" fill="#172554" r="4" />
            <path d="M-13 9 Q0 20 13 9" fill="none" stroke="#185c38" strokeWidth="4" />
          </g>
        ) : null}
        {duckPositions.slice(0, line.duckCount).map(([x, y], index) => (
          <Duck delay={index * 90} key={`${x}-${y}`} playing={playing} x={x} y={y} />
        ))}
        {showMama ? <Duck delay={0} mama playing={playing} x={135} y={330} /> : null}
      </svg>
      <figcaption className={compact ? "sr-only" : "bg-white/90 px-4 py-2 text-center font-ui text-sm font-black text-brand-navy"}>
        {sceneDescriptions[line.visualBeat]}
      </figcaption>
    </figure>
  );
}
