import { ActionButton, ActionLink } from "../shared/ui";

export function FeaturePlaceholder({
  actionLabel = "Back to home",
  actionTo = "/",
  busy = false,
  description,
  onRetry,
  secondaryActionLabel,
  secondaryActionTo,
  title,
}: {
  actionLabel?: string;
  actionTo?: string;
  busy?: boolean;
  description: string;
  onRetry?: () => void;
  secondaryActionLabel?: string;
  secondaryActionTo?: string;
  title: string;
}) {
  return (
    <main className="grid h-dvh w-screen place-items-start overflow-y-auto bg-placeholder px-4 pb-10 pt-28 md:place-items-center md:px-6 md:pb-12 md:pt-32">
      <section
        aria-busy={busy || undefined}
        className="my-auto grid w-full max-w-2xl justify-items-center gap-4 rounded-3xl border-4 border-white bg-white/95 p-8 text-center shadow-card sm:p-12"
        role={busy ? "status" : onRetry ? "alert" : undefined}
      >
        <h1 className="m-0 text-4xl leading-none text-brand-ink sm:text-6xl">
          {title}
        </h1>
        <p className="m-0 max-w-lg font-bold leading-relaxed text-slate-600">
          {description}
        </p>
        <div className="mt-2 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          {onRetry ? (
            <ActionButton
              className="rounded-full border-4 border-white"
              onClick={onRetry}
              type="button"
            >
              Try again
            </ActionButton>
          ) : (
            <ActionLink
              className="rounded-full border-4 border-white"
              to={actionTo}
            >
              {actionLabel}
            </ActionLink>
          )}
          {onRetry ? (
            <ActionLink
              className="rounded-full border-4 border-white"
              to={actionTo}
              variant="surface"
            >
              {actionLabel}
            </ActionLink>
          ) : null}
          {secondaryActionLabel && secondaryActionTo ? (
            <ActionLink
              className="rounded-full border-4 border-white"
              to={secondaryActionTo}
              variant="surface"
            >
              {secondaryActionLabel}
            </ActionLink>
          ) : null}
        </div>
      </section>
    </main>
  );
}
