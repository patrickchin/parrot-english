import { ArrowRight, BookOpen, MessageCircle, Play } from "lucide-react";
import { cx, InteractiveCardLink } from "../shared/ui";

const LEARNING_PATHS = [
  {
    description: "Listen and speak.",
    eyebrow: "Speak",
    icon: Play,
    label: "Play a lesson",
    tone: "rose",
    to: "/lessons",
  },
  {
    description: "Say hello and chat.",
    eyebrow: "Talk",
    icon: MessageCircle,
    label: "Talk to Peppa",
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    description: "Listen to a story.",
    eyebrow: "Listen",
    icon: BookOpen,
    label: "Story time",
    tone: "blue",
    to: "/stories",
  },
] as const;

export function HomeMenu() {
  return (
    <main className="grid h-dvh w-screen content-center overflow-x-hidden overflow-y-auto bg-home px-4 pb-5 pt-20 short:content-start short:pb-4 short:pt-17 sm:px-6 md:px-10 md:py-24 lg:px-16">
      <section className="mx-auto grid w-full max-w-5xl gap-5 short:gap-3.5 md:gap-9">
        <header className="mx-auto grid max-w-3xl gap-2 text-center short:gap-1 md:gap-3">
          <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-brand-blue sm:text-sm md:text-base">
            Parrot English
          </p>
          <h1 className="m-0 text-3xl leading-none tracking-tight text-brand-ink min-[360px]:text-4xl sm:text-5xl lg:text-7xl">
            What do you want to do?
          </h1>
          <p className="mx-auto m-0 max-w-2xl text-sm font-extrabold leading-snug text-brand-blue min-[360px]:text-base sm:text-xl">
            Tap one.
          </p>
        </header>

        <nav
          aria-label="Learning activities"
          className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6"
        >
          {LEARNING_PATHS.map(
            ({ description, eyebrow, icon: Icon, label, tone, to }) => (
              <InteractiveCardLink
                aria-label={label}
                className="grid min-h-28 grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 p-3 text-left short:min-h-24 short:grid-cols-[3rem_minmax(0,1fr)_2.5rem] short:gap-2.5 short:p-2.5 md:min-h-64 md:grid-cols-1 md:content-center md:justify-items-center md:gap-4 md:p-8 md:text-center"
                key={to}
                to={to}
              >
                <Icon
                  aria-hidden="true"
                  className={cx(
                    "size-14 rounded-2xl p-3.5 text-white short:size-12 short:p-3 md:size-20 md:p-5",
                    tone === "navy" && "bg-brand-navy shadow-control-navy",
                    tone === "rose" && "bg-brand-rose shadow-control-pink",
                    tone === "blue" && "bg-brand-blue shadow-control-navy",
                  )}
                />
                <span className="grid min-w-0 gap-0.5 md:justify-items-center md:gap-2">
                  <span className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-brand-blue md:text-xs">
                    {eyebrow}
                  </span>
                  <strong
                    className={cx(
                      "text-xl leading-tight min-[360px]:text-2xl md:text-4xl md:leading-none",
                      tone === "navy" && "text-brand-navy",
                      tone === "rose" && "text-brand-rose",
                      tone === "blue" && "text-brand-blue",
                    )}
                  >
                    {label}
                  </strong>
                  <span className="text-sm font-bold leading-snug text-slate-800 min-[360px]:text-base md:max-w-md md:text-lg md:leading-relaxed">
                    {description}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className={cx(
                    "size-11 rounded-full p-2.5 text-white short:size-10 short:p-2 md:mt-1 md:size-12 md:p-3",
                    tone === "navy" && "bg-brand-navy",
                    tone === "rose" && "bg-brand-rose",
                    tone === "blue" && "bg-brand-blue",
                  )}
                />
              </InteractiveCardLink>
            ),
          )}
        </nav>
      </section>
    </main>
  );
}
