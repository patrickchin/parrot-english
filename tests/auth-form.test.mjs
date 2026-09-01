import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthErrorCode,
  validateAuthForm,
} from "../src/auth/auth-form.ts";

const validFields = {
  name: "小明",
  email: "xiaoming@example.com",
  password: "password",
};

test("sign-up requires a non-empty trimmed name", () => {
  assert.equal(
    validateAuthForm("sign-up", { ...validFields, name: " \t " }),
    "name-required",
  );
});

test("sign-in does not require a name", () => {
  assert.equal(
    validateAuthForm("sign-in", { ...validFields, name: "" }),
    null,
  );
});

test("email must use a simple local@domain.tld shape", () => {
  for (const email of ["", "name", "name@example", "name @example.com"]) {
    assert.equal(
      validateAuthForm("sign-in", { ...validFields, email }),
      "invalid-email",
      email,
    );
  }
});

test("email is trimmed before validation", () => {
  assert.equal(
    validateAuthForm("sign-in", {
      ...validFields,
      email: "  xiaoming@example.com  ",
    }),
    null,
  );
});

test("password must contain at least eight characters", () => {
  assert.equal(
    validateAuthForm("sign-in", { ...validFields, password: "1234567" }),
    "password-too-short",
  );
  assert.equal(
    validateAuthForm("sign-in", { ...validFields, password: "12345678" }),
    null,
  );
});

test("sign-up validation order is name, email, then password", () => {
  assert.equal(
    validateAuthForm("sign-up", { name: "", email: "bad", password: "" }),
    "name-required",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "bad",
      password: "",
    }),
    "invalid-email",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "xiaoming@example.com",
      password: "",
    }),
    "password-too-short",
  );
});

test("valid sign-up fields pass validation", () => {
  assert.equal(validateAuthForm("sign-up", validFields), null);
});

test("existing-user error codes direct the user to sign in", () => {
  for (const code of [
    "USER_ALREADY_EXISTS",
    "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  ]) {
    assert.equal(
      getAuthErrorCode({ code }),
      "email-registered",
      code,
    );
  }
});

test("invalid-credential error code uses the credential message", () => {
  assert.equal(
    getAuthErrorCode({ code: "INVALID_EMAIL_OR_PASSWORD" }),
    "invalid-credentials",
  );
});

test("invalid-email error code uses the email validation message", () => {
  assert.equal(
    getAuthErrorCode({ code: "INVALID_EMAIL" }),
    "invalid-email",
  );
});

test("short-password error code uses the password validation message", () => {
  assert.equal(
    getAuthErrorCode({ code: "PASSWORD_TOO_SHORT" }),
    "password-too-short",
  );
});

test("Turnstile errors ask the user to repeat the security check", () => {
  for (const code of ["MISSING_RESPONSE", "VERIFICATION_FAILED", "UNKNOWN_ERROR"]) {
    assert.equal(
      getAuthErrorCode({ code }),
      "security-check-rejected",
    );
  }
});

test("missing and unknown errors use a stable safe fallback code", () => {
  for (const error of [
    undefined,
    null,
    {},
    { code: "UNKNOWN" },
    "INVALID_EMAIL",
  ]) {
    assert.equal(
      getAuthErrorCode(error),
      "sign-in-failed",
    );
  }
});

test("prototype property names are treated as unknown error codes", () => {
  for (const code of ["toString", "constructor", "__proto__"]) {
    const error = Object.assign(Object.create(null), { code });

    assert.equal(Object.hasOwn(error, "code"), true);
    assert.equal(
      getAuthErrorCode(error),
      "sign-in-failed",
      code,
    );
  }
});

test("server-supplied messages never become auth presentation copy", () => {
  assert.equal(
    getAuthErrorCode({ code: "UNRECOGNIZED", message: "SERVER COPY" }),
    "sign-in-failed",
  );
});
