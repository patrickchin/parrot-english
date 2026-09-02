import type {
  ButtonHTMLAttributes,
  ComponentProps,
  KeyboardEvent,
  Ref,
  ReactNode,
} from "react";
import { Link } from "react-router";

export type ControlVariant =
  | "brand"
  | "dangerSurface"
  | "navy"
  | "rose"
  | "success"
  | "surface";
export type ControlSize =
  | "none"
  | "compact"
  | "default"
  | "large"
  | "hero"
  | "header"
  | "inline"
  | "menu";
export type ControlShape = "pill" | "rounded";
export type ControlFrame = "none" | "outline" | "soft" | "white";
export type ControlElevation = "flat" | "raised";

type ControlVisualProps = {
  align?: "center" | "start";
  elevation?: ControlElevation;
  frame?: ControlFrame;
  fullWidth?: boolean;
  shape?: ControlShape;
  size?: ControlSize;
  variant?: ControlVariant;
};

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const focusClassName =
  "focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-focus-dark focus-visible:ring-4 focus-visible:ring-focus-light";

export function fieldClassName({
  className,
  tone = "surface",
}: {
  className?: string;
  tone?: "surface" | "tinted";
} = {}) {
  return cx(
    "min-h-12 w-full rounded-2xl border-3 border-sky-200 px-3.5 py-2.5 font-bold text-slate-900 transition-colors duration-150 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60",
    tone === "surface" ? "bg-white" : "bg-sky-50",
    className,
  );
}

export function controlClassName({
  align = "center",
  className,
  elevation = "raised",
  frame,
  fullWidth = false,
  interaction = "button",
  shape = "pill",
  size = "default",
  variant = "brand",
}: Omit<ControlVisualProps, "size"> & {
  className?: string;
  interaction?: "button" | "link" | "static";
  size?: ControlSize | "none";
} = {}) {
  const resolvedFrame =
    frame ??
    (variant === "surface" || variant === "dangerSurface"
      ? "outline"
      : "white");

  return cx(
    "inline-flex touch-manipulation select-none items-center font-ui font-black leading-none no-underline transition-[filter] duration-150 ease-out motion-reduce:transition-none",
    focusClassName,
    interaction === "button" &&
      "enabled:cursor-pointer enabled:active:brightness-95",
    interaction === "button" &&
      "aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:transition-none aria-disabled:hover:brightness-100 aria-disabled:active:brightness-100",
    interaction === "link" &&
      "cursor-pointer active:brightness-95",
    interaction === "button" &&
      (variant === "rose" || variant === "dangerSurface"
        ? "enabled:hover:brightness-95"
        : "enabled:hover:brightness-105"),
    interaction === "link" &&
      (variant === "rose" || variant === "dangerSurface"
        ? "hover:brightness-95"
        : "hover:brightness-105"),
    "disabled:cursor-not-allowed disabled:opacity-60",
    align === "center" && "justify-center text-center",
    align === "start" && "justify-start text-left",
    shape === "pill" && "rounded-full",
    shape === "rounded" && "rounded-2xl",
    resolvedFrame === "none" && "border-0",
    resolvedFrame === "soft" && "border-3 border-sky-200",
    resolvedFrame === "white" && "border-4 border-white",
    resolvedFrame === "outline" &&
      variant === "surface" &&
      "border-3 border-brand-blue",
    resolvedFrame === "outline" &&
      variant === "dangerSurface" &&
      "border-3 border-red-800",
    fullWidth && "w-full",
    size === "compact" && "min-h-12 min-w-20 gap-1.5 px-3 py-1 text-sm",
    size === "default" && "min-h-13 min-w-36 gap-2 px-6 py-2 text-base",
    size === "large" &&
      "h-14 gap-2 px-5 py-2 text-lg short:h-12 short:px-3 short:text-base md:h-16 md:text-xl",
    size === "hero" &&
      "min-h-16 gap-2 px-6 py-2 text-xl md:min-h-20 md:text-2xl",
    size === "header" &&
      "size-13 min-h-0 min-w-0 gap-2 p-0 text-base short:size-12 short:text-sm md:size-16 md:text-base wide:w-auto wide:px-5 short:wide:!w-auto short:wide:!px-5",
    size === "inline" && "min-h-11 min-w-0 gap-1 px-1 py-0 text-sm",
    size === "menu" && "min-h-11 w-full min-w-0 gap-2 px-4 py-2 text-base",
    variant === "brand" && "bg-brand-pink text-brand-action-ink",
    variant === "dangerSurface" && "bg-rose-50 text-red-800",
    variant === "navy" && "bg-brand-navy text-white",
    variant === "rose" && "bg-brand-rose text-white",
    variant === "success" && "bg-brand-green text-white",
    variant === "surface" && "bg-white/90 text-brand-blue",
    elevation === "flat" && "shadow-none",
    elevation === "raised" &&
      (variant === "brand" || variant === "rose") &&
      "shadow-control-pink",
    elevation === "raised" && variant === "navy" && "shadow-control-navy",
    elevation === "raised" && variant === "success" && "shadow-control-green",
    elevation === "raised" &&
      (variant === "surface" || variant === "dangerSurface") &&
      "shadow-control-surface",
    className,
  );
}

export function ActionButton({
  align,
  children,
  className,
  elevation,
  frame,
  fullWidth,
  ref,
  shape,
  size,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  ControlVisualProps & {
    children: ReactNode;
    ref?: Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      className={controlClassName({
        align,
        className,
        elevation,
        frame,
        fullWidth,
        shape,
        size,
        variant,
      })}
      ref={ref}
      {...props}
    >
      {children}
    </button>
  );
}

export function MenuButton({
  children,
  variant = "surface",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ControlVariant;
}) {
  return (
    <ActionButton
      align="start"
      elevation="flat"
      frame="none"
      shape="rounded"
      size="menu"
      variant={variant}
      {...props}
    >
      {children}
    </ActionButton>
  );
}

export function ActionLink({
  align,
  children,
  className,
  elevation,
  frame,
  fullWidth,
  shape,
  size,
  variant,
  ...props
}: ComponentProps<typeof Link> &
  ControlVisualProps & {
    children: ReactNode;
  }) {
  return (
    <Link
      className={controlClassName({
        align,
        className,
        elevation,
        frame,
        fullWidth,
        interaction: "link",
        shape,
        size,
        variant,
      })}
      {...props}
    >
      {children}
    </Link>
  );
}

function textControlClassName(className?: string) {
  return cx(
    "inline-flex min-h-11 touch-manipulation items-center justify-center border-0 bg-transparent px-1 font-ui font-black text-brand-blue underline underline-offset-4 transition-colors duration-150 hover:text-brand-navy aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60",
    focusClassName,
    className,
  );
}

export function TextButton({
  children,
  className,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button className={textControlClassName(className)} ref={ref} {...props}>
      {children}
    </button>
  );
}

type IconButtonSize = "compact" | "default" | "field" | "large";

export function IconButton({
  children,
  className,
  elevation = "flat",
  frame = "soft",
  ref,
  shape = "pill",
  size = "default",
  variant = "surface",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  elevation?: ControlElevation;
  frame?: ControlFrame;
  ref?: Ref<HTMLButtonElement>;
  shape?: ControlShape;
  size?: IconButtonSize;
  variant?: ControlVariant;
}) {
  return (
    <button
      className={cx(
        controlClassName({
          className: "shrink-0 p-0 text-2xl",
          elevation,
          frame,
          shape,
          size: "none",
          variant,
        }),
        size === "compact" && "size-11",
        size === "default" && "size-12",
        size === "field" && "min-h-12 w-13 self-stretch",
        size === "large" && "size-14 md:size-17",
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}
    </button>
  );
}

export function SegmentedControl({
  className,
  onKeyDown,
  role = "group",
  ...props
}: ComponentProps<"div">) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      role !== "tablist" ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      return;
    }

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ),
    );
    const currentIndex = tabs.findIndex(
      (tab) => tab === document.activeElement,
    );
    if (currentIndex === -1 || tabs.length === 0) {
      return;
    }

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;

    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  }

  return (
    <div
      className={cx("grid gap-1.5 rounded-2xl bg-sky-100 p-1", className)}
      onKeyDown={handleKeyDown}
      role={role}
      {...props}
    />
  );
}

export function SegmentedButton({
  children,
  className,
  role,
  selected,
  tabIndex,
  ...props
}: Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed" | "aria-selected"
> & {
  children: ReactNode;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={role === "tab" ? undefined : selected}
      aria-selected={role === "tab" ? selected : undefined}
      className={cx(
        "inline-flex min-h-12 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-xl border-0 px-3 font-ui font-black transition-[filter] duration-150 ease-out enabled:cursor-pointer enabled:hover:brightness-95 enabled:active:brightness-90 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60",
        focusClassName,
        selected
          ? "bg-brand-navy text-white shadow-control-navy"
          : "bg-transparent text-brand-navy shadow-none",
        className,
      )}
      role={role}
      tabIndex={role === "tab" ? (selected ? 0 : -1) : tabIndex}
      {...props}
    >
      {children}
    </button>
  );
}

type CardTone = "glass" | "inset" | "muted" | "solid";
type CardElevation = "flat" | "raised" | "soft";

export function cardClassName({
  className,
  elevation = "raised",
  tone = "glass",
}: {
  className?: string;
  elevation?: CardElevation;
  tone?: CardTone;
} = {}) {
  return cx(
    tone === "glass" && "rounded-3xl border-4 border-white bg-white/95",
    tone === "solid" && "rounded-3xl border-4 border-white bg-white",
    tone === "muted" && "rounded-3xl border-4 border-white bg-white/75",
    tone === "inset" && "rounded-2xl border-3 border-sky-200 bg-white",
    elevation === "flat" && "shadow-none",
    elevation === "soft" && "shadow-sm",
    elevation === "raised" && "shadow-card",
    className,
  );
}

export function Card({
  children,
  className,
  elevation,
  tone,
  ...props
}: ComponentProps<"section"> & {
  elevation?: CardElevation;
  tone?: CardTone;
}) {
  return (
    <section
      className={cardClassName({ className, elevation, tone })}
      {...props}
    >
      {children}
    </section>
  );
}

function interactiveCardClassName({
  className,
  tone = "glass",
}: {
  className?: string;
  tone?: CardTone;
} = {}) {
  return cx(
    cardClassName({ tone }),
    "touch-manipulation no-underline transition-[filter] duration-150 ease-out motion-reduce:transition-none",
    tone === "muted" ? "text-slate-700" : "text-slate-900",
    "cursor-pointer hover:brightness-105 active:brightness-95",
    focusClassName,
    className,
  );
}

export function InteractiveCardLink({
  children,
  className,
  tone,
  ...props
}: ComponentProps<typeof Link> & { children: ReactNode; tone?: CardTone }) {
  return (
    <Link className={interactiveCardClassName({ className, tone })} {...props}>
      {children}
    </Link>
  );
}
