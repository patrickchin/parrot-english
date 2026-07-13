import { BookOpen, MessageCircle, Play, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { cx } from "./ui";

const ACTIVITIES = [
  {
    description: "Have a friendly English conversation with Peppa.",
    icon: MessageCircle,
    label: "Talk to Peppa",
    tone: "navy",
    to: "/talk-to-peppa",
  },
  {
    description: "Practice with Parrot lessons and learner-created lessons.",
    icon: Play,
    label: "Lessons",
    tone: "rose",
    to: "/lessons",
  },
  {
    description: "Build a new lesson around what you want to practice.",
    icon: Plus,
    label: "Create a Lesson",
    tone: "green",
    to: "/lessons/my/create",
  },
  {
    description: "See how your English practice is growing.",
    icon: Sparkles,
    label: "Progress",
    tone: "amber",
    to: "/progress",
  },
  {
    description: "Practice English by making and telling stories.",
    icon: BookOpen,
    label: "Storytelling",
    tone: "navy",
    to: "/stories",
  },
] as const;

export function HomeMenu() {
  return (
    <main className="h-dvh w-screen overflow-x-hidden overflow-y-auto bg-home px-4 pb-10 pt-40 md:px-8 md:pb-14 md:pt-32 lg:px-16">
      <header className="mx-auto mb-6 w-full max-w-5xl text-center md:mb-10">
        <h1 className="m-0 text-4xl leading-none tracking-tight text-brand-ink sm:text-5xl lg:text-7xl">
          What would you like to practice?
        </h1>
      </header>
      <nav
        aria-label="Learning activities"
        className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-6"
      >
        {ACTIVITIES.map(({ description, icon: Icon, label, to, tone }) => (
          <Link
            className="flex min-h-36 items-center gap-4 rounded-3xl border-4 border-white bg-white/95 p-5 text-slate-900 no-underline shadow-card transition hover:-translate-y-1 hover:brightness-105 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-navy md:min-h-52 md:gap-5 md:p-8"
            key={to}
            to={to}
          >
            <Icon
              aria-hidden="true"
              className={cx(
                "size-14 shrink-0 rounded-2xl p-3 text-white shadow-control-navy md:size-18 md:p-4",
                tone === "navy" && "bg-brand-navy",
                tone === "rose" && "bg-brand-rose",
                tone === "green" && "bg-brand-green",
                tone === "amber" && "bg-amber-600",
              )}
            />
            <span className="grid gap-2">
              <strong
                className={cx(
                  "text-2xl leading-tight md:text-3xl",
                  tone === "navy" && "text-brand-navy",
                  tone === "rose" && "text-brand-rose",
                  tone === "green" && "text-brand-green",
                  tone === "amber" && "text-amber-700",
                )}
              >
                {label}
              </strong>
              <span className="font-bold leading-relaxed">{description}</span>
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
