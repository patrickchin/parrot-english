import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type { LinkProps } from "react-router";
import { ActionButton, ActionLink, cx, MenuButton } from "../shared/ui";
import { AboutDialog } from "./AboutDialog";

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
    <ActionButton size="header" variant={variant} {...props}>
      <span aria-hidden="true" className="size-6 shrink-0">
        {icon}
      </span>
      <HeaderLabel>{children}</HeaderLabel>
    </ActionButton>
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
    <ActionLink size="header" variant={variant} {...props}>
      <span aria-hidden="true" className="size-6 shrink-0">
        {icon}
      </span>
      <HeaderLabel>{children}</HeaderLabel>
    </ActionLink>
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
  const [isAboutOpen, setIsAboutOpen] = useState(false);
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

  function closeAbout() {
    setIsAboutOpen(false);
    accountRef.current
      ?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")
      ?.focus();
  }

  return (
    <aside
      aria-busy={isSigningOut}
      aria-label="Account"
      className="fixed right-3.5 top-3.5 z-40 max-w-[calc(100vw-1.75rem)] font-ui text-base font-black leading-none short:right-2.5 short:top-2.5 short:max-w-[calc(100vw-1.25rem)] md:right-7 md:top-6 md:max-w-xl"
      ref={accountRef}
    >
      <ActionButton
        aria-label={`Account for ${userLabel}`}
        aria-controls={menuId}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className="max-w-full"
        onClick={() => setIsMenuOpen((current) => !current)}
        size="headerAccount"
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
          className="absolute right-0 top-full mt-2 grid min-w-52 max-w-[calc(100vw-1.25rem)] gap-1 rounded-3xl border-4 border-white bg-brand-navy p-2 shadow-control-navy"
        >
          <p
            className="m-0 truncate px-3 pb-2 pt-1 text-xs font-bold leading-tight text-sky-100"
            title={userEmail}
          >
            {userEmail}
          </p>
          <div
            aria-label="Account menu"
            className="grid gap-1"
            id={menuId}
            role="menu"
          >
            {onOpenProfile ? (
              <MenuButton
                onClick={() => selectAction(onOpenProfile)}
                role="menuitem"
                type="button"
              >
                Learner profile
              </MenuButton>
            ) : null}
            <MenuButton
              onClick={() => selectAction(() => setIsAboutOpen(true))}
              role="menuitem"
              type="button"
            >
              About
            </MenuButton>
            <MenuButton
              disabled={isSigningOut}
              onClick={() => selectAction(onSignOut)}
              role="menuitem"
              type="button"
              variant="brand"
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </MenuButton>
          </div>
        </div>
      ) : null}
      {isAboutOpen ? <AboutDialog onClose={closeAbout} /> : null}
      {error ? (
        <span
          className={cx(
            "absolute right-0 top-full mt-2 w-64 rounded-2xl border-3 border-white bg-red-800 px-3 py-2 text-sm font-extrabold leading-tight text-white shadow-md sm:w-80",
            isMenuOpen && "mt-44",
          )}
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </aside>
  );
}
