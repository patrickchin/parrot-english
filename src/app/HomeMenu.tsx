import { BookOpen, MessageCircle, Play } from "lucide-react";
import { cx, InteractiveCardLink } from "../shared/ui";

const LEARNING_PATHS = [
  {
    description: "Have a friendly English conversation about the things you like.",
    eyebrow: "Free conversation",
    icon: MessageCircle,
    label: "Talk to Peppa",
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    description: "Follow a short story, listen to the characters, and practice speaking out loud.",
    eyebrow: "Speak and repeat",
    icon: Play,
    label: "Speaking lessons",
    tone: "rose",
    to: "/lessons",
  },
  {
    description: "Choose a story at your level, listen page by page, and join in with simple lines.",
    eyebrow: "Listen and join in",
    icon: BookOpen,
    label: "Story time",
    tone: "blue",
    to: "/stories",
  },
] as const;

export function HomeMenu() {
  return (
    <main className="grid min-h-dvh w-screen content-center overflow-x-hidden bg-home px-4 py-24 sm:px-6 md:px-10 lg:px-16">
      <section className="mx-auto grid w-full max-w-5xl gap-7 md:gap-10">
        <header className="mx-auto grid max-w-3xl gap-3 text-center">
          <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-brand-blue sm:text-base">
            Parrot English
          </p>
          <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-5xl lg:text-7xl">
            Choose how you want to practice
          </h1>
          <p className="mx-auto m-0 max-w-2xl text-base font-extrabold leading-relaxed text-brand-blue sm:text-xl">
            Pick one activity and start learning in English.
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
                className="grid min-h-56 content-center justify-items-center gap-4 p-7 text-center sm:min-h-64 sm:p-9"
                key={to}
                to={to}
              >
                <Icon
                  aria-hidden="true"
                  className={cx(
                    "size-16 rounded-2xl p-4 text-white sm:size-20 sm:p-5",
                    tone === "navy" && "bg-brand-navy shadow-control-navy",
                    tone === "rose" && "bg-brand-rose shadow-control-pink",
                    tone === "blue" && "bg-brand-blue shadow-control-navy",
                  )}
                />
                <span className="text-xs font-black uppercase tracking-[0.16em] text-brand-blue">
                  {eyebrow}
                </span>
                <strong
                  className={cx(
                    "text-3xl leading-none sm:text-4xl",
                    tone === "navy" && "text-brand-navy",
                    tone === "rose" && "text-brand-rose",
                    tone === "blue" && "text-brand-blue",
                  )}
                >
                  {label}
                </strong>
                <span className="max-w-md font-bold leading-relaxed text-slate-800 sm:text-lg">
                  {description}
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-1 rounded-full px-5 py-3 font-black text-white",
                    tone === "navy" && "bg-brand-navy",
                    tone === "rose" && "bg-brand-rose",
                    tone === "blue" && "bg-brand-blue",
                  )}
                >
                  Start
                </span>
              </InteractiveCardLink>
            ),
          )}
        </nav>
      </section>
    </main>
  );
}
