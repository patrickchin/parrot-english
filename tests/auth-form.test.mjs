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
    "请输入名字。",
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
      "请输入有效的邮箱地址。",
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
    "密码至少需要 8 个字符。",
  );
  assert.equal(
    validateAuthForm("sign-in", { ...validFields, password: "12345678" }),
    null,
  );
});

test("sign-up validation order is name, email, then password", () => {
  assert.equal(
    validateAuthForm("sign-up", { name: "", email: "bad", password: "" }),
    "请输入名字。",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "bad",
      password: "",
    }),
    "请输入有效的邮箱地址。",
  );
  assert.equal(
    validateAuthForm("sign-up", {
      name: "小明",
      email: "xiaoming@example.com",
      password: "",
    }),
    "密码至少需要 8 个字符。",
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
      "这个邮箱已经注册，请直接登录。",
      code,
    );
  }
});

test("invalid-credential error code uses the credential message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }),
    "邮箱或密码不正确。",
  );
});

test("invalid-email error code uses the email validation message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "INVALID_EMAIL" }),
    "请输入有效的邮箱地址。",
  );
});

test("short-password error code uses the password validation message", () => {
  assert.equal(
    getAuthErrorMessage({ code: "PASSWORD_TOO_SHORT" }),
    "密码至少需要 8 个字符。",
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
      "暂时无法登录，请稍后再试。",
    );
  }
});

test("prototype property names are treated as unknown error codes", () => {
  for (const code of ["toString", "constructor", "__proto__"]) {
    const error = Object.assign(Object.create(null), { code });

    assert.equal(Object.hasOwn(error, "code"), true);
    assert.equal(
      getAuthErrorMessage(error),
      "暂时无法登录，请稍后再试。",
      code,
    );
  }
});
