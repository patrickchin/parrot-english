import { useEffect, useId, useState } from "react";
import { DUB_LINES, type DubLine } from "./dub-script.ts";

const sceneDescriptions = {
  depart: "The ducklings set out together.",
  hill: "The flock swims toward a green hill.",
  "mother-calls": "Mother duck calls for the ducklings.",
  return: "The ducklings come back to the pond.",
  "none-return": "No ducklings come back to the pond.",
  "sad-mother-depart": "Sad mother duck sets out alone.",
  "sad-mother-hill": "Sad mother duck travels over the hill.",
  "sad-mother-calls": "Sad mother duck calls for the ducklings.",
  "five-return": "All five ducklings come back to mother duck.",
} as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function Duck({
  actor,
  bodyFill,
  delay,
  mama = false,
  playing,
  pose,
  reducedMotion,
  visible = true,
  x,
  y,
}: {
  actor: "mother" | `duckling-${number}`;
  bodyFill: string;
  delay: number;
  mama?: boolean;
  playing: boolean;
  pose: string;
  reducedMotion: boolean;
  visible?: boolean;
  x: number;
  y: number;
}) {
  const calling = pose.includes("call");
  const sad = pose.startsWith("sad");
  const walking = pose.includes("walk");
  const scale = mama ? 1.28 : y > 370 ? 1.02 : 0.9;
  const motion = calling ? "call" : walking ? "walk" : "swim";
  const transform = `translate(${x}px, ${y}px) scale(${scale})`;

  return (
    <g
      className={playing ? "transition-[transform,opacity] duration-700 ease-out motion-reduce:transition-none" : undefined}
      data-duck-actor={actor}
      data-expression={sad ? "sad" : "bright"}
      data-pose={pose}
      opacity={visible ? 1 : 0}
      style={{ opacity: visible ? 1 : 0, transform, transformOrigin: "0 0" }}
      transform={`translate(${x} ${y}) scale(${scale})`}
    >
      <ellipse cx="0" cy="43" fill="#16475c" opacity=".16" rx="55" ry="11" />
      <g>
        {playing && !reducedMotion && visible ? (
          <animateTransform
            attributeName="transform"
            begin={`${delay}ms`}
            calcMode="spline"
            data-motion={motion}
            dur={calling ? "540ms" : walking ? "720ms" : "1700ms"}
            keySplines={calling ? ".4 0 .2 1;.4 0 .2 1;.4 0 .2 1" : ".4 0 .2 1;.4 0 .2 1"}
            repeatCount="indefinite"
            type="translate"
            values={calling ? "0 0; -5 -3; 3 0; 0 0" : walking ? "0 0; 4 -5; 0 0" : "0 0; 0 -5; 0 0"}
          />
        ) : null}

        <path
          d="M-40 18 Q-73 -4 -63 30 Q-47 38 -27 31Z"
          fill="#efb631"
          stroke="#173c67"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <path
          d="M-47 17 Q-43 -12 -12 -29 Q20 -30 43 -15 Q62 0 55 22 Q51 45 20 51 Q-9 50 -34 43 Q-51 34 -47 17Z"
          fill={bodyFill}
          stroke="#173c67"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <path d="M-31 30 Q8 49 43 28" fill="none" opacity=".25" stroke="#a86e18" strokeLinecap="round" strokeWidth="5" />

        <g>
          {playing && !reducedMotion && visible ? (
            <animateTransform
              attributeName="transform"
              begin={`${delay + 120}ms`}
              data-motion="wing"
              dur={calling ? "520ms" : "1250ms"}
              repeatCount="indefinite"
              type="rotate"
              values={calling ? "0 -4 13;-18 -4 13;4 -4 13;0 -4 13" : "0 -4 13;-7 -4 13;0 -4 13"}
            />
          ) : null}
          <path
            d="M-25 8 Q2 -9 31 12 Q17 38 -19 30 Q-5 20 -25 8Z"
            fill={mama ? "#e9a82b" : "#efbb35"}
            stroke="#173c67"
            strokeLinejoin="round"
            strokeWidth="4"
          />
          <path d="M-8 9 Q4 19 23 17" fill="none" opacity=".45" stroke="#fff3b5" strokeLinecap="round" strokeWidth="4" />
        </g>

        <path
          d={sad ? "M21 -17 Q29 -49 43 -56" : "M21 -16 Q28 -48 44 -52"}
          fill="none"
          stroke={bodyFill}
          strokeLinecap="round"
          strokeWidth="25"
        />
        <circle cx="45" cy="-55" fill={bodyFill} r="27" stroke="#173c67" strokeWidth="5" />
        {mama ? (
          <path d="M30 -79 Q41 -96 49 -79 Q61 -96 66 -74" fill="#df9b24" stroke="#173c67" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        ) : null}

        <circle cx="52" cy="-61" fill="white" r="8" />
        <circle cx="55" cy="-61" fill="#172554" r="4" />
        <circle cx="56" cy="-63" fill="white" r="1.3" />
        {sad ? (
          <>
            <path d="M43 -73 59 -68" fill="none" stroke="#173c67" strokeLinecap="round" strokeWidth="4" />
            <path data-effect="tear" d="M59 -53 Q67 -43 59 -38 Q51 -43 59 -53Z" fill="#5ed7f2" stroke="#173c67" strokeWidth="2" />
          </>
        ) : (
          <path d="M44 -72 Q54 -76 62 -70" fill="none" stroke="#173c67" strokeLinecap="round" strokeWidth="3" />
        )}
        <circle cx="43" cy="-47" fill="#f39b83" opacity=".65" r="5" />

        {calling ? (
          <>
            <path d="M65 -61 91 -71 66 -52Z" fill="#f47b20" stroke="#173c67" strokeLinejoin="round" strokeWidth="4" />
            <path d="M66 -51 91 -47 67 -42Z" fill="#ef5d22" stroke="#173c67" strokeLinejoin="round" strokeWidth="4" />
          </>
        ) : (
          <path d="M65 -60 94 -51 66 -43Z" fill="#f47b20" stroke="#173c67" strokeLinejoin="round" strokeWidth="4" />
        )}

        {calling ? (
          <g data-effect="call-rings" fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="5">
            <path d="M103 -69 Q123 -58 105 -41" opacity=".9">
              {playing && !reducedMotion && visible ? <animate attributeName="opacity" data-motion="call" dur="900ms" repeatCount="indefinite" values=".2;1;.2" /> : null}
            </path>
            <path d="M117 -83 Q153 -59 120 -27" opacity=".55">
              {playing && !reducedMotion && visible ? <animate attributeName="opacity" begin="160ms" data-motion="call" dur="900ms" repeatCount="indefinite" values=".15;.8;.15" /> : null}
            </path>
          </g>
        ) : null}
      </g>
    </g>
  );
}

function Celebration({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const pieces = [
    [285, 105, "#ff467b"], [355, 148, "#ffd84d"], [470, 94, "#7b61ff"],
    [585, 145, "#ff8c42"], [680, 88, "#ff467b"], [770, 143, "#ffd84d"],
  ] as const;
  return (
    <g data-effect="celebration">
      {pieces.map(([x, y, fill], index) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          {playing && !reducedMotion ? (
            <animateTransform
              additive="sum"
              attributeName="transform"
              begin={`${index * 90}ms`}
              data-motion="celebrate"
              dur="1800ms"
              repeatCount="indefinite"
              type="translate"
              values="0 0; 8 28; -4 58"
            />
          ) : null}
          <path d="M0 0 8 4 4 13 -4 8Z" fill={fill} transform={`rotate(${index * 27})`} />
        </g>
      ))}
    </g>
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
  const id = useId();
  const reducedMotion = usePrefersReducedMotion();
  const skyGradientId = `${id}-sky`;
  const pondGradientId = `${id}-pond`;
  const duckGradientId = `${id}-duck`;
  const mamaGradientId = `${id}-mama`;
  const sad = line.visualBeat.startsWith("sad-mother");
  const showMama = line.visualBeat === "mother-calls"
    || sad
    || line.visualBeat.endsWith("return");
  const hillPositions = [
    [330, 305],
    [445, 270],
    [560, 305],
    [675, 275],
    [795, 315],
  ] as const;
  const returnPositions = [
    [275, 350],
    [400, 390],
    [520, 340],
    [645, 390],
    [770, 345],
  ] as const;
  const motherIsCalling = line.visualBeat.endsWith("mother-calls");
  const duckPositions = line.visualBeat.includes("hill") || motherIsCalling
    ? hillPositions
    : line.visualBeat.includes("depart")
      ? [[330, 380], [450, 345], [570, 375], [690, 325], [820, 360]] as const
      : returnPositions;
  const ducklingPose = motherIsCalling ? "wait" : line.visualBeat;
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
    ? [285, 370] as const
    : line.visualBeat === "sad-mother-hill"
      ? [500, 270] as const
      : line.visualBeat.includes("calls")
        ? [150, 350] as const
        : [135, 350] as const;
  const animate = playing && !reducedMotion && !thumbnail;

  const art = (
    <svg
      aria-hidden="true"
      className="block h-full min-h-0 w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 960 540"
    >
      <defs>
        <linearGradient id={skyGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={sad ? "#80b7db" : "#71caf3"} />
          <stop offset=".62" stopColor={sad ? "#c7d7df" : "#c7efff"} />
          <stop offset="1" stopColor={sad ? "#ead7b2" : "#ffe4a8"} />
        </linearGradient>
        <linearGradient id={pondGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#50c8e6" />
          <stop offset="1" stopColor="#1687bd" />
        </linearGradient>
        <linearGradient id={duckGradientId} x1="0" x2=".8" y1="0" y2="1">
          <stop offset="0" stopColor="#fff38a" />
          <stop offset="1" stopColor="#f5c43c" />
        </linearGradient>
        <linearGradient id={mamaGradientId} x1="0" x2=".8" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd267" />
          <stop offset="1" stopColor="#e6a32b" />
        </linearGradient>
      </defs>

      <g data-story-layer="sky">
        <rect fill={`url(#${skyGradientId})`} height="540" width="960" />
        <circle cx="810" cy="92" fill="#fff9cc" opacity=".35" r="78" />
        <circle cx="810" cy="92" fill="#ffe66d" r="48" />
        <g fill="#fff" opacity={sad ? ".62" : ".82"}>
          <g transform="translate(120 100)">
            {animate ? <animateTransform additive="sum" attributeName="transform" data-motion="drift" dur="18s" repeatCount="indefinite" type="translate" values="0 0;35 0;0 0" /> : null}
            <ellipse cx="0" cy="14" rx="58" ry="20" />
            <circle cx="-24" cy="0" r="25" />
            <circle cx="14" cy="-7" r="32" />
            <circle cx="47" cy="7" r="22" />
          </g>
          <g transform="translate(540 74) scale(.72)">
            {animate ? <animateTransform additive="sum" attributeName="transform" data-motion="drift" dur="22s" repeatCount="indefinite" type="translate" values="0 0;-40 0;0 0" /> : null}
            <ellipse cx="0" cy="14" rx="58" ry="20" />
            <circle cx="-24" cy="0" r="25" />
            <circle cx="14" cy="-7" r="32" />
            <circle cx="47" cy="7" r="22" />
          </g>
        </g>
      </g>

      <g data-story-layer="hills">
        <path d="M0 303 Q130 148 300 294 Q452 95 665 295 Q805 172 960 274 V394 H0Z" fill="#8acb72" />
        <path d="M0 320 Q145 221 320 316 Q520 176 738 321 Q850 250 960 300 V404 H0Z" fill="#55ad62" />
        <path d="M458 252 Q520 157 583 252Z" fill="#6dba68" />
        <path d="M505 223 Q520 192 539 222" fill="none" stroke="#eef7cf" strokeLinecap="round" strokeWidth="7" />
        <g fill="#318555" stroke="#246b4a" strokeWidth="3">
          <path d="M84 283 112 224 140 283Z" />
          <path d="M760 288 794 213 828 288Z" />
          <path d="M845 300 870 245 895 300Z" />
        </g>
      </g>

      <g data-story-layer="pond">
        <path d="M0 385 Q120 350 236 376 Q390 331 524 374 Q700 330 960 376 V540 H0Z" fill="#84c967" />
        <ellipse cx="495" cy="432" fill={`url(#${pondGradientId})`} rx="426" ry="120" />
        <path d="M104 416 Q235 380 356 414 M560 450 Q710 409 852 442" fill="none" opacity=".52" stroke="#dffbff" strokeLinecap="round" strokeWidth="8" />
        <ellipse cx="500" cy="435" fill="none" opacity=".45" rx="342" ry="76" stroke="#c9f7ff" strokeWidth="7">
          {animate ? <animate attributeName="opacity" data-motion="ripple" dur="1900ms" repeatCount="indefinite" values=".18;.62;.18" /> : null}
        </ellipse>
        <g fill="#4eaf55">
          <ellipse cx="172" cy="447" rx="52" ry="16" />
          <ellipse cx="696" cy="472" rx="59" ry="18" />
          <ellipse cx="829" cy="418" rx="43" ry="14" />
        </g>
        <g fill="#f6c54b">
          <circle cx="160" cy="440" r="5" />
          <circle cx="689" cy="465" r="5" />
        </g>
      </g>

      {line.visualBeat === "five-return" ? <Celebration playing={animate} reducedMotion={reducedMotion} /> : null}

      {duckPositions.map(([x, y], index) => (
        <Duck
          actor={`duckling-${index + 1}`}
          bodyFill={`url(#${duckGradientId})`}
          delay={index * 120}
          key={`duckling-${index + 1}`}
          playing={animate}
          pose={ducklingPose}
          reducedMotion={reducedMotion}
          visible={index < line.duckCount}
          x={x}
          y={y}
        />
      ))}
      <Duck
        actor="mother"
        bodyFill={`url(#${mamaGradientId})`}
        delay={0}
        mama
        playing={animate}
        pose={motherPose}
        reducedMotion={reducedMotion}
        visible={showMama}
        x={motherPosition[0]}
        y={motherPosition[1]}
      />

      <g data-story-layer="foreground">
        <path d="M0 493 Q92 468 185 503 Q287 474 382 511 Q514 477 626 506 Q755 474 960 505 V540 H0Z" fill="#3f9a53" />
        <g fill="none" stroke="#287a4b" strokeLinecap="round" strokeWidth="8">
          <path d="M45 518 34 454M66 520 76 443M91 522 113 465" />
          <path d="M860 521 845 451M882 520 893 440M912 522 930 467" />
        </g>
        <g fill="#ffdf55" stroke="#fff7be" strokeWidth="3">
          <circle cx="34" cy="454" r="7" />
          <circle cx="893" cy="440" r="7" />
        </g>
      </g>
    </svg>
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
