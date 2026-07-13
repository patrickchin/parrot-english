import type {
  ButtonHTMLAttributes,
  ComponentProps,
  ReactNode,
} from "react";
import { Link } from "react-router";

type ControlVariant = "brand" | "navy" | "success" | "surface";
type ControlSize = "bare" | "compact" | "default" | "large";

export function cx(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

export function fieldClassName(className?: string) {
  return cx(
    "min-h-12 w-full rounded-2xl border-3 border-sky-200 bg-white px-3.5 py-2.5 font-bold text-slate-900 hover:border-sky-400",
    className,
  );
}

export function controlClassName({
  className,
  size = "default",
  variant = "brand",
}: {
  className?: string;
  size?: ControlSize;
  variant?: ControlVariant;
} = {}) {
  return cx(
    "inline-flex cursor-pointer items-center justify-center rounded-2xl border-0 font-ui text-base font-black leading-none no-underline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink disabled:cursor-wait disabled:opacity-75",
    size === "compact" && "min-h-12 min-w-20 gap-1 px-2 py-1",
    size === "default" && "min-h-13 min-w-36 px-6 py-2",
    size === "large" && "min-h-16 w-full gap-3 px-6 py-2",
    variant === "brand" &&
      "bg-brand-pink text-white shadow-control-pink",
    variant === "navy" &&
      "bg-brand-navy text-white shadow-control-navy",
    variant === "success" &&
      "bg-brand-green text-white shadow-control-green",
    variant === "surface" &&
      "bg-white/90 text-brand-blue shadow-control-surface",
    className,
  );
}

export function ActionButton({
  children,
  className,
  size,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: ControlSize;
  variant?: ControlVariant;
}) {
  return (
    <button
      className={controlClassName({ className, size, variant })}
      {...props}
    >
      {children}
    </button>
  );
}

export function ActionLink({
  children,
  className,
  size,
  variant,
  ...props
}: ComponentProps<typeof Link> & {
  children: ReactNode;
  size?: ControlSize;
  variant?: ControlVariant;
}) {
  return (
    <Link
      className={controlClassName({ className, size, variant })}
      {...props}
    >
      {children}
    </Link>
  );
}

export function TextButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cx(
        "min-h-11 cursor-pointer border-0 bg-transparent font-ui font-black text-brand-blue underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink disabled:cursor-wait disabled:opacity-75",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className,
  variant = "surface",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "brand" | "surface";
}) {
  return (
    <button
      className={cx(
        "grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-3 text-2xl font-black focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand-ink disabled:cursor-wait disabled:opacity-75",
        variant === "brand" &&
          "border-brand-pink bg-brand-pink text-white shadow-control-pink",
        variant === "surface" &&
          "border-sky-200 bg-white text-brand-navy",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
