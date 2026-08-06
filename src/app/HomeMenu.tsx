import {
  BookOpen,
  Gamepad2,
  MessageCircle,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  cx,
  InteractiveCardButton,
  InteractiveCardLink,
} from "../shared/ui";

const PRIMARY_ACTIVITIES = [
  {
    badge: null,
    description: "Chat freely about things you like.",
    icon: MessageCircle,
    label: "Talk to Peppa",
    reloadDocument: false,
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    badge: null,
    description: "Follow a story and practice speaking step by step.",
    icon: Play,
    label: "Lessons",
    reloadDocument: false,
    tone: "rose",
    to: "/lessons",
  },
  {
    badge: "New",
    description: "Choose a story, listen, and join in.",
    icon: BookOpen,
    label: "Storytelling",
    reloadDocument: false,
    tone: "blue",
    to: "/stories",
  },
  {
    badge: "Proof of concept",
    description: "Explore the pixel garden and move Peppa around.",
    icon: Gamepad2,
    label: "Game",
    reloadDocument: true,
    tone: "navy",
    to: "/prototypes/pixel-stage/",
  },
  {
    badge: "Grown-up tools",
    description: "Build a custom speaking lesson with a visual editor.",
    icon: Plus,
    label: "Create a Lesson",
    reloadDocument: false,
    tone: "green",
    to: "/lessons/my/create",
  },
] as const;

const UPCOMING_ACTIVITIES = [
  {
    icon: Sparkles,
    label: "Progress",
    tone: "amber",
  },
] as const;

export function HomeMenu() {
  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-home px-4 pb-10 pt-24 short:pt-20 md:px-8 md:pb-14 md:pt-32 lg:px-16">
      <header className="mx-auto mb-6 w-full max-w-7xl text-center md:mb-10">
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-5xl lg:text-7xl">
          What do you want to do today?
        </h1>
      </header>
      <nav
        aria-label="Learning activities"
        className="mx-auto w-full max-w-7xl"
      >
        <div className="grid grid-cols-1 gap-4 md:auto-rows-fr md:grid-cols-2 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
          {PRIMARY_ACTIVITIES.map(
            ({
              badge,
              description,
              icon: Icon,
              label,
              reloadDocument,
              to,
              tone,
            }) => (
              <InteractiveCardLink
                className="grid min-h-40 grid-cols-[auto_minmax(0,1fr)] content-center items-center gap-x-4 gap-y-3 p-5 md:min-h-56 md:gap-x-6 md:p-8 lg:grid-cols-1 lg:justify-items-center lg:text-center"
                key={to}
                reloadDocument={reloadDocument}
                to={to}
              >
                <Icon
                  aria-hidden="true"
                  className={cx(
                    "size-13 shrink-0 rounded-2xl p-3 text-white shadow-control-navy sm:size-14 md:size-18 md:p-4",
                    tone === "navy" && "bg-brand-navy",
                    tone === "rose" && "bg-brand-rose",
                    tone === "green" && "bg-brand-green",
                    tone === "blue" && "bg-brand-blue",
                  )}
                />
                <strong
                  className={cx(
                    "text-2xl leading-tight md:text-3xl",
                    tone === "navy" && "text-brand-navy",
                    tone === "rose" && "text-brand-rose",
                    tone === "green" && "text-brand-green",
                    tone === "blue" && "text-brand-blue",
                  )}
                >
                  {label}
                </strong>
                <span className="col-span-2 w-full font-bold leading-relaxed md:col-span-1 md:col-start-2 lg:col-start-1">
                  {description}
                </span>
                {badge ? (
                  <small className="col-span-2 w-fit rounded-full bg-brand-navy px-3 py-1 text-xs font-black uppercase tracking-wider text-white md:col-start-2 lg:col-span-1 lg:col-start-1">
                    {badge}
                  </small>
                ) : null}
              </InteractiveCardLink>
            ),
          )}
        </div>

        <section
          aria-labelledby="upcoming-activities-title"
          className="mt-7 md:mt-9"
        >
          <h2
            className="mb-3 mt-0 text-center text-xl leading-tight text-brand-navy md:mb-4 md:text-2xl"
            id="upcoming-activities-title"
          >
            More to explore
          </h2>
          <div className="mx-auto grid max-w-xl grid-cols-1 gap-3 md:gap-5">
            {UPCOMING_ACTIVITIES.map(({ icon: Icon, label, tone }) => (
              <InteractiveCardButton
                aria-label={`${label}, coming soon`}
                className="flex min-h-24 w-full items-center gap-4 p-4 text-left min-[360px]:min-h-36 min-[360px]:flex-col min-[360px]:justify-center min-[360px]:gap-2 min-[360px]:text-center md:min-h-40"
                disabled
                key={label}
                tone="muted"
                type="button"
              >
                <Icon
                  aria-hidden="true"
                  className={cx(
                    "size-11 shrink-0 rounded-xl p-2.5 text-white shadow-control-navy",
                    tone === "amber" && "bg-amber-500",
                  )}
                />
                <span className="grid gap-1">
                  <strong className="text-xl leading-tight">{label}</strong>
                  <small className="w-fit rounded-full bg-brand-navy px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white min-[360px]:mx-auto">
                    Coming soon
                  </small>
                </span>
              </InteractiveCardButton>
            ))}
          </div>
        </section>
      </nav>
    </main>
  );
}
