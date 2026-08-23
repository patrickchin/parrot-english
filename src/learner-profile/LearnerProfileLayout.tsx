import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Card, cx } from "../shared/ui";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useLearnerProfileStepHeading(stepKey: number | string) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useIsomorphicLayoutEffect(() => {
    const heading = headingRef.current;
    const scrollport = heading?.closest("main");
    if (scrollport) {
      scrollport.scrollTop = 0;
      scrollport.scrollLeft = 0;
    }

    const frame = window.requestAnimationFrame(() => {
      heading?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [stepKey]);

  return headingRef;
}

export function LearnerProfileStepHeading({
  children,
  className,
  stepKey,
  ...props
}: Omit<ComponentProps<"h1">, "ref" | "tabIndex"> & {
  stepKey: number | string;
}) {
  const headingRef = useLearnerProfileStepHeading(stepKey);

  return (
    <h1
      {...props}
      className={cx(
        "relative outline-none before:absolute before:top-0 before:-left-3 before:h-full before:max-h-24 before:w-1 before:transition-none before:content-[''] focus:before:bg-brand-blue forced-colors:before:hidden forced-colors:focus:outline-2 forced-colors:focus:outline-solid forced-colors:focus:outline-offset-2",
        className,
      )}
      ref={headingRef}
      tabIndex={-1}
    >
      {children}
    </h1>
  );
}

export function LearnerProfileScreen({
  children,
  profile = false,
}: {
  children: ReactNode;
  profile?: boolean;
}) {
  return (
    <main
      className={cx(
        "grid h-dvh w-full items-start justify-items-center overflow-y-auto bg-learner-profile",
        !profile &&
          "p-3.5 sm:place-items-center sm:p-8 short:p-3.5 lg:p-12",
        profile &&
          "px-3.5 pb-3.5 pt-40 sm:px-8 sm:pb-8 sm:pt-32 md:pt-28 lg:px-12 lg:pb-12",
      )}
    >
      {children}
    </main>
  );
}

export function LearnerProfileCard({
  children,
  className,
  width = "standard",
  ...props
}: ComponentProps<"section"> & {
  width?: "narrow" | "standard" | "wide";
}) {
  return (
    <Card
      className={cx(
        "my-auto w-full",
        width === "narrow" && "max-w-xl",
        width === "standard" && "max-w-2xl",
        width === "wide" && "max-w-4xl",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}

export function LearnerProfileStatusCard({
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <LearnerProfileCard
      className="grid justify-items-center gap-4 p-7 text-center sm:p-12"
      {...props}
    >
      {children}
    </LearnerProfileCard>
  );
}
