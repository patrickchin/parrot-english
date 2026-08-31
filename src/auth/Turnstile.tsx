import { useEffect, useRef, useState } from "react";
import { AUTH_TURNSTILE_ACTION } from "../../lib/auth-captcha";

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  action: string;
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
  size: "compact" | "flexible";
  theme: "auto";
};

export type TurnstileApi = {
  remove(widgetId: string): void;
  render(
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ): string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let pendingTurnstile: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pendingTurnstile) return pendingTurnstile;

  pendingTurnstile = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-parrot-turnstile]",
    );
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize."));
    };
    const handleError = () => reject(new Error("Turnstile could not load."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.async = true;
      script.defer = true;
      script.dataset.parrotTurnstile = "";
      script.src = TURNSTILE_SCRIPT_URL;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    pendingTurnstile = null;
    throw error;
  });

  return pendingTurnstile;
}

export function TurnstileWidget({
  load = loadTurnstile,
  onTokenChange,
  siteKey,
}: {
  load?: () => Promise<TurnstileApi>;
  onTokenChange: (token: string | null) => void;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<
    "checking" | "complete" | "error" | "unavailable"
  >(siteKey ? "checking" : "unavailable");

  useEffect(() => {
    let active = true;
    let api: TurnstileApi | null = null;
    let widgetId: string | null = null;
    onTokenChange(null);

    if (!siteKey) {
      setStatus("unavailable");
      return;
    }

    setStatus("checking");
    void load()
      .then((turnstile) => {
        const container = containerRef.current;
        if (!active || !container) return;
        api = turnstile;
        widgetId = turnstile.render(container, {
          action: AUTH_TURNSTILE_ACTION,
          appearance: "interaction-only",
          callback: (token) => {
            if (!active) return;
            onTokenChange(token);
            setStatus("complete");
          },
          "error-callback": () => {
            if (!active) return;
            onTokenChange(null);
            setStatus("error");
          },
          "expired-callback": () => {
            if (!active) return;
            onTokenChange(null);
            setStatus("checking");
          },
          sitekey: siteKey,
          size: container.clientWidth < 300 ? "compact" : "flexible",
          theme: "auto",
        });
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
      if (api && widgetId) api.remove(widgetId);
    };
  }, [load, onTokenChange, siteKey]);

  const message =
    status === "complete"
      ? "Security check complete."
      : status === "checking"
        ? "Checking that you’re human…"
        : status === "unavailable"
          ? "Guest access and sign-up are temporarily unavailable."
          : "The security check could not load. Refresh and try again.";

  return (
    <div
      aria-label="Security check"
      className="grid min-w-0 max-w-full justify-items-stretch gap-1 overflow-hidden rounded-2xl bg-sky-50 p-2"
      role="group"
    >
      <div className="min-w-0 max-w-full" ref={containerRef} />
      <p
        aria-live="polite"
        className="m-0 text-center text-xs font-bold text-slate-600"
        role={status === "error" || status === "unavailable" ? "alert" : "status"}
      >
        {message}
      </p>
    </div>
  );
}
