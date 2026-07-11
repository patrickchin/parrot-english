export type AuthMode = "sign-in" | "sign-up";

export interface AuthFields {
  name: string;
  email: string;
  password: string;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function validateAuthForm(
  mode: AuthMode,
  fields: AuthFields,
): string | null {
  if (mode === "sign-up" && !fields.name.trim()) {
    return "Enter your name.";
  }

  if (!EMAIL_PATTERN.test(fields.email.trim())) {
    return "Enter a valid email address.";
  }

  if (fields.password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "This email is already registered. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "This email is already registered. Sign in instead.",
  INVALID_EMAIL_OR_PASSWORD: "The email or password is incorrect.",
  INVALID_EMAIL: "Enter a valid email address.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
};

export function getAuthErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return Object.hasOwn(AUTH_ERROR_MESSAGES, error.code)
      ? AUTH_ERROR_MESSAGES[error.code]
      : "Unable to sign you in. Please try again.";
  }

  return "Unable to sign you in. Please try again.";
}
