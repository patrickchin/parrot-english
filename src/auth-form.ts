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
    return "请输入名字。";
  }

  if (!EMAIL_PATTERN.test(fields.email.trim())) {
    return "请输入有效的邮箱地址。";
  }

  if (fields.password.length < 8) {
    return "密码至少需要 8 个字符。";
  }

  return null;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "这个邮箱已经注册，请直接登录。",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "这个邮箱已经注册，请直接登录。",
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确。",
  INVALID_EMAIL: "请输入有效的邮箱地址。",
  PASSWORD_TOO_SHORT: "密码至少需要 8 个字符。",
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
      : "暂时无法登录，请稍后再试。";
  }

  return "暂时无法登录，请稍后再试。";
}
