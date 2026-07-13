import { ActionLink } from "../shared/ui";

export function FeaturePlaceholder({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="grid h-dvh w-screen place-items-start overflow-y-auto bg-placeholder px-4 pb-10 pt-40 md:place-items-center md:px-6 md:pb-12 md:pt-32">
      <section className="my-auto grid w-full max-w-2xl justify-items-center gap-4 rounded-3xl border-4 border-white bg-white/95 p-8 text-center shadow-card sm:p-12">
        <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-6xl">
          {title}
        </h1>
        <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600">
          {description}
        </p>
        <ActionLink className="rounded-full border-4 border-white" to="/">
          Back to main menu
        </ActionLink>
      </section>
    </main>
  );
}
