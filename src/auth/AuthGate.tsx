import {
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
import { useNavigate } from "react-router";
import { AccountHeader } from "../app/AppHeader";
import {
  getAuthErrorMessage,
  validateAuthForm,
  type AuthFields,
  type AuthMode,
} from "./auth-form";
import {
  AccountActionProvider,
  type AccountExperience,
} from "./account-actions";
import { authClient } from "./auth-client";
import {
  GuardianAccessProvider,
  useGuardianAccess,
} from "./GuardianAccess";
import { GuardianUnlockDialog } from "./GuardianUnlock";
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

export interface AuthActionClient {
  deleteUser(fields: { password: string }): Promise<AuthActionResult>;
  signIn: {
    email(fields: { email: string; password: string }): Promise<AuthActionResult>;
  };
  signOut(): Promise<AuthActionResult>;
  signUp: {
    email(fields: {
      name: string;
      email: string;
      password: string;
    }): Promise<AuthActionResult>;
  };
}

interface SubmitAuthFormOptions {
  client: AuthActionClient;
  fields: AuthFields;
  mode: AuthMode;
  refetch: () => Promise<unknown>;
}

interface SignOutSessionOptions {
  client: AuthActionClient;
}

interface DeleteAccountSessionOptions {
  client: AuthActionClient;
  password: string;
  refetch: () => Promise<unknown>;
}

const SIGN_OUT_ERROR_MESSAGE = "Sign out did not finish.";
const DELETE_ACCOUNT_ERROR_MESSAGE =
  "Unable to delete the account. The account and private story art were kept. Please try again.";

function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="grid h-dvh w-full items-start justify-items-center overflow-y-auto bg-auth p-5 sm:place-items-center sm:p-10 lg:p-14">
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
      className={cx("my-auto w-full max-w-lg p-6 sm:p-10", className)}
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
}: SubmitAuthFormOptions): Promise<string | null> {
  const validationError = validateAuthForm(mode, fields);
  if (validationError) return validationError;

  const normalizedEmail = fields.email.trim();

  try {
    const result =
      mode === "sign-up"
        ? await client.signUp.email({
            name: fields.name.trim(),
            email: normalizedEmail,
            password: fields.password,
          })
        : await client.signIn.email({
            email: normalizedEmail,
            password: fields.password,
          });

    if (result.error) return getAuthErrorMessage(result.error);

    await refetch();
    return null;
  } catch (caughtError) {
    return getAuthErrorMessage(caughtError);
  }
}

export async function signOutSession({
  client,
}: SignOutSessionOptions): Promise<string | null> {
  try {
    const result = await client.signOut();
    if (result.error) return SIGN_OUT_ERROR_MESSAGE;

    return null;
  } catch {
    return SIGN_OUT_ERROR_MESSAGE;
  }
}

export async function deleteAccountSession({
  client,
  password,
  refetch,
}: DeleteAccountSessionOptions): Promise<string | null> {
  try {
    const result = await client.deleteUser({ password });
    if (result.error) return DELETE_ACCOUNT_ERROR_MESSAGE;

    await refetch();
    return null;
  } catch {
    return DELETE_ACCOUNT_ERROR_MESSAGE;
  }
}

interface AuthSession {
  user: {
    email: string;
    id?: string | null;
    name?: string | null;
  };
}

interface AuthGateViewProps {
  children: ReactNode;
  fields: AuthFields;
  formError: string;
  isPending: boolean;
  isRetrying: boolean;
  isSigningOut: boolean;
  isSubmitting: boolean;
  learnerName: string | null;
  mode: AuthMode;
  onDeleteAccount: (password: string) => Promise<string | null>;
  onFieldChange: (field: keyof AuthFields, value: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onNavigate: (path: string) => void;
  onOpenProfile: (() => void) | null;
  onRetry: () => void;
  onSignOut: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  profileError: string;
  session: AuthSession | null;
  sessionError: unknown;
  signOutError: string;
  signedOutFallback: ReactNode | null;
}

function navigateInBrowser(path: string) {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new window.PopStateEvent("popstate"));
}

function AccountExperienceHeader({
  error,
  guardianLabel,
  isSigningOut,
  learnerName,
  onDeleteAccount,
  onNavigate,
  onOpenProfile,
  onSignOut,
  signOutError,
  userEmail,
}: {
  error: string;
  guardianLabel: string;
  isSigningOut: boolean;
  learnerName: string | null;
  onDeleteAccount: (password: string) => Promise<string | null>;
  onNavigate: (path: string) => void;
  onOpenProfile: (() => void) | null;
  onSignOut: () => void;
  signOutError: string;
  userEmail: string;
}) {
  const access = useGuardianAccess();
  const [isModePending, setIsModePending] = useState(false);
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const unlockButtonRef = useRef<HTMLButtonElement>(null);
  const activeMode = access.mode === "guardian" ? "guardian" : "learner";

  useEffect(() => {
    if (access.mode !== "guardian") setAnnouncement("");
  }, [access.mode]);

  async function selectLearner() {
    if (access.mode !== "guardian" || isModePending) return;
    setIsModePending(true);
    try {
      const lockError = await access.lock();
      if (!lockError) {
        onNavigate("/");
      }
    } finally {
      setIsModePending(false);
    }
  }

  return (
    <>
      <AccountHeader
        activeMode={activeMode}
        error={access.error || error}
        guardianLabel={guardianLabel}
        isDialogOpen={isUnlockOpen}
        isModePending={isModePending}
        isSigningOut={isSigningOut}
        learnerLabel={learnerName?.trim() || "Learner"}
        onDeleteAccount={onDeleteAccount}
        onOpenProfile={onOpenProfile ?? (() => onNavigate("/profile"))}
        onSelectGuardian={(button) => {
          if (access.mode !== "guardian") {
            unlockButtonRef.current = button;
            setIsUnlockOpen(true);
          }
        }}
        onSelectLearner={() => void selectLearner()}
        onSignOut={onSignOut}
        signOutError={signOutError}
        userEmail={userEmail}
      />
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {announcement}
      </span>
      {isUnlockOpen ? (
        <GuardianUnlockDialog
          onClose={() => setIsUnlockOpen(false)}
          onUnlocked={() => {
            setAnnouncement("Guardian mode unlocked for 15 minutes");
            setIsUnlockOpen(false);
            onNavigate("/guardian");
          }}
          returnFocusRef={unlockButtonRef}
        />
      ) : null}
    </>
  );
}

export function AuthGateView({
  children,
  fields,
  formError,
  isPending,
  isRetrying,
  isSigningOut,
  isSubmitting,
  learnerName,
  mode,
  onDeleteAccount,
  onFieldChange,
  onModeChange,
  onNavigate,
  onOpenProfile,
  onRetry,
  onSignOut,
  onSubmit,
  profileError,
  session,
  sessionError,
  signOutError,
  signedOutFallback,
}: AuthGateViewProps) {
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
          <p>Checking your session…</p>
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
            Sign-in is temporarily unavailable
          </h1>
          <p className="m-0 leading-relaxed">
            Check your connection, then try again.
          </p>
          <ActionButton onClick={onRetry} type="button">
            Try again
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

    return (
      <AuthScreen>
        <AuthCard aria-labelledby="auth-title">
          <header
            className={cx(
              "flex items-start gap-4 sm:items-center",
              isSignUp ? "mb-3" : "mb-6",
            )}
          >
            <AuthParrotMark />
            <h1
              className="m-0 text-3xl leading-tight text-brand-ink outline-none focus-visible:rounded-lg focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-focus-dark focus-visible:ring-4 focus-visible:ring-focus-light sm:text-4xl"
              id="auth-title"
              ref={authHeadingRef}
              tabIndex={-1}
            >
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
          </header>
          {isSignUp ? (
            <p className="mb-6 mt-0 font-bold leading-relaxed text-slate-600">
              Use an adult or learner account name. You’ll set up the learner
              profile next.
            </p>
          ) : null}

          <form onSubmit={onSubmit}>
            <fieldset
              className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
              disabled={isSubmitting}
            >
              <SegmentedControl
                aria-label="Choose sign in or sign up"
                className="grid-cols-1 sm:grid-cols-2"
              >
                <SegmentedButton
                  onClick={() => onModeChange("sign-in")}
                  selected={!isSignUp}
                  type="button"
                >
                  Sign in
                </SegmentedButton>
                <SegmentedButton
                  onClick={() => onModeChange("sign-up")}
                  selected={isSignUp}
                  type="button"
                >
                  Sign up
                </SegmentedButton>
              </SegmentedControl>

              {isSignUp ? (
                <label
                  className="grid gap-2 font-black text-brand-ink"
                  htmlFor="auth-name"
                >
                  <span>Account name</span>
                  <input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    onChange={(event) => onFieldChange("name", event.target.value)}
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
                <span>Email</span>
                <input
                  autoComplete="email"
                  id="auth-email"
                  inputMode="email"
                  name="email"
                  onChange={(event) => onFieldChange("email", event.target.value)}
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
                <span>Password</span>
                <input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  id="auth-password"
                  minLength={8}
                  name="password"
                  onChange={(event) => onFieldChange("password", event.target.value)}
                  required
                  className={fieldClassName({ tone: "tinted" })}
                  type="password"
                  value={fields.password}
                />
                <small className="text-xs font-bold text-slate-500">
                  At least 8 characters
                </small>
              </label>

              {formError ? (
                <p
                  className="m-0 rounded-xl bg-rose-50 px-3 py-2.5 font-extrabold leading-snug text-red-800"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <ActionButton fullWidth type="submit">
                {isSubmitting
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Sign in and start"}
              </ActionButton>
            </fieldset>
          </form>
        </AuthCard>
      </AuthScreen>
    );
  }

  const userLabel = session.user.name?.trim() || session.user.email || "Learner";
  const accountError = profileError || formError;

  return (
    <>
      <AccountExperienceHeader
        error={accountError}
        guardianLabel={userLabel}
        isSigningOut={isSigningOut}
        learnerName={learnerName}
        onDeleteAccount={onDeleteAccount}
        onNavigate={onNavigate}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
        signOutError={signOutError}
        userEmail={session.user.email}
      />
      {children}
    </>
  );
}

interface AuthGateProps {
  children: ReactNode;
  navigate?: (path: string) => void;
  signedOutFallback?: ReactNode;
}

const EMPTY_FIELDS: AuthFields = { name: "", email: "", password: "" };

interface SignOutState {
  error: string;
  isPending: boolean;
  owner: string | null;
}

const EMPTY_SIGN_OUT_STATE: SignOutState = {
  error: "",
  isPending: false,
  owner: null,
};

function getSessionIdentity(session: AuthSession | null) {
  if (!session) return null;
  const id = session.user.id?.trim();
  return id
    ? `id:${id}`
    : `email:${session.user.email.trim().toLowerCase()}`;
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
  stateHook?: StateHook;
  submitAction?: typeof submitAuthForm;
  View?: ComponentType<AuthGateViewProps>;
}

export function createAuthGate({
  client,
  deleteAccountAction = deleteAccountSession,
  GuardianAccessBoundary = GuardianAccessProvider,
  signOutAction = signOutSession,
  stateHook = useState,
  submitAction = submitAuthForm,
  View = AuthGateView,
}: CreateAuthGateOptions) {
  return function AuthGateContainer({
    children,
    navigate = navigateInBrowser,
    signedOutFallback,
  }: AuthGateProps) {
    const { data: session, isPending, error, refetch } = client.useSession();
    const [mode, setMode] = stateHook<AuthMode>("sign-in");
    const [fields, setFields] = stateHook<AuthFields>(EMPTY_FIELDS);
    const [formError, setFormError] = stateHook("");
    const [isSubmitting, setIsSubmitting] = stateHook(false);
    const [signOutState, setSignOutState] =
      stateHook<SignOutState>(EMPTY_SIGN_OUT_STATE);
    const [isRetrying, setIsRetrying] = stateHook(false);
    const [profileAction, setProfileAction] =
      stateHook<AccountExperience | null>(null);
    const signOutAttemptRef = useRef<{ owner: string } | null>(null);
    const sessionIdentity = getSessionIdentity(session);
    const ownsSignOutState =
      sessionIdentity !== null && signOutState.owner === sessionIdentity;

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
        });
        setFormError(nextError ?? "");
      } finally {
        setIsSubmitting(false);
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

      let nextError: string | null;
      try {
        nextError = await signOutAction({ client });
      } catch {
        nextError = SIGN_OUT_ERROR_MESSAGE;
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
      return deleteAccountAction({ client, password, refetch });
    }

    return (
      <AccountActionProvider setProfileAction={setProfileAction}>
        <GuardianAccessBoundary
          key={sessionIdentity ?? "signed-out"}
          sessionIdentity={sessionIdentity}
        >
          <View
            fields={fields}
            formError={formError}
            isPending={isPending}
            isRetrying={isRetrying}
            isSigningOut={ownsSignOutState && signOutState.isPending}
            isSubmitting={isSubmitting}
            learnerName={profileAction?.learnerName ?? null}
            mode={mode}
            onDeleteAccount={handleDeleteAccount}
            onFieldChange={updateField}
            onModeChange={selectMode}
            onNavigate={navigate}
            onOpenProfile={profileAction?.onOpenProfile ?? null}
            onRetry={() => void handleRetry()}
            onSignOut={handleSignOut}
            onSubmit={handleSubmit}
            profileError={profileAction?.error ?? ""}
            session={session}
            sessionError={error}
            signOutError={ownsSignOutState ? signOutState.error : ""}
            signedOutFallback={signedOutFallback ?? null}
          >
            {children}
          </View>
        </GuardianAccessBoundary>
      </AccountActionProvider>
    );
  };
}

const ProductionAuthGate = createAuthGate({ client: authClient });

export function AuthGate(props: Omit<AuthGateProps, "navigate">) {
  const navigate = useNavigate();
  return <ProductionAuthGate {...props} navigate={navigate} />;
}
