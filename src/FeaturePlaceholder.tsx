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
    <main>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link to="/">Back to main menu</Link>
    </main>
  );
}
