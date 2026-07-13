import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { ActionButton, cx, controlClassName } from "./ui";

function headerControlClassName(variant: "navy" | "surface") {
  return controlClassName({
    className: cx(
      "size-13 min-h-0 min-w-0 gap-2 rounded-full border-4 border-white p-0 shadow-control-navy hover:-translate-y-0.5 hover:brightness-105 short:size-11 md:size-16 wide:w-auto wide:px-5",
      variant === "surface" && "shadow-control-surface",
    ),
    size: "bare",
    variant,
  });
}

function HeaderLabel({ children }: { children: ReactNode }) {
  return <span className="hidden wide:inline">{children}</span>;
}

export function RouteHeader({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Page navigation"
      className="absolute left-3.5 top-3.5 z-20 flex gap-2.5 short:left-2.5 short:top-2.5 md:left-7 md:top-6"
    >
      {children}
    </nav>
  );
}

export function HeaderButton({
  children,
  icon,
  variant = "navy",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  children: ReactNode;
  icon: ReactNode;
  variant?: "navy" | "surface";
}) {
  return (
    <button {...props} className={headerControlClassName(variant)}>
      <span aria-hidden="true" className="size-6 shrink-0">
        {icon}
      </span>
      <HeaderLabel>{children}</HeaderLabel>
    </button>
  );
}

export function HeaderLink({
  children,
  icon,
  variant = "navy",
  ...props
}: Omit<LinkProps, "className"> & {
  children: ReactNode;
  icon: ReactNode;
  variant?: "navy" | "surface";
}) {
  return (
    <Link className={headerControlClassName(variant)} {...props}>
      <span aria-hidden="true" className="size-6 shrink-0">
        {icon}
      </span>
      <HeaderLabel>{children}</HeaderLabel>
    </Link>
  );
}

export function AccountHeader({
  error,
  isSigningOut,
  onOpenProfile,
  onSignOut,
  userEmail,
  userLabel,
}: {
  error: string;
  isSigningOut: boolean;
  onOpenProfile: (() => void) | null;
  onSignOut: () => void;
  userEmail: string;
  userLabel: string;
}) {
  return (
    <aside
      aria-label="Current account"
      className="fixed right-3.5 top-3.5 z-40 flex min-h-13 max-w-xl items-center gap-1.5 rounded-full border-4 border-white bg-brand-navy px-1 font-ui text-base font-black leading-none text-white shadow-control-navy short:right-2.5 short:top-2.5 short:min-h-11 short:gap-1 md:right-7 md:top-6 md:min-h-16 md:gap-2.5 md:pl-4"
    >
      <span
        className="hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap md:inline"
        title={userEmail}
      >
        {userLabel}
      </span>
      {onOpenProfile ? (
        <ActionButton
          aria-label="Edit learner profile"
          className="min-h-11 min-w-0 rounded-full px-2 shadow-none short:min-h-9 short:px-1 short:text-sm md:min-h-14 md:px-3 md:text-base"
          onClick={onOpenProfile}
          size="bare"
          type="button"
          variant="surface"
        >
          Profile
        </ActionButton>
      ) : null}
      <ActionButton
        className="min-h-11 min-w-0 rounded-full px-2 shadow-none short:min-h-9 short:px-1 short:text-sm md:min-h-14 md:px-3 md:text-base"
        disabled={isSigningOut}
        onClick={onSignOut}
        size="bare"
        type="button"
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </ActionButton>
      {error ? (
        <span
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl border-3 border-white bg-red-800 px-3 py-2 text-sm font-extrabold leading-tight text-white shadow-md sm:w-80"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </aside>
  );
}
