import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthErrorMessage,
  validateAuthForm,
} from "../src/auth-form.ts";

const validFields = {
  name: "小明",
  email: "xiaoming@example.com",
  password: "password",
};

test("sign-up requires a non-empty trimmed name", () => {
  assert.equal(
    validateAuthForm("sign-up", { ...validFields, name: " \t " }),
    "Enter your name.",
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
      "Enter a valid email address.",
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
    "Password must be at least 8 characters.",
  );
  assert.equal(
    validateAuthForm("sign-in", { ...validFields, password: "12345678" }),
    null,
  );
});

test("sign-up validation order is name, email, then password", () => {
  assert.equal(
    validateAuthForm("sign-up", { name: "", email: "bad", password: "" }),
    "Enter your name.",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "bad",
      password: "",
    }),
    "Enter a valid email address.",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "xiaoming@example.com",
      password: "",
    }),
    "Password must be at least 8 characters.",
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
      getAuthErrorMessage({ code }),
      "This email is already registered. Sign in instead.",
      code,
    );
  }
});

test("invalid-credential error code uses the credential message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }),
    "The email or password is incorrect.",
  );
});

test("invalid-email error code uses the email validation message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "INVALID_EMAIL" }),
    "Enter a valid email address.",
  );
});

test("short-password error code uses the password validation message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "PASSWORD_TOO_SHORT" }),
    "Password must be at least 8 characters.",
  );
});

test("missing and unknown errors use a safe fallback", () => {
  for (const error of [
    undefined,
    null,
    {},
    { code: "UNKNOWN" },
    "INVALID_EMAIL",
  ]) {
    assert.equal(
      getAuthErrorMessage(error),
      "Unable to sign you in. Please try again.",
    );
  }
});

test("prototype property names are treated as unknown error codes", () => {
  for (const code of ["toString", "constructor", "__proto__"]) {
    const error = Object.assign(Object.create(null), { code });

    assert.equal(Object.hasOwn(error, "code"), true);
    assert.equal(
      getAuthErrorMessage(error),
      "Unable to sign you in. Please try again.",
      code,
    );
  }
});
