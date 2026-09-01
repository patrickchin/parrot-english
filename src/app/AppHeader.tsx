import {
  ChevronDown,
  CircleUserRound,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { LinkProps } from "react-router";
import { ActionButton, ActionLink, cx, MenuButton } from "../shared/ui";
import { AdultBoundaryHelper } from "../i18n/AdultBoundaryHelper";
import { useGuardianLanguage } from "../i18n/guardian-language";
import { englishGuardianMessages, type GuardianMessages } from "../i18n/messages/en";

function HeaderLabel({ children }: { children: ReactNode }) {
  return <span className="hidden wide:inline">{children}</span>;
}

function AccountError({
  className,
  error,
  helper,
  onRetry,
  retryLabel = englishGuardianMessages.common.retry,
}: {
  className?: string;
  error: string;
  helper?: keyof GuardianMessages["learnerBoundary"];
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      className={cx(
        "grid gap-2 rounded-2xl border-3 border-white bg-red-800 px-3 py-2 text-sm font-extrabold leading-tight text-white shadow-md",
        className,
      )}
    >
      <span className="grid gap-1" role="alert">
        <span>{error}</span>
        {helper ? <AdultBoundaryHelper message={helper} placement="compact" /> : null}
      </span>
      {onRetry ? (
        <ActionButton
          onClick={onRetry}
          size="compact"
          type="button"
          variant="surface"
        >
          {retryLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}

export function RouteHeader({
  ariaLabel = "Page navigation",
  children,
}: {
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="absolute left-38 top-3.5 z-20 flex gap-2.5 short:top-2.5 md:top-6 wide:left-41"
    >
      {children}
    </nav>
  );
}

export function BidiLearnerName({
  fallback = "Learner",
  learnerName,
}: {
  fallback?: string;
  learnerName: string;
}) {
  return (
    <bdi className="min-w-0 [overflow-wrap:anywhere]" dir="auto">
      {learnerName.trim() || fallback}
    </bdi>
  );
}

export function GuardianLearnerContextLabel({
  audience,
  learnerName,
}: {
  audience: "guardian" | "learner";
  learnerName: string;
}) {
  const { messages: selectedMessages } = useGuardianLanguage();
  const messages =
    audience === "guardian" ? selectedMessages : englishGuardianMessages;
  const isolatedName = `\u2068${learnerName}\u2069`;
  return (
    <p
      aria-label={messages.learners.profile.managing(isolatedName)}
      className="m-0 min-w-0 max-w-full text-xs font-black uppercase tracking-[0.18em] text-brand-blue [overflow-wrap:anywhere] sm:text-sm"
    >
      {messages.learners.profile.managingBefore}
      <BidiLearnerName learnerName={learnerName} />
      {messages.learners.profile.managingAfter}
    </p>
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
  ref?: Ref<HTMLButtonElement>;
  variant?: "navy" | "surface";
}) {
  return (
    <ActionButton frame="white" size="header" variant={variant} {...props}>
      <span
        aria-hidden="true"
        className="size-6 shrink-0 [&_svg]:stroke-[3]"
      >
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
    <ActionLink frame="white" size="header" variant={variant} {...props}>
      <span
        aria-hidden="true"
        className="size-6 shrink-0 [&_svg]:stroke-[3]"
      >
        {icon}
      </span>
      <HeaderLabel>{children}</HeaderLabel>
    </ActionLink>
  );
}

export function AccountHeader({
  activeMode,
  error,
  errorHelper,
  guardianLabel,
  hasActiveLearner = false,
  isDialogOpen = false,
  isModePending = false,
  isSigningOut,
  learnerLabel,
  onOpenAccountPrivacy,
  onOpenGuardianDashboard,
  onOpenLearnerProfiles,
  onOpenLearnerSwitcher,
  onRetryError,
  onSelectGuardian,
  onSignOut,
  signOutError,
}: {
  activeMode: "guardian" | "learner";
  error: string;
  errorHelper?: keyof GuardianMessages["learnerBoundary"];
  guardianLabel: string;
  hasActiveLearner?: boolean;
  isDialogOpen?: boolean;
  isModePending?: boolean;
  isSigningOut: boolean;
  learnerLabel: string;
  onOpenAccountPrivacy: () => void;
  onOpenGuardianDashboard: () => void;
  onOpenLearnerProfiles: () => void;
  onOpenLearnerSwitcher: (() => void) | null;
  onRetryError?: () => void;
  onSelectGuardian: () => void;
  onSignOut: () => void;
  signOutError: string;
  userEmail: string;
}) {
  const { language, messages: selectedMessages } = useGuardianLanguage();
  const messages =
    activeMode === "guardian" ? selectedMessages : englishGuardianMessages;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountRef = useRef<HTMLElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const menuFocusRef = useRef<"first" | "last">("first");
  const menuId = useId();
  const previousModeRef = useRef(activeMode);
  const signOutAlertId = useId();
  const managedLearnerLabel = learnerLabel.trim() || "Learner";
  const activeLabel =
    activeMode === "guardian" ? guardianLabel : managedLearnerLabel;
  const activeModeLabel =
    activeMode === "guardian" ? messages.account.guardian : "Learner";
  const profileLabel = messages.account.profileLabel(
    activeLabel,
    activeMode === "guardian"
      ? language === "en"
        ? "guardian"
        : messages.account.guardian
      : "learner",
  );
  const showSignOutRecovery =
    activeMode === "guardian" && Boolean(signOutError) && !isSigningOut;

  useLayoutEffect(() => {
    if (previousModeRef.current === activeMode) return;
    previousModeRef.current = activeMode;
    setIsMenuOpen(false);
  }, [activeMode]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const menuItems = accountRef.current?.querySelectorAll<HTMLButtonElement>(
      "[role='menuitem']:not(:disabled)",
    );
    menuItems?.[
      menuFocusRef.current === "last" ? menuItems.length - 1 : 0
    ]?.focus();

    function closeFromOutside(event: PointerEvent) {
      if (isDialogOpen) return;
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function closeFromEscape(event: KeyboardEvent) {
      if (isDialogOpen) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsMenuOpen(false);
      accountButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [isDialogOpen, isMenuOpen]);

  function selectAction(action: () => void) {
    setIsMenuOpen(false);
    action();
  }

  function selectSignOut() {
    setIsMenuOpen(false);
    accountButtonRef.current?.focus();
    onSignOut();
  }

  function selectLearnerSwitcher() {
    setIsMenuOpen(false);
    accountButtonRef.current?.focus();
    onOpenLearnerSwitcher?.();
  }

  function openMenu(focus: "first" | "last" = "first") {
    menuFocusRef.current = focus;
    setIsMenuOpen(true);
  }

  function handleAccountKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (isSigningOut) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowUp" ? "last" : "first");
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ),
    ];
    if (items.length === 0) return;
    event.preventDefault();

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    }
    items[nextIndex]?.focus();
  }

  return (
    <aside
      aria-label={messages.account.label}
      className="fixed right-3.5 top-3.5 z-40 max-w-[calc(100vw-1.75rem)] font-ui text-base font-black leading-none short:right-2.5 short:top-2.5 short:max-w-[calc(100vw-1.25rem)] md:right-4 md:top-6 md:max-w-xl wide:right-7"
      ref={accountRef}
    >
      <div
        className={cx(
          "relative inline-flex max-w-full flex-row-reverse items-start gap-4",
          isSigningOut && "w-[10.25rem] short:w-[9.5rem] md:w-[11.25rem]",
          showSignOutRecovery && "wide:gap-3",
        )}
      >
        <ActionButton
          aria-disabled={isSigningOut || undefined}
          aria-label={
            isSigningOut
              ? messages.account.signingOutProfileLabel(profileLabel)
              : profileLabel
          }
          aria-controls={menuId}
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          className={cx(
            "max-w-full shrink-0",
            isSigningOut &&
              "!w-full aria-disabled:!pointer-events-auto aria-disabled:!cursor-wait aria-disabled:!opacity-100 wide:!w-full",
          )}
          onClick={() => {
            if (isSigningOut) return;
            if (!isMenuOpen) menuFocusRef.current = "first";
            setIsMenuOpen((current) => !current);
          }}
          onKeyDown={handleAccountKeyDown}
          ref={accountButtonRef}
          size="header"
          title={isSigningOut ? undefined : messages.account.label}
          type="button"
          variant="navy"
        >
          <span
            aria-hidden={isSigningOut || undefined}
            className={cx("contents", isSigningOut && "invisible")}
          >
            <span aria-hidden="true" className="size-6 shrink-0">
              {activeMode === "guardian" ? (
                <ShieldCheck className="size-6" strokeWidth={3} />
              ) : (
                <CircleUserRound className="size-6" strokeWidth={3} />
              )}
            </span>
            <span className="hidden min-w-0 leading-tight wide:grid">
              <span className="max-w-40 truncate">
                <BidiLearnerName learnerName={activeLabel} />
              </span>
              <span className="text-[0.65rem] uppercase tracking-wider text-sky-100">
                {activeModeLabel}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cx(
                "hidden size-5 shrink-0 transition-transform wide:block",
                isMenuOpen && "rotate-180",
              )}
              strokeWidth={3}
            />
          </span>
        </ActionButton>
        {showSignOutRecovery ? (
          <ActionButton
            aria-describedby={signOutAlertId}
            className="absolute right-0 top-full mt-2 w-[12.25rem] !gap-0.5 !px-0.5 !py-0 text-center leading-tight short:!min-h-12 min-[360px]:whitespace-nowrap wide:static wide:mt-0 wide:w-auto wide:flex-none wide:!gap-1 wide:!px-3"
            onClick={selectSignOut}
            size="compact"
            type="button"
            variant="navy"
          >
            <TriangleAlert
              aria-hidden="true"
              className="size-4 shrink-0 text-brand-yellow"
              strokeWidth={3}
            />
            <span>{messages.account.signOutAgain}</span>
          </ActionButton>
        ) : null}
        <span
          aria-atomic="true"
          aria-live="polite"
          className={cx(
            !isSigningOut && "sr-only",
            isSigningOut &&
              "pointer-events-none absolute inset-0 inline-flex items-center justify-center gap-2 px-3 text-sm text-white short:text-sm md:px-4 md:text-base",
          )}
          role="status"
        >
          {isSigningOut ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
                strokeWidth={3}
              />
              <span>{messages.account.signingOut}</span>
            </>
          ) : (
            ""
          )}
        </span>
      </div>
      <span
        aria-atomic="true"
        className="sr-only"
        id={signOutAlertId}
        role="alert"
      >
        {activeMode === "guardian" ? signOutError : ""}
      </span>
      {isMenuOpen && !isSigningOut ? (
        <div className="absolute right-0 top-full mt-2 grid max-h-[calc(100dvh-7rem)] w-72 min-w-52 max-w-[calc(100vw-1.25rem)] gap-1 overflow-y-auto overscroll-contain rounded-3xl border-4 border-white bg-brand-navy p-2 shadow-control-navy short:max-h-[calc(100dvh-4.5rem)]">
          {activeMode === "learner" ? (
            <div
              aria-label="Active profile"
              className="grid min-w-0 gap-1 px-3 pb-2 pt-1 text-xs font-bold leading-tight text-sky-100"
              role="group"
            >
              <p className="m-0 min-w-0 [overflow-wrap:anywhere]">
                <BidiLearnerName learnerName={activeLabel} />
              </p>
              <p className="m-0 text-[0.65rem] uppercase tracking-wider">
                {activeModeLabel}
              </p>
            </div>
          ) : null}
          {error ? (
            <AccountError
              error={error}
              helper={errorHelper}
              onRetry={onRetryError}
              retryLabel={messages.common.retry}
            />
          ) : null}
          <div
            aria-label={messages.account.menuLabel}
            className="grid gap-1 [&>button]:scroll-my-2"
            id={menuId}
            onBlur={(event) => {
              if (
                !isDialogOpen &&
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setIsMenuOpen(false);
              }
            }}
            onKeyDown={handleMenuKeyDown}
            role="menu"
          >
            {activeMode === "learner" &&
            hasActiveLearner &&
            onOpenLearnerSwitcher ? (
              <MenuButton
                onClick={selectLearnerSwitcher}
                role="menuitem"
                type="button"
              >
                <CircleUserRound
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                Switch learner
              </MenuButton>
            ) : null}
            {activeMode === "learner" ? (
              <MenuButton
                disabled={isModePending}
                onClick={() => selectAction(onSelectGuardian)}
                role="menuitem"
                type="button"
              >
                <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
                <span className="grid gap-1">
                  <span className="grid gap-1">
                    <span>Grown-up access</span>
                    <AdultBoundaryHelper
                      message="grownUpAccessHelper"
                      placement="compact"
                    />
                  </span>
                  <span className="text-xs font-bold">
                    {isModePending ? "Switching modes…" : "Switch modes"}
                  </span>
                </span>
              </MenuButton>
            ) : null}
            {activeMode === "guardian" ? (
              <>
                <MenuButton
                  onClick={() => selectAction(onOpenGuardianDashboard)}
                  role="menuitem"
                  type="button"
                >
                  {messages.account.guardianDashboard}
                </MenuButton>
                <MenuButton
                  onClick={() => selectAction(onOpenLearnerProfiles)}
                  role="menuitem"
                  type="button"
                >
                  {messages.account.manageLearners}
                </MenuButton>
                <MenuButton
                  onClick={() => selectAction(onOpenAccountPrivacy)}
                  role="menuitem"
                  type="button"
                >
                  {messages.account.accountPrivacy}
                </MenuButton>
                <MenuButton
                  disabled={isSigningOut}
                  onClick={selectSignOut}
                  role="menuitem"
                  type="button"
                >
                  {isSigningOut
                    ? messages.account.signingOut
                    : messages.account.signOut}
                </MenuButton>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {error && !isMenuOpen ? (
        <AccountError
          className="absolute right-0 top-full mt-2 w-64 sm:w-80"
          error={error}
          helper={errorHelper}
          onRetry={onRetryError}
          retryLabel={messages.common.retry}
        />
      ) : null}
    </aside>
  );
}
