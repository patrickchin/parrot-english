export type AuthMode = "sign-in" | "sign-up";

export interface AuthFields {
  name: string;
  email: string;
  password: string;
}

export type AuthErrorCode =
  | "name-required"
  | "invalid-email"
  | "password-too-short"
  | "email-registered"
  | "invalid-credentials"
  | "security-check-required"
  | "security-check-rejected"
  | "sign-in-failed"
  | "sign-out-failed";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function validateAuthForm(
  mode: AuthMode,
  fields: AuthFields,
): AuthErrorCode | null {
  if (mode === "sign-up" && !fields.name.trim()) {
    return "name-required";
  }

  if (!EMAIL_PATTERN.test(fields.email.trim())) {
    return "invalid-email";
  }

  if (fields.password.length < 8) {
    return "password-too-short";
  }

  return null;
}

const AUTH_ERROR_CODES: Record<string, AuthErrorCode> = {
  USER_ALREADY_EXISTS: "email-registered",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "email-registered",
  INVALID_EMAIL_OR_PASSWORD: "invalid-credentials",
  INVALID_EMAIL: "invalid-email",
  PASSWORD_TOO_SHORT: "password-too-short",
  MISSING_RESPONSE: "security-check-rejected",
  VERIFICATION_FAILED: "security-check-rejected",
  UNKNOWN_ERROR: "security-check-rejected",
};

export function getAuthErrorCode(error: unknown): AuthErrorCode {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return Object.hasOwn(AUTH_ERROR_CODES, error.code)
      ? AUTH_ERROR_CODES[error.code]!
      : "sign-in-failed";
  }

  return "sign-in-failed";
}
