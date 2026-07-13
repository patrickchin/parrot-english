import {
  useState,
  type ComponentProps,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type FormEventHandler,
  type ReactNode,
  type SetStateAction,
} from "react";
import { AccountHeader } from "../app/AppHeader";
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
import { ActionButton, cx, fieldClassName } from "../shared/ui";

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
    <section
      className={cx(
        "my-auto w-full max-w-lg rounded-3xl border-4 border-white bg-white p-6 shadow-card sm:p-10",
        className,
      )}
      {...props}
    >
      {children}
    </section>
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
          <h1 className="m-0 text-3xl leading-tight text-brand-ink sm:text-4xl">
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
          <header className="mb-6 flex items-start gap-4 sm:items-center">
            <AuthParrotMark />
            <h1
              className="m-0 text-3xl leading-tight text-brand-ink sm:text-4xl"
              id="auth-title"
            >
              {isSignUp ? "Create a learning account" : "Welcome back"}
            </h1>
          </header>

          <form onSubmit={onSubmit}>
            <fieldset
              className="m-0 grid min-w-0 gap-4 border-0 p-0 disabled:opacity-75"
              disabled={isSubmitting}
            >
              <div
                aria-label="Choose sign in or sign up"
                className="grid grid-cols-1 gap-1.5 rounded-2xl bg-sky-100 p-1 sm:grid-cols-2"
              >
                <button
                  aria-pressed={!isSignUp}
                  className={cx(
                    "min-h-12 cursor-pointer rounded-xl border-0 bg-transparent font-black text-brand-navy",
                    !isSignUp &&
                      "bg-brand-navy text-white shadow-control-navy",
                  )}
                  onClick={() => onModeChange("sign-in")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  aria-pressed={isSignUp}
                  className={cx(
                    "min-h-12 cursor-pointer rounded-xl border-0 bg-transparent font-black text-brand-navy",
                    isSignUp &&
                      "bg-brand-navy text-white shadow-control-navy",
                  )}
                  onClick={() => onModeChange("sign-up")}
                  type="button"
                >
                  Sign up
                </button>
              </div>

              {isSignUp ? (
                <label
                  className="grid gap-2 font-black text-brand-ink"
                  htmlFor="auth-name"
                >
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    onChange={(event) => onFieldChange("name", event.target.value)}
                    required
                    className={fieldClassName("bg-sky-50")}
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
                  className={fieldClassName("bg-sky-50")}
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
                  className={fieldClassName("bg-sky-50")}
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

              <ActionButton
                className="w-full rounded-full border-4 border-white hover:-translate-y-px hover:brightness-95"
                type="submit"
              >
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
      <AccountHeader
        error={accountError}
        isSigningOut={isSigningOut}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
        userEmail={session.user.email}
        userLabel={userLabel}
      />
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
