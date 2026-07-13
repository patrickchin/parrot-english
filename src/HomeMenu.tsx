import { BookOpen, MessageCircle, Play, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";

const ACTIVITIES = [
  {
    description: "Have a friendly English conversation with Peppa.",
    disabled: false,
    icon: MessageCircle,
    label: "Talk to Peppa",
    to: "/talk-to-peppa",
  },
  {
    description: "Practice with Parrot lessons and learner-created lessons.",
    disabled: false,
    icon: Play,
    label: "Lessons",
    to: "/lessons",
  },
  {
    description: "Build a new lesson around what you want to practice.",
    disabled: false,
    icon: Plus,
    label: "Create a Lesson",
    to: "/lessons/my/create",
  },
  {
    description: "See how your English practice is growing.",
    disabled: true,
    icon: Sparkles,
    label: "Progress",
    to: "/progress",
  },
  {
    description: "Practice English by making and telling stories.",
    disabled: true,
    icon: BookOpen,
    label: "Storytelling",
    to: "/stories",
  },
] as const;

export function HomeMenu() {
  return (
    <main className="home-menu-page">
      <header className="home-menu-header">
        <h1>What would you like to practice?</h1>
      </header>
      <nav aria-label="Learning activities" className="home-menu-grid">
        {ACTIVITIES.map(({ description, disabled, icon: Icon, label, to }) => {
          const content = (
            <>
              <Icon aria-hidden="true" />
              <strong>{label}</strong>
              <span>
                {description}
                {disabled ? (
                  <small className="home-menu-card-status">Coming soon</small>
                ) : null}
              </span>
            </>
          );

          return disabled ? (
            <button
              aria-label={`${label}, coming soon`}
              className="home-menu-card"
              disabled
              key={to}
              type="button"
            >
              {content}
            </button>
          ) : (
            <Link className="home-menu-card" key={to} to={to}>
              {content}
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
