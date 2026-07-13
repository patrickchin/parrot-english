import {
  ArrowLeft,
  Flag,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { HeaderButton, RouteHeader } from "../app/AppHeader";
import { formatResponseLatency } from "./response-latency";
import type { ConversationPurpose } from "../../lib/conversation-purpose";
import { ActionButton, cx, IconButton } from "../shared/ui";

export type ConversationSurfaceStatus =
  | "ready"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "error"
  | "saving";

export type ConversationSurfaceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ConversationSurfaceProps = {
  error: string;
  liveTranscript: string;
  microphoneEnabled: boolean;
  onBack: () => void;
  onFinish: () => void;
  onRepeatAudio: () => void;
  onStart: () => void;
  onToggleMicrophone: () => void;
  purpose: ConversationPurpose;
  responseLatencyMs: number | null;
  status: ConversationSurfaceStatus;
  turns: ConversationSurfaceTurn[];
};

const STATUS_LABELS: Record<
  Exclude<ConversationSurfaceStatus, "ready">,
  string
> = {
  connecting: "Joining Peppa…",
  listening: "Listening — take your time",
  thinking: "Peppa is thinking…",
  speaking: "Peppa is talking",
  reconnecting: "Reconnecting… your answers are safe",
  error: "The voice room took a break",
  saving: "Saving your profile…",
};

const PEPPA_ASSETS: Record<ConversationSurfaceStatus, string> = {
  ready: "/assets/characters/peppa/peppa-happy.webp",
  connecting: "/assets/characters/peppa/peppa-happy.webp",
  listening: "/assets/characters/peppa/peppa-listening.webp",
  thinking: "/assets/characters/peppa/peppa-listening.webp",
  speaking: "/assets/characters/peppa/peppa-talking.webp",
  reconnecting: "/assets/characters/peppa/peppa-surprised.webp",
  error: "/assets/characters/peppa/peppa-sad.webp",
  saving: "/assets/characters/peppa/peppa-happy.webp",
};

function latestAssistantSpeech(turns: ConversationSurfaceTurn[]) {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role === "assistant") return turns[index].text;
  }
  return null;
}

function isInteractiveSpaceTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest(
      "button, input, textarea, select, [contenteditable='true'], [role='button']",
    ),
  );
}

function ConversationHeader({ onBack }: { onBack: () => void }) {
  return (
    <RouteHeader>
      <HeaderButton
        aria-label="Back"
        icon={<ArrowLeft />}
        onClick={onBack}
        type="button"
      >
        Back
      </HeaderButton>
    </RouteHeader>
  );
}

function ConversationScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid h-dvh w-full justify-items-center overflow-y-auto bg-conversation px-4 pb-4 pt-24 short:px-2.5 short:pb-2.5 short:pt-20 md:px-11 md:pb-11 md:pt-28">
      {children}
    </main>
  );
}

function ConversationSpeech({
  children,
  live = false,
  onRepeatAudio,
  repeatDisabled = false,
}: {
  children: ReactNode;
  live?: boolean;
  onRepeatAudio?: () => void;
  repeatDisabled?: boolean;
}) {
  return (
    <div
      aria-label={onRepeatAudio ? "Peppa's message" : undefined}
      className={cx(
        "relative w-11/12 max-w-lg rounded-3xl border-4 border-white bg-white p-4 text-center text-xl font-black leading-snug text-brand-ink shadow-control-surface after:absolute after:-bottom-3 after:left-1/2 after:size-6 after:-translate-x-1/2 after:rotate-45 after:bg-white short:p-3 short:text-base sm:p-5 sm:text-2xl",
        onRepeatAudio && "min-h-16",
      )}
      role={onRepeatAudio ? "group" : undefined}
    >
      <p
        aria-live={live ? "polite" : undefined}
        className={cx("m-0", onRepeatAudio && "mr-14")}
      >
        {children}
      </p>
      {onRepeatAudio ? (
        <IconButton
          aria-label="Repeat Peppa's audio"
          className="absolute bottom-2 right-2"
          disabled={repeatDisabled}
          onClick={onRepeatAudio}
          type="button"
          variant="brand"
        >
          <Volume2 aria-hidden="true" className="size-6" />
        </IconButton>
      ) : null}
    </div>
  );
}

function ConversationCharacter({ alt, src }: { alt: string; src: string }) {
  return (
    <img
      alt={alt}
      className="max-h-96 w-64 animate-float object-contain drop-shadow-lg motion-reduce:animate-none short:max-h-52 short:w-40 sm:w-80 lg:w-96"
      src={src}
    />
  );
}

export function ConversationSurface({
  error,
  liveTranscript,
  microphoneEnabled,
  onBack,
  onFinish,
  onRepeatAudio,
  onStart,
  onToggleMicrophone,
  purpose,
  responseLatencyMs = null,
  status,
  turns,
}: ConversationSurfaceProps) {
  const saving = status === "saving";
  const joining = status === "connecting";
  const thinking = status === "thinking";
  const turnControlAvailable =
    !saving && !joining && !thinking && status !== "error";

  useEffect(() => {
    if (!turnControlAvailable) return;

    function toggleTurnWithSpace(event: KeyboardEvent) {
      if (
        event.repeat ||
        (event.code !== "Space" && event.key !== " ") ||
        isInteractiveSpaceTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      onToggleMicrophone();
    }

    window.addEventListener("keydown", toggleTurnWithSpace);
    return () => window.removeEventListener("keydown", toggleTurnWithSpace);
  }, [onToggleMicrophone, turnControlAvailable]);

  if (status === "ready") {
    return (
      <ConversationScreen>
        <ConversationHeader onBack={onBack} />
        <section className="grid w-full max-w-3xl justify-items-center gap-3 bg-transparent p-2 text-center md:p-5">
          <h1 className="sr-only">Chat with Peppa</h1>
          <div className="grid w-full place-items-center gap-4 short:gap-3 md:gap-6">
            <ConversationSpeech>Getting our chat ready…</ConversationSpeech>
            <ConversationCharacter
              alt="Peppa smiling"
              src={PEPPA_ASSETS.ready}
            />
          </div>
        </section>
      </ConversationScreen>
    );
  }

  const assistantSpeech = latestAssistantSpeech(turns);
  const savingMessage =
    purpose === "small-chat"
      ? "That was fun! See you next time."
      : "Lovely chat! I'll remember that.";
  const speech = assistantSpeech ??
    (joining
      ? "Almost ready!"
      : saving
        ? savingMessage
        : "I'm listening!");
  return (
    <ConversationScreen>
      <ConversationHeader onBack={onBack} />
      <section className="my-auto grid w-full max-w-3xl justify-items-center gap-3 bg-transparent p-2 short:p-3 md:p-5">
        <div className="grid w-full place-items-center gap-4 short:gap-3 md:gap-6">
          <ConversationSpeech
            live
            onRepeatAudio={assistantSpeech ? onRepeatAudio : undefined}
            repeatDisabled={
              status !== "listening" || microphoneEnabled
            }
          >
            {speech}
          </ConversationSpeech>
          <figure className="relative m-0">
            <ConversationCharacter
              alt="Peppa"
              src={PEPPA_ASSETS[status]}
            />
            {thinking || responseLatencyMs !== null ? (
              <output
                aria-label="Peppa response latency"
                aria-live="polite"
                className="pointer-events-none absolute bottom-2 right-2 whitespace-nowrap rounded-full border-2 border-white/80 bg-brand-ink/90 px-2.5 py-1 text-xs font-black text-white shadow-sm"
                title="Time from ending your turn until Peppa starts speaking"
              >
                {responseLatencyMs === null
                  ? "Timing…"
                  : `Reply: ${formatResponseLatency(responseLatencyMs)}`}
              </output>
            ) : null}
          </figure>
        </div>

        {joining ? (
          <div
            aria-live="assertive"
            className="flex w-full max-w-xl items-center justify-center gap-4 rounded-3xl border-4 border-white bg-brand-ink px-5 py-4 text-left text-white shadow-control-navy"
            role="status"
          >
            <span
              aria-hidden="true"
              className="size-10 shrink-0 animate-spin rounded-full border-4 border-white/35 border-t-brand-yellow motion-reduce:animate-none"
            />
            <span className="grid gap-1">
              <strong className="text-xl leading-tight sm:text-2xl">
                {STATUS_LABELS.connecting}
              </strong>
              <span className="text-sm font-bold leading-snug sm:text-base">
                Please wait until Peppa says hello before you start talking.
              </span>
            </span>
          </div>
        ) : !thinking ? (
          <p
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            {saving && purpose === "small-chat"
              ? "Finishing your chat…"
              : STATUS_LABELS[status]}
          </p>
        ) : null}

        {microphoneEnabled || liveTranscript ? (
          <output
            aria-label="Live transcript"
            aria-live="polite"
            className="grid w-full max-w-xl gap-1 rounded-3xl border-4 border-white/80 bg-white/80 px-5 py-3 text-center text-brand-ink shadow-control-surface"
          >
            <span className="text-sm font-black uppercase tracking-wide opacity-75">
              {microphoneEnabled ? "You’re saying" : "You said"}
            </span>
            <span className="min-h-7 text-lg font-black leading-snug sm:text-xl">
              {liveTranscript || "Listening for your words…"}
            </span>
          </output>
        ) : null}
        {error ? (
          <p
            className="m-0 w-full max-w-xl rounded-2xl bg-rose-100 px-4 py-2.5 text-center font-extrabold text-rose-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!saving && !joining ? (
          <div className="grid w-full max-w-xl justify-items-center gap-3">
            {status === "error" ? (
              <ActionButton
                onClick={onStart}
                size="large"
                type="button"
              >
                <RotateCcw aria-hidden="true" />
                Try again
              </ActionButton>
            ) : thinking ? (
              <ActionButton
                aria-label="Waiting for Peppa's reply"
                disabled
                size="large"
                type="button"
                variant="surface"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                <span
                  aria-live="polite"
                  className="grid justify-items-start leading-tight"
                  role="status"
                >
                  <strong>{STATUS_LABELS.thinking}</strong>
                  <small className="mt-1 text-xs font-bold opacity-85">
                    Getting her reply ready
                  </small>
                </span>
              </ActionButton>
            ) : (
              <ActionButton
                aria-keyshortcuts="Space"
                aria-pressed={microphoneEnabled}
                onClick={onToggleMicrophone}
                size="large"
                type="button"
                variant={microphoneEnabled ? "brand" : "success"}
              >
                {microphoneEnabled ? (
                  <MicOff aria-hidden="true" />
                ) : (
                  <Mic aria-hidden="true" />
                )}
                <span className="grid justify-items-start leading-tight">
                  <strong>
                    {microphoneEnabled ? "End my turn" : "Start my turn"}
                  </strong>
                  <small className="mt-1 text-xs font-bold opacity-85">
                    Click or press Space
                  </small>
                </span>
              </ActionButton>
            )}

            <ActionButton
              onClick={onFinish}
              size="large"
              type="button"
              variant="surface"
            >
              <Flag aria-hidden="true" />
              Finish conversation
            </ActionButton>
          </div>
        ) : null}
      </section>
    </ConversationScreen>
  );
}
