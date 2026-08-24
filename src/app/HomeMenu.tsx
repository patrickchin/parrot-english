import { ArrowRight, Headphones, MessageCircle, Play } from "lucide-react";
import { cx, InteractiveCardLink } from "../shared/ui";
import { LESSON_LEARNING_PATH } from "./learning-paths";

type LearningPath = {
  icon: typeof Play;
  imageAlt?: string;
  imageClassName: string;
  imageHeight: number;
  imageSizes?: string;
  imageSrc: string;
  imageSrcSet?: string;
  imageWidth: number;
  label: string;
  tone: "blue" | "navy" | "rose";
  to: string;
};

const LEARNING_PATHS: readonly LearningPath[] = [
  {
    icon: Play,
    ...LESSON_LEARNING_PATH,
    tone: "rose",
  },
  {
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
    icon: Headphones,
    imageClassName: "object-cover",
    imageHeight: 512,
    imageSrc: "https://media.parrotbook.com/assets/v3/story-pages/the-red-ball-my-red-ball.webp",
    imageWidth: 768,
    label: "Story time",
    tone: "blue",
    to: "/stories",
  },
];

export function HomeMenu() {
  return (
    <main className="grid h-dvh w-screen content-center overflow-x-hidden overflow-y-auto bg-home px-4 pb-5 pt-20 short:content-start short:pb-4 short:pt-17 sm:px-6 md:px-10 md:py-24 lg:px-16">
      <section className="mx-auto grid w-full max-w-5xl gap-5 short:gap-3.5 md:gap-9">
        <header className="mx-auto grid max-w-3xl gap-2 text-center short:gap-1 md:gap-3">
          <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-brand-blue sm:text-sm md:text-base">
            Parrot English
          </p>
          <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink min-[360px]:text-4xl sm:text-5xl lg:text-7xl">
            Tap a picture.
          </h1>
        </header>

        <nav
          aria-label="Learning activities"
          className="grid grid-cols-1 gap-4 short-wide:grid-cols-3 short-wide:gap-3 md:grid-cols-3 md:gap-6"
        >
          {LEARNING_PATHS.map(
            ({
              icon: Icon,
              imageClassName,
              imageHeight,
              imageSizes,
              imageSrc,
              imageSrcSet,
              imageWidth,
              label,
              tone,
              to,
            }) => (
              <InteractiveCardLink
                aria-label={label}
                className="grid min-h-24 grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden p-2.5 text-left short:grid-cols-[4rem_minmax(0,1fr)] short:gap-2 short:p-2 short-wide:!min-h-32 short-wide:!grid-cols-1 short-wide:!content-stretch short-wide:!gap-2 short-wide:!p-2.5 short-wide:!text-center md:min-h-64 md:grid-cols-1 md:content-stretch md:gap-4 md:p-4 md:text-center"
                key={to}
                to={to}
              >
                <span
                  className={cx(
                    "relative size-20 overflow-hidden rounded-2xl bg-sky-100 short:size-16 short-wide:!h-20 short-wide:!w-28 md:aspect-[3/2] md:h-auto md:w-full",
                    tone === "navy" && "bg-pink-100",
                  )}
                >
                  <img
                    alt=""
                    className={cx("size-full", imageClassName)}
                    decoding="async"
                    height={imageHeight}
                    sizes={imageSizes}
                    src={imageSrc}
                    srcSet={imageSrcSet}
                    width={imageWidth}
                  />
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute bottom-1 right-1 grid size-7 place-items-center rounded-full border-2 border-white text-white shadow-sm md:size-10",
                      tone === "navy" && "bg-brand-navy",
                      tone === "rose" && "bg-brand-rose",
                      tone === "blue" && "bg-brand-blue",
                    )}
                  >
                    <Icon className="size-3.5 md:size-5" />
                  </span>
                </span>

                <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 short-wide:w-full md:w-full">
                  <strong
                    className={cx(
                      "text-xl leading-tight min-[360px]:text-2xl md:text-3xl md:leading-none",
                      tone === "navy" && "text-brand-navy",
                      tone === "rose" && "text-brand-rose",
                      tone === "blue" && "text-brand-blue",
                    )}
                  >
                    {label}
                  </strong>
                  <ArrowRight
                    aria-hidden="true"
                    className={cx(
                      "size-10 shrink-0 rounded-full p-2 text-white md:size-11 md:p-2.5",
                      tone === "navy" && "bg-brand-navy",
                      tone === "rose" && "bg-brand-rose",
                      tone === "blue" && "bg-brand-blue",
                    )}
                  />
                </span>
              </InteractiveCardLink>
            ),
          )}
        </nav>
      </section>
    </main>
  );
}
