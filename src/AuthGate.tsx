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

const SIGN_OUT_ERROR_MESSAGE = "暂时无法退出登录，请稍后再试。";

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
          <p>正在检查登录状态…</p>
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
          <h1>登录服务暂时不可用</h1>
          <p>请检查网络连接，然后再试一次。</p>
          <button className="auth-submit" onClick={onRetry} type="button">
            重试
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
            <h1 id="auth-title">{isSignUp ? "创建学习账号" : "欢迎回来"}</h1>
          </header>

          <form onSubmit={onSubmit}>
            <fieldset className="auth-fieldset" disabled={isSubmitting}>
              <div className="auth-mode-switch" aria-label="选择登录或注册">
                <button
                  aria-pressed={!isSignUp}
                  className={!isSignUp ? "is-active" : ""}
                  onClick={() => onModeChange("sign-in")}
                  type="button"
                >
                  登录
                </button>
                <button
                  aria-pressed={isSignUp}
                  className={isSignUp ? "is-active" : ""}
                  onClick={() => onModeChange("sign-up")}
                  type="button"
                >
                  注册
                </button>
              </div>

              {isSignUp ? (
                <label className="auth-field" htmlFor="auth-name">
                  <span>名字</span>
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
                <span>邮箱</span>
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
                <span>密码</span>
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
                <small>至少 8 个字符</small>
              </label>

              {formError ? (
                <p className="auth-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <button className="auth-submit" type="submit">
                {isSubmitting
                  ? isSignUp
                    ? "正在注册…"
                    : "正在登录…"
                  : isSignUp
                    ? "创建账号"
                    : "登录并开始"}
              </button>
            </fieldset>
          </form>
        </section>
      </main>
    );
  }

  const userLabel = session.user.name?.trim() || session.user.email || "小朋友";
  const accountError = profileError || formError;

  return (
    <>
      <aside className="user-session-bar" aria-label="当前登录账号">
        <span title={session.user.email}>{userLabel}</span>
        {onOpenProfile ? (
          <button
            aria-label="Edit learner profile"
            className="profile-account-button"
            onClick={onOpenProfile}
            type="button"
          >
            Profile
          </button>
        ) : null}
        <button disabled={isSigningOut} onClick={onSignOut} type="button">
          {isSigningOut ? "正在退出…" : "退出登录"}
        </button>
        {accountError ? (
          <span className="session-error" role="alert">
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
