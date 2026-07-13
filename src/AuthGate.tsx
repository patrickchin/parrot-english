import {
  useState,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  getAuthErrorMessage,
  validateAuthForm,
  type AuthFields,
  type AuthMode,
} from "./auth-form";
import {
  AccountActionProvider,
  type ProfileAccountAction,
} from "./account-actions";
import { authClient } from "./auth-client";

interface AuthActionResult {
  error?: unknown | null;
}

export interface AuthActionClient {
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
  refetch: () => Promise<unknown>;
}

const SIGN_OUT_ERROR_MESSAGE = "Unable to log you out. Please try again.";
const SESSION_BAR_CLASSES =
  "user-session-bar group/session fixed top-[clamp(14px,2.2vh,28px)] right-[clamp(86px,7vw,112px)] z-40 flex min-h-12 max-w-[min(62vw,520px)] items-center gap-2.5 rounded-full border-4 border-white bg-[#204c7f] py-1 pr-[5px] pl-[15px] text-white shadow-[0_5px_0_rgb(18_55_92_/_45%)] max-[720px]:top-[94px] max-[720px]:right-3 max-[720px]:max-w-[calc(100vw-24px)] max-[720px]:[&:has(+_.conversation-screen)]:top-[clamp(14px,2.2vh,28px)] max-[720px]:[&:has(+_.conversation-screen)]:min-h-[52px] max-[720px]:[&:has(+_.conversation-screen)]:max-w-[calc(100vw-92px)] max-[720px]:[&:has(+_.conversation-screen)]:gap-1.5 max-[720px]:[&:has(+_.conversation-screen)]:px-1 max-[720px]:[&:has(+_.conversation-screen)]:py-0 [@media(max-height:620px)]:[&:has(+_.conversation-screen)]:top-[10px]";
const SESSION_LABEL_CLASSES =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--lesson-ui-font-size)] font-[900] max-[720px]:group-has-[+_.conversation-screen]/session:hidden";
const SESSION_BUTTON_CLASSES =
  "min-h-12 shrink-0 cursor-pointer whitespace-nowrap rounded-full border-0 px-3 py-1.5 text-[length:var(--lesson-ui-font-size)] font-[900] disabled:cursor-wait disabled:opacity-[0.76] max-[720px]:group-has-[+_.conversation-screen]/session:min-h-11 max-[720px]:group-has-[+_.conversation-screen]/session:px-3 max-[720px]:group-has-[+_.conversation-screen]/session:py-1";
const SESSION_ERROR_CLASSES =
  "session-error absolute top-[calc(100%+9px)] right-0 w-[min(82vw,340px)] rounded-[13px] border-[3px] border-white bg-[#9d243f] px-3 py-[9px] text-[0.8rem] font-[850] text-white shadow-[0_4px_0_rgb(95_16_36_/_35%)]";

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
  refetch,
}: SignOutSessionOptions): Promise<string | null> {
  try {
    const result = await client.signOut();
    if (result.error) return SIGN_OUT_ERROR_MESSAGE;

    await refetch();
    return null;
  } catch {
    return SIGN_OUT_ERROR_MESSAGE;
  }
}

interface AuthSession {
  user: {
    email: string;
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
  mode: AuthMode;
  onFieldChange: (field: keyof AuthFields, value: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onOpenProfile: (() => void) | null;
  onRetry: () => void;
  onSignOut: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  profileError: string;
  session: AuthSession | null;
  sessionError: unknown;
  signedOutFallback: ReactNode | null;
}

export function AuthGateView({
  children,
  fields,
  formError,
  isPending,
  isRetrying,
  isSigningOut,
  isSubmitting,
  mode,
  onFieldChange,
  onModeChange,
  onOpenProfile,
  onRetry,
  onSignOut,
  onSubmit,
  profileError,
  session,
  sessionError,
  signedOutFallback,
}: AuthGateViewProps) {
  if (isPending || isRetrying) {
    return (
      <main className="auth-screen">
        <section aria-busy="true" className="auth-card auth-status-card" role="status">
          <span aria-hidden="true" className="auth-parrot-mark">
            P
          </span>
          <p>Checking your session…</p>
        </section>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-status-card" role="alert">
          <span aria-hidden="true" className="auth-parrot-mark">
            P
          </span>
          <h1>Sign-in is temporarily unavailable</h1>
          <p>Check your connection, then try again.</p>
          <button className="auth-submit" onClick={onRetry} type="button">
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!session && signedOutFallback) {
    return <>{signedOutFallback}</>;
  }

  if (!session) {
    const isSignUp = mode === "sign-up";

    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-heading">
            <span aria-hidden="true" className="auth-parrot-mark">
              P
            </span>
            <h1 id="auth-title">
              {isSignUp ? "Create a learning account" : "Welcome back"}
            </h1>
          </header>

          <form onSubmit={onSubmit}>
            <fieldset className="auth-fieldset" disabled={isSubmitting}>
              <div className="auth-mode-switch" aria-label="Choose sign in or sign up">
                <button
                  aria-pressed={!isSignUp}
                  className={!isSignUp ? "is-active" : ""}
                  onClick={() => onModeChange("sign-in")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  aria-pressed={isSignUp}
                  className={isSignUp ? "is-active" : ""}
                  onClick={() => onModeChange("sign-up")}
                  type="button"
                >
                  Sign up
                </button>
              </div>

              {isSignUp ? (
                <label className="auth-field" htmlFor="auth-name">
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    onChange={(event) => onFieldChange("name", event.target.value)}
                    required
                    type="text"
                    value={fields.name}
                  />
                </label>
              ) : null}

              <label className="auth-field" htmlFor="auth-email">
                <span>Email</span>
                <input
                  autoComplete="email"
                  id="auth-email"
                  inputMode="email"
                  name="email"
                  onChange={(event) => onFieldChange("email", event.target.value)}
                  required
                  type="email"
                  value={fields.email}
                />
              </label>

              <label className="auth-field" htmlFor="auth-password">
                <span>Password</span>
                <input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  id="auth-password"
                  minLength={8}
                  name="password"
                  onChange={(event) => onFieldChange("password", event.target.value)}
                  required
                  type="password"
                  value={fields.password}
                />
                <small>At least 8 characters</small>
              </label>

              {formError ? (
                <p className="auth-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <button className="auth-submit" type="submit">
                {isSubmitting
                  ? isSignUp
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignUp
                    ? "Create account"
                    : "Sign in and start"}
              </button>
            </fieldset>
          </form>
        </section>
      </main>
    );
  }

  const userLabel = session.user.name?.trim() || session.user.email || "Learner";
  const accountError = profileError || formError;

  return (
    <>
      <aside
        className={SESSION_BAR_CLASSES}
        aria-label="Current account"
      >
        <span className={SESSION_LABEL_CLASSES} title={session.user.email}>
          {userLabel}
        </span>
        {onOpenProfile ? (
          <button
            aria-label="Edit learner profile"
            className={`${SESSION_BUTTON_CLASSES} bg-white text-[#204c7f]`}
            onClick={onOpenProfile}
            type="button"
          >
            Profile
          </button>
        ) : null}
        <button
          className={`${SESSION_BUTTON_CLASSES} bg-[#ff467b] text-white`}
          disabled={isSigningOut}
          onClick={onSignOut}
          type="button"
        >
          {isSigningOut ? "Signing out…" : "Log out"}
        </button>
        {accountError ? (
          <span className={SESSION_ERROR_CLASSES} role="alert">
            {accountError}
          </span>
        ) : null}
      </aside>
      {children}
    </>
  );
}

interface AuthGateProps {
  children: ReactNode;
  signedOutFallback?: ReactNode;
}

const EMPTY_FIELDS: AuthFields = { name: "", email: "", password: "" };

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
  signOutAction?: typeof signOutSession;
  stateHook?: StateHook;
  submitAction?: typeof submitAuthForm;
  View?: ComponentType<AuthGateViewProps>;
}

export function createAuthGate({
  client,
  signOutAction = signOutSession,
  stateHook = useState,
  submitAction = submitAuthForm,
  View = AuthGateView,
}: CreateAuthGateOptions) {
  return function AuthGateContainer({
    children,
    signedOutFallback,
  }: AuthGateProps) {
    const { data: session, isPending, error, refetch } = client.useSession();
    const [mode, setMode] = stateHook<AuthMode>("sign-in");
    const [fields, setFields] = stateHook<AuthFields>(EMPTY_FIELDS);
    const [formError, setFormError] = stateHook("");
    const [isSubmitting, setIsSubmitting] = stateHook(false);
    const [isSigningOut, setIsSigningOut] = stateHook(false);
    const [isRetrying, setIsRetrying] = stateHook(false);
    const [profileAction, setProfileAction] =
      stateHook<ProfileAccountAction>(null);

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
      setIsSigningOut(true);
      setFormError("");

      try {
        const nextError = await signOutAction({
          client,
          refetch,
        });
        setFormError(nextError ?? "");
      } finally {
        setIsSigningOut(false);
      }
    }

    return (
      <AccountActionProvider setProfileAction={setProfileAction}>
        <View
          fields={fields}
          formError={formError}
          isPending={isPending}
          isRetrying={isRetrying}
          isSigningOut={isSigningOut}
          isSubmitting={isSubmitting}
          mode={mode}
          onFieldChange={updateField}
          onModeChange={selectMode}
          onOpenProfile={profileAction?.onOpen ?? null}
          onRetry={() => void handleRetry()}
          onSignOut={handleSignOut}
          onSubmit={handleSubmit}
          profileError={profileAction?.error ?? ""}
          session={session}
          sessionError={error}
          signedOutFallback={signedOutFallback ?? null}
        >
          {children}
        </View>
      </AccountActionProvider>
    );
  };
}

export const AuthGate = createAuthGate({ client: authClient });
