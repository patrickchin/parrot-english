import { Link } from "react-router";

export function FeaturePlaceholder({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="feature-placeholder-page">
      <section className="feature-placeholder-card">
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="main-menu-link" to="/">
          Back to main menu
        </Link>
      </section>
    </main>
  );
}
