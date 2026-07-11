import { BookOpen, Play, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";

const ACTIVITIES = [
  {
    description: "Practice with Parrot lessons and learner-created lessons.",
    icon: Play,
    label: "Lessons",
    to: "/lessons",
  },
  {
    description: "Build a new lesson around what you want to practice.",
    icon: Plus,
    label: "Create a Lesson",
    to: "/lessons/my/create",
  },
  {
    description: "See how your English practice is growing.",
    icon: Sparkles,
    label: "Progress",
    to: "/progress",
  },
  {
    description: "Practice English by making and telling stories.",
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
        {ACTIVITIES.map(({ description, icon: Icon, label, to }) => (
          <Link className="home-menu-card" key={to} to={to}>
            <Icon aria-hidden="true" />
            <strong>{label}</strong>
            <span>{description}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
