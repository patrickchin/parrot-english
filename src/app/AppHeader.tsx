import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router";
import { ActionButton, cx, controlClassName } from "../shared/ui";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountRef = useRef<HTMLElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isMenuOpen) return;

    accountRef.current
      ?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")
      ?.focus();

    function closeFromOutside(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      accountRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")
        ?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [isMenuOpen]);

  function selectAction(action: () => void) {
    setIsMenuOpen(false);
    action();
  }

  return (
    <aside
      aria-busy={isSigningOut}
      aria-label="Current account"
      className="fixed right-3.5 top-3.5 z-40 max-w-[calc(100vw-1.75rem)] font-ui text-base font-black leading-none short:right-2.5 short:top-2.5 short:max-w-[calc(100vw-1.25rem)] md:right-7 md:top-6 md:max-w-xl"
      ref={accountRef}
    >
      <ActionButton
        aria-controls={menuId}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className="min-h-13 max-w-full min-w-0 gap-1.5 rounded-full border-4 border-white px-3 py-0 shadow-control-navy short:min-h-11 short:px-2 short:text-sm md:min-h-16 md:gap-2 md:px-5 md:text-base"
        onClick={() => setIsMenuOpen((current) => !current)}
        size="bare"
        title={userEmail}
        type="button"
        variant="navy"
      >
        <span className="min-w-0 truncate">{userLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={cx(
            "size-5 shrink-0 transition-transform",
            isMenuOpen && "rotate-180",
          )}
          strokeWidth={3}
        />
      </ActionButton>
      {isMenuOpen ? (
        <div
          aria-label="Account actions"
          className="absolute right-0 top-full mt-2 grid min-w-40 gap-1 rounded-3xl border-4 border-white bg-brand-navy p-2 shadow-control-navy"
          id={menuId}
          role="menu"
        >
          {onOpenProfile ? (
            <ActionButton
              className="min-h-11 w-full min-w-0 justify-start rounded-2xl px-4 shadow-none"
              onClick={() => selectAction(onOpenProfile)}
              role="menuitem"
              size="bare"
              type="button"
              variant="surface"
            >
              Profile
            </ActionButton>
          ) : null}
          <ActionButton
            className="min-h-11 w-full min-w-0 justify-start rounded-2xl px-4 shadow-none"
            disabled={isSigningOut}
            onClick={() => selectAction(onSignOut)}
            role="menuitem"
            size="bare"
            type="button"
          >
            {isSigningOut ? "Signing out…" : "Log out"}
          </ActionButton>
        </div>
      ) : null}
      {error ? (
        <span
          className={cx(
            "absolute right-0 top-full mt-2 w-64 rounded-2xl border-3 border-white bg-red-800 px-3 py-2 text-sm font-extrabold leading-tight text-white shadow-md sm:w-80",
            isMenuOpen && "mt-32",
          )}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </aside>
  );
}
