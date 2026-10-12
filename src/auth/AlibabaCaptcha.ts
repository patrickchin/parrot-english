import type { TurnstileApi } from "./Turnstile";

type CaptchaInstance = { hide(): void };
type AlibabaCaptchaOptions = {
  SceneId: string;
  mode: "embed";
  element: string;
  button: string;
  language: string;
  rem: number;
  success: (token: string) => void;
  fail: () => void;
  onError: () => void;
  getInstance: (instance: CaptchaInstance) => void;
};

declare global {
  interface Window {
    AliyunCaptchaConfig?: { region: "cn"; prefix: string };
    initAliyunCaptcha?: (options: AlibabaCaptchaOptions) => void;
  }
}

let pendingScript: Promise<void> | null = null;

export async function loadAlibabaCaptcha(): Promise<TurnstileApi> {
  const prefix = import.meta.env.VITE_ALIYUN_CAPTCHA_PREFIX;
  if (!prefix) throw new Error("Alibaba CAPTCHA prefix is required.");
  window.AliyunCaptchaConfig = { region: "cn", prefix };
  if (!window.initAliyunCaptcha) {
    pendingScript ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src =
        "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";
      script.onload = () =>
        window.initAliyunCaptcha
          ? resolve()
          : reject(new Error("CAPTCHA did not initialize."));
      script.onerror = () => {
        script.remove();
        reject(new Error("CAPTCHA could not load."));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      pendingScript = null;
      throw error;
    });
    await pendingScript;
  }
  return createAlibabaCaptchaAdapter(window.initAliyunCaptcha!);
}

// Reuse the existing security-check UI and token lifecycle for the China provider.
export function createAlibabaCaptchaAdapter(
  initialize: NonNullable<Window["initAliyunCaptcha"]>,
): TurnstileApi {
  const removals = new Map<string, () => void>();
  return {
    render(container, options) {
      const id = `parrot-captcha-${crypto.randomUUID()}`;
      container.id = id;
      let active = true;
      let expiry: number | undefined;
      let instance: CaptchaInstance | undefined;
      const initializeWidget = () => {
        if (!active) return;
        instance?.hide();
        container.replaceChildren();
        initialize({
          SceneId: options.sitekey,
          mode: "embed",
          element: `#${id}`,
          button: `#${id}`,
          language: document.documentElement.lang.startsWith("zh")
            ? "cn"
            : "en",
          rem: Math.min(1, (container.clientWidth || 360) / 360),
          getInstance: (value) => {
            instance = value;
            if (!active) value.hide();
          },
          success: (token) => {
            if (!active) return;
            if (typeof token !== "string" || !token || token.length > 16384) {
              options["error-callback"]();
              return;
            }
            window.clearTimeout(expiry);
            options.callback(token);
            // Alibaba V3 tokens expire in 90 seconds. Refresh before that deadline.
            expiry = window.setTimeout(() => {
              if (!active) return;
              options["expired-callback"]();
              initializeWidget();
            }, 80000);
          },
          fail: () => {
            if (active) options["error-callback"]();
          },
          onError: () => {
            if (active) options["error-callback"]();
          },
        });
      };
      removals.set(id, () => {
        active = false;
        window.clearTimeout(expiry);
        instance?.hide();
        container.replaceChildren();
      });
      try {
        initializeWidget();
      } catch {
        removals.get(id)!();
        removals.delete(id);
        throw new Error("CAPTCHA initialization failed.");
      }
      return id;
    },
    remove(id) {
      removals.get(id)?.();
      removals.delete(id);
    },
  };
}
