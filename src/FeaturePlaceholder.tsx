import { Link } from "react-router";

export function FeaturePlaceholder({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="feature-placeholder-page">
      <section className="feature-placeholder-card">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="main-menu-link" to="/">
          Back to main menu
        </Link>
      </section>
    </main>
  );
}
