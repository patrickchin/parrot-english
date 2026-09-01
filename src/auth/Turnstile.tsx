import { useEffect, useRef, useState } from "react";
import { CircleCheckBig, LoaderCircle, TriangleAlert } from "lucide-react";
import { AUTH_TURNSTILE_ACTION } from "../../lib/auth-captcha";
import { cx } from "../shared/ui";

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
      ? "Security check complete. Guest access is ready."
      : status === "checking"
        ? "Security check in progress. Please wait—guest access will unlock automatically."
        : status === "unavailable"
          ? "Guest access and sign-up are temporarily unavailable."
          : "The security check could not load. Refresh and try again.";

  return (
    <div
      aria-busy={status === "checking" || undefined}
      aria-label="Security check"
      className={cx(
        "grid min-w-0 max-w-full justify-items-stretch gap-2 overflow-hidden rounded-2xl border-3 px-3 py-3 shadow-sm transition-colors",
        status === "checking" && "border-amber-400 bg-amber-50 text-amber-950",
        status === "complete" &&
          "border-emerald-300 bg-emerald-50 text-emerald-900",
        (status === "error" || status === "unavailable") &&
          "border-rose-300 bg-rose-50 text-red-900",
      )}
      role="group"
    >
      <div className="min-w-0 max-w-full" ref={containerRef} />
      <p
        aria-atomic="true"
        aria-live="polite"
        className="m-0 inline-flex min-h-10 items-center justify-center gap-3 text-center text-sm font-black leading-snug sm:text-base"
        role={status === "error" || status === "unavailable" ? "alert" : "status"}
      >
        {status === "checking" ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-7 shrink-0 animate-spin text-amber-700 motion-reduce:animate-none"
            strokeWidth={3}
          />
        ) : status === "complete" ? (
          <CircleCheckBig
            aria-hidden="true"
            className="size-7 shrink-0 text-emerald-700"
            strokeWidth={3}
          />
        ) : (
          <TriangleAlert
            aria-hidden="true"
            className="size-7 shrink-0"
            strokeWidth={3}
          />
        )}
        <span>{message}</span>
      </p>
    </div>
  );
}
