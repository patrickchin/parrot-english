import CaptchaSdk from "@alicloud/captcha20230305";
import OpenApi from "@alicloud/openapi-core";
import Credentials from "@alicloud/credentials";

export async function verifyAlibabaCaptcha(sceneId, token, client = new CaptchaSdk.default(new OpenApi.$OpenApiUtil.Config({
  credential: new Credentials.default(), endpoint: "captcha.cn-shanghai.aliyuncs.com",
}))) {
  // FC injects temporary credentials for its narrowly scoped runtime role.
  const response = await client.verifyIntelligentCaptchaWithOptions(
    new CaptchaSdk.VerifyIntelligentCaptchaRequest({ sceneId, captchaVerifyParam: token }),
    { connectTimeout: 2000, readTimeout: 4000, autoretry: false },
  );
  const body = response.body;
  // T005 is a console test-mode pass, which must never authorize an account.
  return body?.success === true && body.result?.verifyResult === true && body.result.verifyCode === "T001";
}

export function createAlibabaCaptchaPlugin(sceneId, verify = verifyAlibabaCaptcha) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sceneId ?? "")) throw new Error("Alibaba CAPTCHA scene is required.");
  const failure = (code, status) => ({ response: Response.json({ code, message: "Security check required. Please try again." },
    { status, headers: { "Cache-Control": "no-store" } }) });
  return {
    id: "alibaba-captcha",
    async onRequest(request) {
      let path;
      try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "").toLowerCase(); }
      catch { return failure("MISSING_RESPONSE", 400); }
      if (!/\/(sign-up\/email|sign-in\/shared-guest)$/.test(path)) return;
      const token = request.headers.get("x-captcha-response");
      if (!token || token.length > 16384) return failure("MISSING_RESPONSE", 400);
      try {
        if (await verify(sceneId, token) !== true) return failure("VERIFICATION_FAILED", 403);
      } catch {
        // Keep registration fail-closed on timeouts and service errors. No token logs.
        return failure("UNKNOWN_ERROR", 503);
      }
    },
  };
}
