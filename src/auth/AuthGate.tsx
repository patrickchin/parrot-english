import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { SHARED_GUEST_USER_ID } from "../../lib/shared-guest.ts";
import { AccountHeader } from "../app/AppHeader";
import {
  getGuardianPath,
  getSafeGuardianUnlockDestination,
} from "../app/app-routes";
import {
  getAuthErrorCode,
  validateAuthForm,
  type AuthErrorCode,
  type AuthFields,
  type AuthMode,
} from "./auth-form";
import {
  AccountActionProvider,
  type AccountExperience,
  type AccountDeleteErrorCode,
} from "./account-actions";
import { authClient } from "./auth-client";
import { TurnstileWidget } from "./Turnstile";
import { GuardianAccessProvider, useGuardianAccess } from "./GuardianAccess";
import {
  isGuardianGuidanceSurface,
  useGuardianLanguage,
} from "../i18n/guardian-language";
import { GuardianLanguageControl } from "../i18n/GuardianLanguageControl";
import { englishGuardianMessages } from "../i18n/messages/en";
import {
  ActionButton,
  Card,
  cx,
  fieldClassName,
  SegmentedButton,
  SegmentedControl,
} from "../shared/ui";

interface AuthActionResult {
  error?: unknown | null;
}

type CaptchaFetchOptions = {
  fetchOptions: {
    headers: { "x-captcha-response": string };
  };
};

export interface AuthActionClient {
  $fetch(
    path: "/sign-in/shared-guest",
    options: {
      body: Record<string, never>;
      headers: { "x-captcha-response": string };
      method: "POST";
    },
  ): Promise<AuthActionResult>;
  deleteUser(fields: { password: string }): Promise<AuthActionResult>;
  signIn: {
    email(fields: {
      email: string;
      password: string;
    }): Promise<AuthActionResult>;
  };
  signOut(): Promise<AuthActionResult>;
  signUp: {
    email(
      fields: {
        name: string;
        email: string;
        password: string;
      } & CaptchaFetchOptions,
    ): Promise<AuthActionResult>;
  };
}

interface SubmitAuthFormOptions {
  client: AuthActionClient;
  fields: AuthFields;
  mode: AuthMode;
  refetch: () => Promise<unknown>;
  turnstileToken?: string | null;
}

interface SignInGuestSessionOptions {
  client: AuthActionClient;
  refetch: () => Promise<unknown>;
  turnstileToken: string | null;
}

interface SignOutSessionOptions {
  client: AuthActionClient;
}

interface DeleteAccountSessionOptions {
  client: AuthActionClient;
  password: string;
  refetch: () => Promise<unknown>;
}

const SIGN_OUT_ERROR = "sign-out-failed" as const;
const DELETE_ACCOUNT_ERROR = "account-delete-failed" as const;
const TURNSTILE_REQUIRED_ERROR = "security-check-required" as const;

function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid h-dvh w-full min-w-0 items-start justify-items-center overflow-y-auto bg-auth p-5 sm:place-items-center sm:p-10 lg:p-14">
      {children}
    </main>
  );
}

function AuthCard({
  children,
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <Card
      className={cx("my-auto w-full min-w-0 max-w-lg p-6 sm:p-10", className)}
      tone="solid"
      {...props}
    >
      {children}
    </Card>
  );
}

function AuthParrotMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-14 shrink-0 -rotate-6 place-items-center rounded-full border-4 border-white bg-brand-pink text-3xl font-black text-white shadow-control-pink sm:size-16"
    >
      P
    </span>
  );
}

export async function submitAuthForm({
  client,
  fields,
  mode,
  refetch,
  turnstileToken = null,
}: SubmitAuthFormOptions): Promise<AuthErrorCode | null> {
  const validationError = validateAuthForm(mode, fields);
  if (validationError) return validationError;

  const normalizedEmail = fields.email.trim();
  if (mode === "sign-up" && !turnstileToken) {
    return TURNSTILE_REQUIRED_ERROR;
  }

  try {
    const result =
      mode === "sign-up"
        ? await client.signUp.email({
            name: fields.name.trim(),
            email: normalizedEmail,
            password: fields.password,
            fetchOptions: {
              headers: { "x-captcha-response": turnstileToken! },
            },
          })
        : await client.signIn.email({
            email: normalizedEmail,
            password: fields.password,
          });

    if (result.error) return getAuthErrorCode(result.error);

    await refetch();
    return null;
  } catch (caughtError) {
    return getAuthErrorCode(caughtError);
  }
}

export async function signInGuestSession({
  client,
  refetch,
  turnstileToken,
}: SignInGuestSessionOptions): Promise<AuthErrorCode | null> {
  if (!turnstileToken) return TURNSTILE_REQUIRED_ERROR;

  try {
    const result = await client.$fetch("/sign-in/shared-guest", {
      body: {},
      headers: { "x-captcha-response": turnstileToken },
      method: "POST",
    });
    if (result.error) return getAuthErrorCode(result.error);
    await refetch();
    return null;
  } catch (caughtError) {
    return getAuthErrorCode(caughtError);
  }
}

export async function signOutSession({
  client,
}: SignOutSessionOptions): Promise<AuthErrorCode | null> {
  try {
    const result = await client.signOut();
    if (result.error) return SIGN_OUT_ERROR;
    return null;
  } catch {
    return SIGN_OUT_ERROR;
  }
}

export async function deleteAccountSession({
  client,
  password,
  refetch,
}: DeleteAccountSessionOptions): Promise<AccountDeleteErrorCode> {
  try {
    const result = await client.deleteUser({ password });
    if (result.error) return DELETE_ACCOUNT_ERROR;

    await refetch();
    return null;
  } catch {
    return DELETE_ACCOUNT_ERROR;
  }
}

interface AuthSession {
  session: {
    id: string;
  };
  user: {
    email: string;
    id?: string | null;
    name?: string | null;
  };
}

interface AuthGateViewProps {
  children: ReactNode;
  fields: AuthFields;
  formError: AuthErrorCode | "";
  guardianAudience?: boolean;
  guardianUnlockDestination?: string | null;
  isPending: boolean;
  isRetrying: boolean;
  isSigningOut: boolean;
  isSubmitting: boolean;
  isGuestSubmitting: boolean;
  hasActiveLearner: boolean;
  learnerName: string | null;
  mode: AuthMode;
  onFieldChange: (field: keyof AuthFields, value: string) => void;
  onGuestSignIn: () => void;
  onModeChange: (mode: AuthMode) => void;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onOpenLearnerSwitcher: (() => void) | null;
  onRetry: () => void;
  onSignOut: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTurnstileTokenChange: (token: string | null) => void;
  profileError: string;
  session: AuthSession | null;
  sessionError: unknown;
  signOutError: AuthErrorCode | "";
  signedOutFallback: ReactNode | null;
  turnstileResetKey: number;
  turnstileSiteKey: string;
  turnstileToken: string | null;
}

function navigateInBrowser(path: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  window.history[options?.replace ? "replaceState" : "pushState"](
    null,
    "",
    path,
  );
  window.dispatchEvent(new window.PopStateEvent("popstate"));
}

function AccountExperienceHeader({
  error,
  guardianLabel,
  guardianUnlockDestination,
  hasActiveLearner,
  isSigningOut,
  learnerName,
  onNavigate,
  onOpenLearnerSwitcher,
  onSignOut,
  signOutError,
}: {
  error: string;
  guardianLabel: string;
  guardianUnlockDestination?: string | null;
  hasActiveLearner: boolean;
  isSigningOut: boolean;
  learnerName: string | null;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onOpenLearnerSwitcher: (() => void) | null;
  onSignOut: () => void;
  signOutError: AuthErrorCode | "";
}) {
  const access = useGuardianAccess();
  const { messages } = useGuardianLanguage();
  const [announcement, setAnnouncement] = useState<
    "guardian" | "learner" | null
  >(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [switchError, setSwitchError] = useState<
    import("./GuardianAccess").GuardianAccessErrorCode | null
  >(null);
  const activeMode = access.mode === "guardian" ? "guardian" : "learner";
  const accessErrorCode = access.error ?? switchError;
  const accessError = accessErrorCode
    ? messages.guardianAccess.errors[accessErrorCode]
    : "";
  const accountError = accessError || error;
  const localizedSignOutError = signOutError
    ? messages.auth.errors[signOutError]
    : "";
  const previousAccessModeRef = useRef(access.mode);

  useEffect(() => {
    const previousMode = previousAccessModeRef.current;
    previousAccessModeRef.current = access.mode;
    if (previousMode === "learner" && access.mode === "guardian") {
      setAnnouncement("guardian");
    } else if (previousMode === "guardian" && access.mode === "learner") {
      setAnnouncement("learner");
    }
  }, [access.mode]);

  async function switchToGuardian() {
    if (access.mode === "guardian" || isSwitchingMode) return;
    setIsSwitchingMode(true);
    setSwitchError(null);
    const nextError = await access.unlock("");
    setIsSwitchingMode(false);
    if (nextError) {
      setSwitchError(nextError);
      return;
    }
    onNavigate(guardianUnlockDestination ?? getGuardianPath(), {
      replace: true,
    });
  }

  return (
    <>
      <AccountHeader
        activeMode={activeMode}
        error={accountError}
        errorHelper={
          activeMode === "learner" && accessErrorCode
            ? "guardianAccessErrorHelper"
            : undefined
        }
        guardianLabel={guardianLabel}
        hasActiveLearner={hasActiveLearner}
        isModePending={isSwitchingMode}
        isSigningOut={activeMode === "guardian" && isSigningOut}
        learnerLabel={learnerName ?? ""}
        onOpenGuardianDashboard={() => onNavigate(getGuardianPath())}
        onOpenLearnerSwitcher={onOpenLearnerSwitcher}
        onRetryError={
          access.error
            ? access.retry
            : switchError
              ? () => void switchToGuardian()
              : undefined
        }
        onSelectGuardian={() => void switchToGuardian()}
        onSignOut={onSignOut}
        signOutError={activeMode === "guardian" ? localizedSignOutError : ""}
      />
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {announcement === "guardian"
          ? messages.account.guardianModeStatus
          : announcement === "learner"
            ? messages.account.learnerModeStatus
            : ""}
      </span>
    </>
  );
}

export function AuthGateView({
  children,
  fields,
  formError,
  guardianAudience = true,
  guardianUnlockDestination,
  hasActiveLearner,
  isPending,
  isRetrying,
  isSigningOut,
  isSubmitting,
  isGuestSubmitting,
  learnerName,
  mode,
  onFieldChange,
  onGuestSignIn,
  onModeChange,
  onNavigate,
  onOpenLearnerSwitcher,
  onRetry,
  onSignOut,
  onSubmit,
  onTurnstileTokenChange,
  profileError,
  session,
  sessionError,
  signOutError,
  signedOutFallback,
  turnstileResetKey,
  turnstileSiteKey,
  turnstileToken,
}: AuthGateViewProps) {
  const { messages: selectedMessages } = useGuardianLanguage();
  const messages = guardianAudience
    ? selectedMessages
    : englishGuardianMessages;
  const authHeadingRef = useRef<HTMLHeadingElement>(null);
  const authHeadingKey =
    isPending || isRetrying
      ? null
      : sessionError
        ? "session-error"
        : !session && !signedOutFallback
          ? mode
          : null;

  useEffect(() => {
    if (!authHeadingKey) return;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
    ) {
      return;
    }
    authHeadingRef.current?.focus({ preventScroll: true });
  }, [authHeadingKey]);

  if (isPending || isRetrying) {
    return (
      <AuthScreen>
        <AuthCard
          aria-busy="true"
          className="grid justify-items-center gap-4 text-center font-extrabold text-brand-navy"
          role="status"
        >
          <AuthParrotMark />
          <p>{messages.auth.checkingSession}</p>
        </AuthCard>
      </AuthScreen>
    );
  }

  if (sessionError) {
    return (
      <AuthScreen>
        <AuthCard
          className="grid justify-items-center gap-4 text-center font-extrabold text-brand-navy"
          role="alert"
        >
          <AuthParrotMark />
          <h1
            className="m-0 text-3xl leading-tight text-brand-ink outline-none focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-focus-dark focus-visible:ring-4 focus-visible:ring-focus-light sm:text-4xl"
            ref={authHeadingRef}
            tabIndex={-1}
          >
            {messages.auth.sessionUnavailableTitle}
          </h1>
          <p className="m-0 leading-relaxed">
            {messages.auth.sessionUnavailableBody}
          </p>
          <ActionButton onClick={onRetry} type="button">
            {messages.common.retry}
          </ActionButton>
        </AuthCard>
      </AuthScreen>
    );
  }

  if (!session && signedOutFallback) {
    return <>{signedOutFallback}</>;
  }

  if (!session) {
    const isSignUp = mode === "sign-up";
    const securityCheckComplete = Boolean(turnstileSiteKey && turnstileToken);
    const authActionPending = isSubmitting || isGuestSubmitting;

    return (
      <AuthScreen>
        <AuthCard aria-labelledby="auth-title">
          <header
            className={cx(
              "flex min-w-0 items-start gap-4 sm:items-center",
              isSignUp ? "mb-3" : "mb-6",
            )}
          >
            <AuthParrotMark />
            <h1
              className="m-0 min-w-0 text-3xl leading-tight text-brand-ink outline-none [overflow-wrap:anywhere] focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-focus-dark focus-visible:ring-4 focus-visible:ring-focus-light sm:text-4xl"
              id="auth-title"
              ref={authHeadingRef}
              tabIndex={-1}
            >
              {isSignUp
                ? messages.auth.createAccountTitle
                : messages.auth.welcomeBackTitle}
            </h1>
          </header>
          {isSignUp ? (
            <p className="mb-6 mt-0 font-bold leading-relaxed text-slate-600">
              {messages.auth.signUpHelp}
            </p>
          ) : null}

          <form onSubmit={onSubmit}>
            <fieldset
              className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
              disabled={authActionPending}
            >
              <SegmentedControl
                aria-label={messages.auth.modeLabel}
                className="grid-cols-1 sm:grid-cols-2"
              >
                <SegmentedButton
                  onClick={() => onModeChange("sign-in")}
                  selected={!isSignUp}
                  type="button"
                >
                  {messages.auth.signIn}
                </SegmentedButton>
                <SegmentedButton
                  onClick={() => onModeChange("sign-up")}
                  selected={isSignUp}
                  type="button"
                >
                  {messages.auth.signUp}
                </SegmentedButton>
              </SegmentedControl>

              {isSignUp ? (
                <label
                  className="grid gap-2 font-black text-brand-ink"
                  htmlFor="auth-name"
                >
                  <span>{messages.auth.accountName}</span>
                  <input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    onChange={(event) =>
                      onFieldChange("name", event.target.value)
                    }
                    required
                    className={fieldClassName({ tone: "tinted" })}
                    type="text"
                    value={fields.name}
                  />
                </label>
              ) : null}

              <label
                className="grid gap-2 font-black text-brand-ink"
                htmlFor="auth-email"
              >
                <span>{messages.auth.email}</span>
                <input
                  autoComplete="email"
                  id="auth-email"
                  inputMode="email"
                  name="email"
                  onChange={(event) =>
                    onFieldChange("email", event.target.value)
                  }
                  required
                  className={fieldClassName({ tone: "tinted" })}
                  type="email"
                  value={fields.email}
                />
              </label>

              <label
                className="grid gap-2 font-black text-brand-ink"
                htmlFor="auth-password"
              >
                <span>{messages.auth.password}</span>
                <input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  id="auth-password"
                  minLength={8}
                  name="password"
                  onChange={(event) =>
                    onFieldChange("password", event.target.value)
                  }
                  required
                  className={fieldClassName({ tone: "tinted" })}
                  type="password"
                  value={fields.password}
                />
                <small className="text-xs font-bold text-slate-500">
                  {messages.auth.passwordHint}
                </small>
              </label>

              {formError ? (
                <p
                  className="m-0 rounded-xl bg-rose-50 px-3 py-2.5 font-extrabold leading-snug text-red-800"
                  role="alert"
                >
                  {messages.auth.errors[formError]}
                </p>
              ) : null}

              <TurnstileWidget
                guardianAudience={guardianAudience}
                key={turnstileResetKey}
                onTokenChange={onTurnstileTokenChange}
                siteKey={turnstileSiteKey}
              />
              <p className="m-0 text-center text-xs font-bold leading-snug text-slate-500">
                {messages.auth.securityHelp}
              </p>

              <ActionButton
                disabled={isSignUp && !securityCheckComplete}
                fullWidth
                type="submit"
              >
                {isSubmitting
                  ? isSignUp
                    ? messages.auth.creatingAccount
                    : messages.auth.signingIn
                  : isSignUp
                    ? messages.auth.createAccount
                    : messages.auth.signInAndStart}
              </ActionButton>
              <div
                aria-hidden="true"
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400 before:h-px before:bg-sky-200 after:h-px after:bg-sky-200"
              >
                {messages.auth.or}
              </div>
              <ActionButton
                disabled={!securityCheckComplete || authActionPending}
                fullWidth
                onClick={onGuestSignIn}
                type="button"
                variant="surface"
              >
                {isGuestSubmitting
                  ? messages.auth.continuingAsGuest
                  : messages.auth.continueAsGuest}
              </ActionButton>
            </fieldset>
          </form>
        </AuthCard>
      </AuthScreen>
    );
  }

  const userLabel =
    session.user.name?.trim() || session.user.email || "Learner";
  const accountError =
    profileError ||
    (formError ? messages.auth.errors[formError] : "");
  const showNarrowSignOutRecovery = Boolean(signOutError) && !isSigningOut;

  return (
    <>
      <AccountExperienceHeader
        error={accountError}
        guardianLabel={userLabel}
        guardianUnlockDestination={guardianUnlockDestination}
        hasActiveLearner={hasActiveLearner}
        isSigningOut={isSigningOut}
        learnerName={learnerName}
        onNavigate={onNavigate}
        onOpenLearnerSwitcher={onOpenLearnerSwitcher}
        onSignOut={onSignOut}
        signOutError={signOutError}
      />
      <div
        className={
          showNarrowSignOutRecovery ? "max-wide:[&_main]:!pt-40" : undefined
        }
      >
        {children}
      </div>
    </>
  );
}

interface AuthGateProps {
  children: ReactNode;
  guardianAudience?: boolean;
  guardianUnlockDestination?: string | null;
  navigate?: (path: string, options?: { replace?: boolean }) => void;
  signedOutFallback?: ReactNode;
}

const EMPTY_FIELDS: AuthFields = { name: "", email: "", password: "" };

interface SignOutState {
  error: AuthErrorCode | "";
  isPending: boolean;
  owner: string | null;
}

interface ProfileActionState {
  action: AccountExperience | null;
  owner: string | null;
}

const EMPTY_SIGN_OUT_STATE: SignOutState = {
  error: "",
  isPending: false,
  owner: null,
};

const EMPTY_PROFILE_ACTION_STATE: ProfileActionState = {
  action: null,
  owner: null,
};

function getSessionIdentity(session: AuthSession | null) {
  if (!session) return null;
  const sessionId = session.session?.id?.trim();
  if (!sessionId) return null;
  const id = session.user.id?.trim();
  const userIdentity = id
    ? `id:${id}`
    : `email:${session.user.email.trim().toLowerCase()}`;
  return `${userIdentity}|session:${sessionId}`;
}

interface AuthGateClient extends AuthActionClient {
  useSession(): {
    data: AuthSession | null;
    error: unknown;
    isPending: boolean;
    refetch: () => Promise<unknown>;
  };
}

export type StateHook = <State>(
  initialState: State | (() => State),
) => [State, Dispatch<SetStateAction<State>>];

interface CreateAuthGateOptions {
  client: AuthGateClient;
  deleteAccountAction?: typeof deleteAccountSession;
  GuardianAccessBoundary?: ComponentType<{
    children: ReactNode;
    sessionIdentity: string | null;
  }>;
  signOutAction?: typeof signOutSession;
  guestSignInAction?: typeof signInGuestSession;
  stateHook?: StateHook;
  submitAction?: typeof submitAuthForm;
  turnstileSiteKey?: string;
  View?: ComponentType<AuthGateViewProps>;
}

export function createAuthGate({
  client,
  deleteAccountAction = deleteAccountSession,
  GuardianAccessBoundary = GuardianAccessProvider,
  signOutAction = signOutSession,
  guestSignInAction = signInGuestSession,
  stateHook = useState,
  submitAction = submitAuthForm,
  turnstileSiteKey = "",
  View = AuthGateView,
}: CreateAuthGateOptions) {
  return function AuthGateContainer({
    children,
    guardianAudience = true,
    guardianUnlockDestination,
    navigate = navigateInBrowser,
    signedOutFallback,
  }: AuthGateProps) {
    const {
      data: sessionData,
      isPending,
      error,
      refetch,
    } = client.useSession();
    const session = sessionData?.user ? sessionData : null;
    const [mode, setMode] = stateHook<AuthMode>("sign-in");
    const [fields, setFields] = stateHook<AuthFields>(EMPTY_FIELDS);
    const [formError, setFormError] = stateHook<AuthErrorCode | "">("");
    const [isSubmitting, setIsSubmitting] = stateHook(false);
    const [isGuestSubmitting, setIsGuestSubmitting] = stateHook(false);
    const [turnstileToken, setTurnstileToken] = stateHook<string | null>(null);
    const [turnstileResetKey, setTurnstileResetKey] = stateHook(0);
    const [signOutState, setSignOutState] =
      stateHook<SignOutState>(EMPTY_SIGN_OUT_STATE);
    const [isRetrying, setIsRetrying] = stateHook(false);
    const [profileActionState, setProfileActionState] =
      stateHook<ProfileActionState>(EMPTY_PROFILE_ACTION_STATE);
    const signOutAttemptRef = useRef<{ owner: string } | null>(null);
    const guestSignInAttemptRef = useRef(false);
    const sessionIdentity = getSessionIdentity(session);
    const isSharedGuest = session?.user.id === SHARED_GUEST_USER_ID;
    const currentSessionIdentityRef = useRef(sessionIdentity);
    currentSessionIdentityRef.current = sessionIdentity;
    const profileAction =
      profileActionState.owner === sessionIdentity
        ? profileActionState.action
        : null;
    const setProfileAction = useCallback<
      Dispatch<SetStateAction<AccountExperience | null>>
    >(
      (nextAction) => {
        setProfileActionState((current) => {
          if (currentSessionIdentityRef.current !== sessionIdentity) {
            return current;
          }
          const currentAction =
            current.owner === sessionIdentity ? current.action : null;
          const action =
            typeof nextAction === "function"
              ? nextAction(currentAction)
              : nextAction;
          return { action, owner: sessionIdentity };
        });
      },
      [sessionIdentity, setProfileActionState],
    );
    const ownsSignOutState =
      sessionIdentity !== null && signOutState.owner === sessionIdentity;
    const isSigningOut = ownsSignOutState && signOutState.isPending;

    useEffect(() => {
      if (
        signOutState.owner === null ||
        signOutState.owner === sessionIdentity
      ) {
        return;
      }
      signOutAttemptRef.current = null;
      setSignOutState(EMPTY_SIGN_OUT_STATE);
    }, [sessionIdentity, setSignOutState, signOutState.owner]);

    function selectMode(nextMode: AuthMode) {
      setMode(nextMode);
      setFormError("");
    }

    function updateField(field: keyof AuthFields, value: string) {
      setFields((currentFields) => ({ ...currentFields, [field]: value }));
    }

    async function handleRetry() {
      setIsRetrying(true);
      try {
        await refetch();
      } finally {
        setIsRetrying(false);
      }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setIsSubmitting(true);
      setFormError("");

      try {
        const nextError = await submitAction({
          client,
          fields,
          mode,
          refetch,
          turnstileToken,
        });
        setFormError(nextError ?? "");
      } finally {
        if (mode === "sign-up") {
          setTurnstileToken(null);
          setTurnstileResetKey((current) => current + 1);
        }
        setIsSubmitting(false);
      }
    }

    async function handleGuestSignIn() {
      if (guestSignInAttemptRef.current || isSubmitting) return;
      guestSignInAttemptRef.current = true;
      setIsGuestSubmitting(true);
      setFormError("");

      try {
        const nextError = await guestSignInAction({
          client,
          refetch,
          turnstileToken,
        });
        setFormError(nextError ?? "");
      } finally {
        guestSignInAttemptRef.current = false;
        setIsGuestSubmitting(false);
        setTurnstileToken(null);
        setTurnstileResetKey((current) => current + 1);
      }
    }

    async function handleSignOut() {
      if (sessionIdentity === null) return;
      if (signOutAttemptRef.current?.owner === sessionIdentity) return;
      const attempt = { owner: sessionIdentity };
      signOutAttemptRef.current = attempt;
      setSignOutState({
        error: "",
        isPending: true,
        owner: sessionIdentity,
      });
      setFormError("");

      let nextError: AuthErrorCode | null;
      try {
        nextError = await signOutAction({
          client,
        });
      } catch {
        nextError = SIGN_OUT_ERROR;
      }

      if (signOutAttemptRef.current !== attempt || nextError === null) return;
      signOutAttemptRef.current = null;
      setSignOutState({
        error: nextError,
        isPending: false,
        owner: sessionIdentity,
      });
    }

    async function handleDeleteAccount(password: string) {
      return deleteAccountAction({
        client,
        password,
        refetch,
      });
    }

    return (
      <>
        {!session ? <GuardianLanguageControl /> : null}
        <AccountActionProvider
          deleteAccount={handleDeleteAccount}
          isSharedGuest={isSharedGuest}
          profileAction={profileAction}
          sessionIdentity={sessionIdentity}
          setProfileAction={setProfileAction}
        >
          <GuardianAccessBoundary
            key={sessionIdentity ?? "signed-out"}
            sessionIdentity={sessionIdentity}
          >
            <View
              fields={fields}
              formError={formError}
              guardianAudience={guardianAudience}
              isPending={isPending}
              isRetrying={isRetrying}
              isSigningOut={isSigningOut}
              isSubmitting={isSubmitting}
              isGuestSubmitting={isGuestSubmitting}
              hasActiveLearner={profileAction?.hasActiveLearner ?? false}
              learnerName={profileAction?.learnerName ?? null}
              guardianUnlockDestination={
                profileAction?.guardianUnlockDestination ??
                guardianUnlockDestination ??
                null
              }
              mode={mode}
              onFieldChange={updateField}
              onGuestSignIn={() => void handleGuestSignIn()}
              onModeChange={selectMode}
              onNavigate={navigate}
              onOpenLearnerSwitcher={
                profileAction?.onOpenLearnerSwitcher ?? null
              }
              onRetry={() => void handleRetry()}
              onSignOut={handleSignOut}
              onSubmit={handleSubmit}
              onTurnstileTokenChange={setTurnstileToken}
              profileError={profileAction?.error ?? ""}
              session={session}
              sessionError={error}
              signOutError={ownsSignOutState ? signOutState.error : ""}
              signedOutFallback={signedOutFallback ?? null}
              turnstileResetKey={turnstileResetKey}
              turnstileSiteKey={turnstileSiteKey}
              turnstileToken={turnstileToken}
            >
              {children}
            </View>
          </GuardianAccessBoundary>
        </AccountActionProvider>
      </>
    );
  };
}

const ProductionAuthGate = createAuthGate({
  client: authClient,
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "",
});

export function AuthGate(props: Omit<AuthGateProps, "navigate">) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <ProductionAuthGate
      {...props}
      guardianAudience={isGuardianGuidanceSurface(
        location.pathname,
        location.search,
      )}
      guardianUnlockDestination={getSafeGuardianUnlockDestination(
        location.pathname,
        location.search,
        location.hash,
      )}
      navigate={navigate}
    />
  );
}
