import {
  CircleHelp,
  Headphones,
  MessageCircle,
  Mic2,
  Play,
} from "lucide-react";
import { NURSERY_RHYMES_COVER_ARTWORK } from "../dubbing/dub-artwork";
import { cx, InteractiveCardLink } from "../shared/ui";
import { getNurseryRhymesPath } from "./app-routes";
import { LESSON_LEARNING_PATH } from "./learning-paths";
import { resolveWordGameTopic } from "../games/word-game-catalog";

const WORD_GAME_HOME_ARTWORK = resolveWordGameTopic("animals")?.items[0].visual;

type LearningPath = {
  accessibleLabel: string;
  icon: typeof Play;
  imageClassName: string;
  imageHeight: number;
  imageSrc: string;
  imageWidth: number;
  label: string;
  tone: "blue" | "navy" | "rose";
  to: string;
};

const LEARNING_PATHS: readonly LearningPath[] = [
  {
    accessibleLabel: LESSON_LEARNING_PATH.label,
    icon: Play,
    ...LESSON_LEARNING_PATH,
    label: "Lessons",
    tone: "rose",
  },
  {
    accessibleLabel: "Talk to Peppa",
    icon: MessageCircle,
    imageClassName: "object-contain p-1.5",
    imageHeight: 384,
    imageSrc: "https://media.parrotbook.com/assets/v3/characters/peppa/peppa-talking-384.webp",
    imageWidth: 384,
    label: "Talk to Peppa",
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    accessibleLabel: "Story time",
    icon: Headphones,
    imageClassName: "object-cover",
    imageHeight: 512,
    imageSrc: "https://media.parrotbook.com/assets/v3/story-pages/the-red-ball-my-red-ball.webp",
    imageWidth: 768,
    label: "Story time",
    tone: "blue",
    to: "/stories",
  },
  {
    accessibleLabel: "Nursery rhymes",
    icon: Mic2,
    imageClassName: "object-cover",
    imageHeight: NURSERY_RHYMES_COVER_ARTWORK.height,
    imageSrc: NURSERY_RHYMES_COVER_ARTWORK.src,
    imageWidth: NURSERY_RHYMES_COVER_ARTWORK.width,
    label: "Nursery rhymes",
    tone: "rose",
    to: getNurseryRhymesPath(),
  },
  {
    accessibleLabel: "Play word game",
    icon: CircleHelp,
    imageClassName: "object-cover",
    imageHeight: 1024,
    imageSrc:
      WORD_GAME_HOME_ARTWORK?.kind === "image" ? WORD_GAME_HOME_ARTWORK.src : "",
    imageWidth: 1536,
    label: "Word game",
    tone: "navy",
    to: "/word-games",
  },
];

export function HomeMenu() {
  return (
    <main className="grid h-dvh w-screen content-center overflow-x-hidden overflow-y-auto bg-home px-4 pb-5 pt-20 short:content-start short:pb-3 short:pt-15 short-wide:!pb-0 short-wide:!pt-12 sm:px-6 md:px-10 md:py-24 lg:px-6">
      <section className="mx-auto grid w-full max-w-7xl gap-5 short:gap-2 short-wide:!gap-2 md:gap-9">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink short:!text-[2rem] short-wide:!text-[2rem] min-[360px]:text-4xl sm:text-5xl lg:text-7xl">
            Parrot English
          </h1>
        </header>

        <nav aria-label="Learning activities" className="grid grid-cols-2 gap-3 short:gap-2 short-wide:grid-cols-5 short-wide:!gap-2 md:grid-cols-3 md:gap-6 xl:grid-cols-5">
          {LEARNING_PATHS.map(({
            accessibleLabel,
            icon: Icon,
            imageClassName,
            imageHeight,
            imageSrc,
            imageWidth,
            label,
            tone,
            to,
          }) => (
            <InteractiveCardLink
              aria-label={accessibleLabel}
              className="grid min-h-40 grid-cols-1 content-stretch items-center gap-2 overflow-hidden p-2 text-center short:min-h-24 short:gap-1.5 short:p-1.5 short-wide:min-h-24 short-wide:gap-1.5 short-wide:p-1.5 md:min-h-72 md:gap-4 md:p-4 xl:min-h-0"
              key={to}
              to={to}
            >
              <div className="relative h-28 w-full overflow-hidden rounded-2xl md:aspect-[3/2] md:h-auto">
                <img alt="" className={cx("size-full", imageClassName)} decoding="async" height={imageHeight} src={imageSrc} width={imageWidth} />
                <span aria-hidden="true" className={cx("absolute bottom-1 right-1 grid size-8 place-items-center rounded-full border-2 border-white text-white shadow-sm md:size-11", tone === "navy" && "bg-brand-navy", tone === "rose" && "bg-brand-rose", tone === "blue" && "bg-brand-blue")}>
                  <Icon className="size-4 md:size-5" />
                </span>
              </div>
              <span className="grid w-full min-w-0 items-center">
                <strong className={cx("min-w-0 text-lg leading-tight md:whitespace-nowrap md:text-2xl xl:text-lg 2xl:text-2xl", tone === "navy" && "text-brand-navy", tone === "rose" && "text-brand-rose", tone === "blue" && "text-brand-blue")}>
                  {label}
                </strong>
              </span>
            </InteractiveCardLink>
          ))}
        </nav>
      </section>
    </main>
  );
}
