import type { ComponentProps, ReactNode } from "react";
import { cx } from "./ui";

export function OnboardingScreen({
  children,
  profile = false,
}: {
  children: ReactNode;
  profile?: boolean;
}) {
  return (
    <main
      className={cx(
        "grid h-dvh w-full items-start justify-items-center overflow-y-auto bg-onboarding",
        !profile && "p-3.5 sm:place-items-center sm:p-8 lg:p-12",
        profile &&
          "px-3.5 pb-3.5 pt-40 sm:px-8 sm:pb-8 sm:pt-32 md:pt-28 lg:px-12 lg:pb-12",
      )}
    >
      {children}
    </main>
  );
}

export function OnboardingCard({
  children,
  className,
  width = "standard",
  ...props
}: ComponentProps<"section"> & {
  width?: "narrow" | "standard" | "wide";
}) {
  return (
    <section
      className={cx(
        "my-auto w-full rounded-3xl border-4 border-white bg-white/95 shadow-card",
        width === "narrow" && "max-w-xl",
        width === "standard" && "max-w-2xl",
        width === "wide" && "max-w-4xl",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function OnboardingStatusCard({
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <OnboardingCard
      className="grid justify-items-center gap-4 p-7 text-center sm:p-12"
      {...props}
    >
      {children}
    </OnboardingCard>
  );
}
